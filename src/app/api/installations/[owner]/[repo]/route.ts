import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GitHubError,
  deleteFile,
  getContentMeta,
  listIssueComments,
  listOpenPullRequests,
  listWorkflowRuns,
  mapLimit,
  putFile,
} from "@/lib/github";
import { getInstalledRepo } from "@/lib/installations";
import { setRepoSecret } from "@/lib/githubSecrets";
import {
  CONFIG_PATH,
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

// PATCH — change coverage thresholds / triggers (re-commit config_cov.json, and
// the workflow too when the trigger shape changed). Optionally refresh a secret.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const body = (await req.json().catch(() => null)) as {
    coverage?: unknown;
    triggers?: unknown;
    geminiApiKey?: string;
    sonarToken?: string;
  } | null;

  const coverage = normalizeCoverageConfig(body?.coverage ?? record.coverage);
  const triggers = normalizeTriggers(body?.triggers ?? record.triggers);
  const branch = record.defaultBranch;

  const triggersChanged =
    JSON.stringify(record.triggers.branches) !== JSON.stringify(triggers.branches) ||
    JSON.stringify(record.triggers.events) !== JSON.stringify(triggers.events);

  try {
    const configMeta = await getContentMeta(token, owner, repo, CONFIG_PATH, branch);
    await putFile(token, owner, repo, CONFIG_PATH, {
      message: "Update Quality Gate coverage config",
      contentUtf8: buildCoverageConfigJson(coverage),
      sha: configMeta?.sha,
      branch,
    });

    if (triggersChanged) {
      const workflowMeta = await getContentMeta(token, owner, repo, WORKFLOW_PATH, branch);
      await putFile(token, owner, repo, WORKFLOW_PATH, {
        message: "Update Quality Gate workflow triggers",
        contentUtf8: buildWorkflowYaml(triggers),
        sha: workflowMeta?.sha,
        branch,
      });
    }

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

// DELETE — remove both files from the repo.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;
  const branch = record.defaultBranch;

  try {
    for (const p of [WORKFLOW_PATH, CONFIG_PATH]) {
      const meta = await getContentMeta(token, owner, repo, p, branch);
      if (meta) {
        await deleteFile(token, owner, repo, p, {
          message: `Remove Quality Gate ${p === WORKFLOW_PATH ? "workflow" : "config"}`,
          sha: meta.sha,
          branch,
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GitHubError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
