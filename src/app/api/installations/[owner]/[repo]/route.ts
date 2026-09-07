import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GitHubError,
  commitFiles,
  deleteFiles,
  getContentMeta,
  listIssueComments,
  listOpenPullRequests,
  listWorkflowRuns,
  mapLimit,
} from "@/lib/github";
import { getInstalledRepo } from "@/lib/installations";
import { setRepoSecret } from "@/lib/githubSecrets";
import { readVendoredAction } from "@/lib/qgAction";
import {
  CONFIG_PATH,
  MANAGED_PATHS,
  WORKFLOW_PATH,
  buildCoverageConfigJson,
  buildWorkflowYaml,
  normalizeCoverageConfig,
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

// PATCH — change coverage / triggers (re-commit config_cov.json, plus the
// workflow when triggers changed), repair the action files if they drifted, and
// optionally refresh a secret. All file writes land in one commit.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const body = (await req.json().catch(() => null)) as {
    coverage?: unknown;
    triggers?: unknown;
    geminiApiKey?: string;
    sonarToken?: string;
    repairAction?: boolean;
  } | null;

  const coverage = normalizeCoverageConfig(body?.coverage ?? record.coverage);
  const triggers = normalizeTriggers(body?.triggers ?? record.triggers);
  const branch = record.defaultBranch;

  try {
    // Always rewrite the workflow + config (idempotent, tiny) so template
    // changes reach existing installs on any Save. Re-commit the action bundle
    // too when it has drifted or a repair was asked for.
    const files: { path: string; contentUtf8: string }[] = [
      { path: WORKFLOW_PATH, contentUtf8: buildWorkflowYaml(triggers) },
      { path: CONFIG_PATH, contentUtf8: buildCoverageConfigJson(coverage) },
    ];
    if (body?.repairAction || !record.hasAction) {
      files.push(...(await readVendoredAction()));
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
      MANAGED_PATHS.map(async (p) => {
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
