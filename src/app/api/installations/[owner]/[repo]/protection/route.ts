import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  GitHubError,
  getRepo,
  getRequiredCheckState,
  requireStatusCheck,
  unrequireStatusCheck,
} from "@/lib/github";
import { GATE_CHECK_CONTEXT } from "@/lib/workflowTemplate";

// "Merge protection" toggle on the install wizard / detail page. Split out of
// the main [owner]/[repo] route because it's a branch-protection concern, not
// a file/secret one, and DELETE here means "stop requiring the check" —
// distinct from that route's DELETE, which uninstalls the whole gate.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

async function guard(ctx: Ctx) {
  const session = await auth();
  if (!session?.accessToken) {
    return { error: NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 }) };
  }
  const { owner, repo } = await ctx.params;
  return { token: session.accessToken, owner, repo };
}

function adminError(e: unknown): NextResponse {
  if (e instanceof GitHubError && e.status === 403) {
    return NextResponse.json(
      {
        error:
          "Setting branch protection needs admin on the repository. Do it under Settings → Branches → Branch protection rules.",
        code: "needs-admin",
      },
      { status: 403 },
    );
  }
  if (e instanceof GitHubError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

// PUT — require the gate status check on the repo's default branch before merge.
export async function PUT(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo } = g;
  try {
    const meta = await getRepo(token, owner, repo);
    await requireStatusCheck(token, owner, repo, meta.defaultBranch, GATE_CHECK_CONTEXT);
    const state = await getRequiredCheckState(
      token,
      owner,
      repo,
      meta.defaultBranch,
      GATE_CHECK_CONTEXT,
    );
    return NextResponse.json({ ...state, context: GATE_CHECK_CONTEXT });
  } catch (e) {
    return adminError(e);
  }
}

// DELETE — stop requiring the gate check (leaves the rest of the rule intact).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo } = g;
  try {
    const meta = await getRepo(token, owner, repo);
    await unrequireStatusCheck(token, owner, repo, meta.defaultBranch, GATE_CHECK_CONTEXT);
    const state = await getRequiredCheckState(
      token,
      owner,
      repo,
      meta.defaultBranch,
      GATE_CHECK_CONTEXT,
    );
    return NextResponse.json({ ...state, context: GATE_CHECK_CONTEXT });
  } catch (e) {
    return adminError(e);
  }
}
