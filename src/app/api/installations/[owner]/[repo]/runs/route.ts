import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, deleteWorkflowRun, listWorkflowRuns, mapLimit } from "@/lib/github";
import { WORKFLOW_PATH } from "@/lib/workflowTemplate";

// "Clear history" on the detail page's run table. Runs live on GitHub, not in
// any local store, so "clearing" means actually deleting them (and their logs)
// through the Actions API — there's nothing else to clear.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

const WORKFLOW_FILE = WORKFLOW_PATH.split("/").pop() || "quality-gate.yml";

// DELETE /api/installations/:owner/:repo/runs        — clear all completed gate runs
// DELETE /api/installations/:owner/:repo/runs?id=123 — delete just that run
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const token = session.accessToken;
  const { owner, repo } = await ctx.params;
  const one = req.nextUrl.searchParams.get("id");

  try {
    if (one) {
      const id = Number(one);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: "bad run id" }, { status: 400 });
      }
      await deleteWorkflowRun(token, owner, repo, id);
      return NextResponse.json({ deleted: 1, skipped: 0, failed: 0 });
    }

    // Clear all: only runs that have finished (GitHub 409s on in-progress ones).
    const runs = await listWorkflowRuns(token, owner, repo, WORKFLOW_FILE, 100);
    const finished = runs.filter((r) => r.status === "completed");
    const skipped = runs.length - finished.length;

    let failed = 0;
    await mapLimit(finished, 6, async (r) => {
      try {
        await deleteWorkflowRun(token, owner, repo, r.id);
      } catch {
        failed++;
      }
    });

    return NextResponse.json({ deleted: finished.length - failed, skipped, failed });
  } catch (e) {
    if (e instanceof GitHubError) {
      const msg =
        e.status === 403
          ? "Deleting workflow runs needs write access to the repository."
          : e.message;
      return NextResponse.json({ error: msg }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
