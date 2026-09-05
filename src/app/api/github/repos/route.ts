import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, listUserRepos, searchUserRepos } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/github/repos?q=<search>
//   no q  → the user's most recently pushed repositories
//   with q → GitHub repo search, scoped to the signed-in account
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  try {
    const repos = q
      ? await searchUserRepos(session.accessToken, session.user.login || "", q)
      : await listUserRepos(session.accessToken);
    return NextResponse.json({ repos });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
