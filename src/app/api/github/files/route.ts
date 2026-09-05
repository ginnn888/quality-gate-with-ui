import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, getRepo, listBranches, listSourceFiles } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/github/files?owner=&repo=&ref=
// The analysable source files in a repository ref, plus its branch list.
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
    const ref = (sp.get("ref") || "").trim() || meta.defaultBranch;
    const [{ files, truncated }, branches] = await Promise.all([
      listSourceFiles(session.accessToken, owner, repo, ref),
      listBranches(session.accessToken, owner, repo).catch(() => [meta.defaultBranch]),
    ]);
    return NextResponse.json({ repo: meta, ref, branches, files, truncated });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
