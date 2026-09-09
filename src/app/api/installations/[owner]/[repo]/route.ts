import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GitHubError,
  commitFiles,
  deleteFiles,
  getContentMeta,
  getFileText,
  listIssueComments,
  listOpenPullRequests,
  listWorkflowRuns,
  mapLimit,
} from "@/lib/github";
import { getInstalledRepo } from "@/lib/installations";
import { setRepoSecret } from "@/lib/githubSecrets";
import {
  CONFIG_PATH,
  LEGACY_PATHS,
  MANAGED_PATHS,
  SONAR_PROPS_PATH,
  WORKFLOW_PATH,
  buildCoverageConfigJson,
  buildSonarPropertiesFile,
  buildWorkflowYaml,
  normalizeCoverageConfig,
  normalizeSonarOrg,
  normalizeTriggers,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";
import type { GatePrResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

const WORKFLOW_FILE = WORKFLOW_PATH.split("/").pop() || "quality-gate.yml";
const GATE_COMMENT_MARKER = "AI-Powered Quality Gate Report";

async function guard(ctx: Ctx) {
  const session = await auth();
  if (!session?.accessToken) {
    return { error: NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 }) };
  }
  const { owner, repo } = await ctx.params;
  const record = await getInstalledRepo(session.accessToken, owner, repo).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  });
  if (!record) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { token: session.accessToken, owner, repo, record };
}

/** Parse the PASS / FAIL / SKIPPED verdict out of a posted gate report. */
function verdictFromReport(markdown: string | null): GatePrResult["reportVerdict"] {
  if (!markdown) return null;
  if (/Result:\s*✅\s*PASS\s*\(Skipped\)/i.test(markdown) || /checks were skipped/i.test(markdown)) {
    return "skipped";
  }
  if (/Overall Result:\s*✅\s*PASS/i.test(markdown) || /Overall Result:\s*PASS/i.test(markdown)) {
    return "pass";
  }
  if (/Overall Result:\s*❌\s*FAIL/i.test(markdown) || /Overall Result:\s*FAIL/i.test(markdown)) {
    return "fail";
  }
  return null;
}

/** For each open PR: its latest gate run and the report comment the action posted. */
async function gatePrResults(
  token: string,
  owner: string,
  repo: string,
): Promise<GatePrResult[]> {
  const [pulls, runs] = await Promise.all([
    listOpenPullRequests(token, owner, repo, 20).catch(() => []),
    listWorkflowRuns(token, owner, repo, WORKFLOW_FILE, 50).catch(() => []),
  ]);

  const runBySha = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (!runBySha.has(r.headSha)) runBySha.set(r.headSha, r);
  }

  return mapLimit(pulls, 6, async (pr) => {
    const run = runBySha.get(pr.headSha) ?? null;

    let reportMarkdown: string | null = null;
    let reportedAt: string | null = null;
    try {
      const comments = await listIssueComments(token, owner, repo, pr.number);
      const gate = [...comments].reverse().find((c) => c.body.includes(GATE_COMMENT_MARKER));
      if (gate) {
        reportMarkdown = gate.body;
        reportedAt = gate.updatedAt || gate.createdAt;
      }
    } catch {
      /* comments unreadable — leave report null */
    }

    return {
      pr,
      runStatus: run?.status ?? null,
      runConclusion: run?.conclusion ?? null,
      runHtmlUrl: run?.htmlUrl ?? null,
      reportMarkdown,
      reportedAt,
      reportVerdict: verdictFromReport(reportMarkdown),
    } satisfies GatePrResult;
  });
}

// GET — the installation record, recent workflow runs, and per-PR gate results.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const [runs, pulls] = await Promise.all([
    listWorkflowRuns(token, owner, repo, WORKFLOW_FILE, 20).catch(() => []),
    gatePrResults(token, owner, repo),
  ]);

  return NextResponse.json({ record, runs, pulls });
}

// PATCH — change coverage / triggers. Always re-commits config_cov.json and the
// workflow (idempotent, tiny) so console template updates reach existing
// installs on any Save. Optionally refreshes a secret. All writes land in one commit.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const body = (await req.json().catch(() => null)) as {
    coverage?: unknown;
    triggers?: unknown;
    geminiApiKey?: string;
    sonarToken?: string;
    sonarOrg?: string;
    openTestsPr?: boolean;
  } | null;

  const coverage = normalizeCoverageConfig(body?.coverage ?? record.coverage);
  const triggers = normalizeTriggers(body?.triggers ?? record.triggers);
  const branch = record.defaultBranch;

  try {
    // Preserve the companion-PR setting across plain saves: honor an explicit
    // body flag, else read it back from the currently committed workflow.
    const currentWorkflow = await getFileText(token, owner, repo, WORKFLOW_PATH, branch).catch(
      () => null,
    );
    const openTestsPr =
      body?.openTestsPr ?? /open_tests_pr:\s*["']?true/i.test(currentWorkflow ?? "");

    const files = [
      { path: WORKFLOW_PATH, contentUtf8: buildWorkflowYaml(triggers, { openTestsPr }) },
      { path: CONFIG_PATH, contentUtf8: buildCoverageConfigJson(coverage) },
    ];

    // Keep sonar-project.properties in sync when it already exists, or add it
    // now if this Save supplies a SonarCloud org. The org is taken from the
    // request, falling back to whatever the committed file already declares.
    const existingProps = await getFileText(token, owner, repo, SONAR_PROPS_PATH, branch).catch(
      () => null,
    );
    const orgFromFile = existingProps?.match(/^\s*sonar\.organization\s*=\s*(\S+)/m)?.[1] ?? "";
    const sonarOrg = normalizeSonarOrg(body?.sonarOrg || orgFromFile);
    if (sonarOrg && (existingProps != null || body?.sonarOrg)) {
      files.push({ path: SONAR_PROPS_PATH, contentUtf8: buildSonarPropertiesFile(sonarOrg, repo) });
    }

    await commitFiles(token, owner, repo, branch, files, "Update Automated Quality Gate");

    const warnings: string[] = [];
    for (const [name, value] of [
      ["GEMINI_API_KEY", (body?.geminiApiKey ?? "").trim()],
      ["SONAR_TOKEN", (body?.sonarToken ?? "").trim()],
    ] as const) {
      if (!value) continue;
      try {
        await setRepoSecret(token, owner, repo, name, value);
      } catch (e) {
        warnings.push(`Could not update the ${name} secret (${(e as Error).message}).`);
      }
    }

    const updated = await getInstalledRepo(token, owner, repo);
    return NextResponse.json({ record: updated, warnings });
  } catch (e) {
    return installError(e);
  }
}

// DELETE — remove every file the console manages, in one commit.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;
  const branch = record.defaultBranch;

  try {
    const present: string[] = [];
    await Promise.all(
      [...MANAGED_PATHS, ...LEGACY_PATHS].map(async (p) => {
        const meta = await getContentMeta(token, owner, repo, p, branch).catch(() => null);
        if (meta) present.push(p);
      }),
    );
    await deleteFiles(token, owner, repo, branch, present, "Remove Automated Quality Gate");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GitHubError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
