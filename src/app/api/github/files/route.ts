import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, getRepo, listBranches } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/github/files?owner=&repo=
// Repo metadata + branch list — used by the install wizard.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const owner = (sp.get("owner") || "").trim();
  const repo = (sp.get("repo") || "").trim();
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }

  try {
    const meta = await getRepo(session.accessToken, owner, repo);
    const branches = await listBranches(session.accessToken, owner, repo).catch(() => [
      meta.defaultBranch,
    ]);
    return NextResponse.json({ repo: meta, ref: meta.defaultBranch, branches });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
