import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, getContentMeta, getRepo, listBranches } from "@/lib/github";

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
    // Cheap preflight signals for the install wizard: the gate needs an npm
    // project (jest) and JS/TS sources under src/ to produce a passing run.
    const [pkg, srcDir] = await Promise.all([
      getContentMeta(session.accessToken, owner, repo, "package.json", meta.defaultBranch).catch(
        () => null,
      ),
      getContentMeta(session.accessToken, owner, repo, "src", meta.defaultBranch).catch(() => null),
    ]);
    return NextResponse.json({
      repo: meta,
      ref: meta.defaultBranch,
      branches,
      preflight: { hasPackageJson: Boolean(pkg), hasSrcDir: Boolean(srcDir) },
    });
  } catch (e) {
    const status = e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
