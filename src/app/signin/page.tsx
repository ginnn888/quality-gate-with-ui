import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { GitHubSignInButton } from "@/components/GitHubSignInButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That GitHub account is already linked to another sign-in.",
  AccessDenied: "GitHub denied the authorisation request.",
  Configuration: "GitHub OAuth is not configured. Set GITHUB_ID and GITHUB_SECRET.",
  Verification: "That sign-in link is no longer valid.",
};

const STEPS = ["Sign in with GitHub", "Pick a repository", "Run the quality gate"];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const session = await auth();
  const target = safeCallback(callbackUrl);
  if (session?.user?.login) redirect(target);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center py-10">
      <div className="w-full rounded-2xl border border-gate-border bg-gate-panel p-8 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gate-accent to-gate-blue text-white shadow-card">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-gate-text">
          Quality Gate Console
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gate-muted">
          Sign in with GitHub to connect your account, then search your repositories, pick the
          one you want checked, and run the quality gate on it — no local setup required.
        </p>

        {error && (
          <div className="mt-5 w-full rounded-lg border border-gate-fail/30 bg-gate-fail/10 px-4 py-3 text-sm text-gate-fail">
            {ERRORS[error] || "Sign-in failed. Please try again."}
          </div>
        )}

        <div className="mt-6 w-full">
          <GitHubSignInButton callbackUrl={target} />
        </div>

        <ol className="mt-7 flex items-center justify-center gap-1.5 text-[11px] font-medium text-gate-muted">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gate-accentSoft text-[10px] font-bold text-gate-accent">
                  {i + 1}
                </span>
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1 text-gate-border">—</span>}
            </li>
          ))}
        </ol>

        <p className="mt-6 border-t border-gate-border pt-4 text-xs text-gate-muted">
          GitHub is the only supported sign-in method — there is no email or password login. The
          console asks for read access to your repositories so it can fetch the source files you
          choose to analyse.
        </p>
      </div>
    </div>
  );
}

/** Only same-origin paths — never bounce a sign-in to an external URL. */
function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
