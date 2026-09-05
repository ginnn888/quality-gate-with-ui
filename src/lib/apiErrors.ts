import { NextResponse } from "next/server";
import { GitHubError } from "./github";

/**
 * Turn a GitHub write failure into a useful API response — in particular the
 * case where the OAuth token predates the `workflow` scope and GitHub refuses
 * to let the console touch `.github/workflows/`.
 */
export function installError(e: unknown): NextResponse {
  if (e instanceof GitHubError) {
    const scopeIssue =
      e.status === 403 && /workflow|refusing to allow|oauth|scope/i.test(e.message);
    if (scopeIssue) {
      return NextResponse.json(
        {
          error:
            "GitHub rejected the write — the OAuth token is missing the `workflow` scope. Sign out and back in to grant it, then retry.",
          code: "workflow-scope",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: (e as Error).message || "Install failed" }, { status: 500 });
}
