import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GitHubError,
  deleteFile,
  getContentMeta,
  listWorkflowRuns,
  putFile,
} from "@/lib/github";
import {
  deleteInstallation,
  getInstallation,
  ownsInstallation,
  saveInstallation,
} from "@/lib/installations";
import {
  buildConfigJson,
  buildWorkflowYaml,
  normalizeGateConfig,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

async function guard(ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.login || !session.accessToken) {
    return { error: NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 }) };
  }
  const { owner, repo } = await ctx.params;
  const record = await getInstallation(owner, repo);
  if (!record || !ownsInstallation(record, session.user.login)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { session, token: session.accessToken, owner, repo, record };
}

// GET — the record, the workflow's recent runs, and a drift check.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const workflowFile = record.workflowPath.split("/").pop() || "quality-gate.yml";
  const [runs, workflowMeta, configMeta] = await Promise.all([
    listWorkflowRuns(token, owner, repo, workflowFile, 20).catch(() => []),
    getContentMeta(token, owner, repo, record.workflowPath, record.defaultBranch).catch(() => null),
    getContentMeta(token, owner, repo, record.configPath, record.defaultBranch).catch(() => null),
  ]);

  const state = workflowMeta && configMeta ? "ok" : "files-missing";
  return NextResponse.json({ record, runs, state });
}

// PATCH — reconfigure thresholds / triggers (re-commit the config, and the
// workflow too when the trigger shape changed).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const body = (await req.json().catch(() => null)) as { config?: unknown } | null;
  const config = normalizeGateConfig(body?.config ?? record.config);
  const branch = record.defaultBranch;

  const triggersChanged =
    JSON.stringify(record.config.branches) !== JSON.stringify(config.branches) ||
    JSON.stringify(record.config.events) !== JSON.stringify(config.events);

  try {
    const configMeta = await getContentMeta(token, owner, repo, record.configPath, branch);
    await putFile(token, owner, repo, record.configPath, {
      message: "Update Quality Gate config",
      contentUtf8: buildConfigJson(config),
      sha: configMeta?.sha,
      branch,
    });

    if (triggersChanged) {
      const workflowMeta = await getContentMeta(token, owner, repo, record.workflowPath, branch);
      await putFile(token, owner, repo, record.workflowPath, {
        message: "Update Quality Gate workflow triggers",
        contentUtf8: buildWorkflowYaml(config),
        sha: workflowMeta?.sha,
        branch,
      });
    }

    const updated = { ...record, config, updatedAt: new Date().toISOString() };
    await saveInstallation(updated);
    return NextResponse.json(updated);
  } catch (e) {
    return installError(e);
  }
}

// DELETE — remove both files from the repo, then forget the installation.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;
  const branch = record.defaultBranch;

  try {
    for (const p of [record.workflowPath, record.configPath]) {
      const meta = await getContentMeta(token, owner, repo, p, branch);
      if (meta) {
        await deleteFile(token, owner, repo, p, {
          message: `Remove ${p === record.workflowPath ? "Quality Gate workflow" : "Quality Gate config"}`,
          sha: meta.sha,
          branch,
        });
      }
    }
    await deleteInstallation(owner, repo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GitHubError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
