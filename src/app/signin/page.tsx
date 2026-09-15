// The only entry point for a signed-out visitor — outside the (app)/ route
// group, so it renders with no sidebar. Already-signed-in users are bounced
// straight to wherever they were headed (`callbackUrl`, set by middleware.ts
// when it redirected them here in the first place).

import { redirect } from "next/navigation";
import { GitBranch, MessageSquareCode, PackageCheck, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { GitHubSignInButton } from "@/components/GitHubSignInButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That GitHub account is already linked to another sign-in.",
  AccessDenied: "GitHub denied the authorisation request.",
  Configuration: "GitHub OAuth is not configured. Set GITHUB_ID and GITHUB_SECRET.",
  Verification: "That sign-in link is no longer valid.",
};

const STEPS: { Icon: typeof PackageCheck; title: string; body: string }[] = [
  {
    Icon: PackageCheck,
    title: "Install onto a repo",
    body: "Commit the Quality Gate workflow into any repository you can push to.",
  },
  {
    Icon: GitBranch,
    title: "Push or open a PR",
    body: "GitHub Actions runs the gate automatically — AI review, tests, coverage, audit.",
  },
  {
    Icon: MessageSquareCode,
    title: "Read the result",
    body: "The verdict lands on the pull request, and here in the console.",
  },
];

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      {/* colourful-but-minimal backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gate-accent/25 blur-3xl" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-gate-blue/25 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-[#8ED8C4]/20 blur-3xl" />
      </div>

      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-gate-border bg-gate-panel/80 shadow-card backdrop-blur-xl md:grid-cols-[1.05fr_1fr]">
        {/* left — the pitch */}
        <div className="hidden flex-col justify-between gap-10 border-r border-gate-border bg-gradient-to-br from-gate-accentSoft/60 to-gate-blueSoft/50 p-9 md:flex">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-gate-text">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gate-accent to-gate-blue text-white shadow-card">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            Quality Gate Console
          </div>

          <div>
            <h2 className="text-lg font-bold leading-snug text-gate-text">
              The Automated Quality Gate, driven from a web console instead of YAML.
            </h2>
            <ul className="mt-6 space-y-4">
              {STEPS.map(({ Icon, title, body }, i) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gate-panel text-gate-accent shadow-card">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gate-text">
                      {i + 1}. {title}
                    </p>
                    <p className="text-xs leading-relaxed text-gate-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] leading-relaxed text-gate-muted">
            Everything still runs in GitHub Actions. The console only installs it, tunes the
            coverage targets, and shows you what came back.
          </p>
        </div>

        {/* right — the action */}
        <div className="flex flex-col justify-center gap-6 p-9">
          <div className="md:hidden">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-gate-text">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gate-accent to-gate-blue text-white shadow-card">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              Quality Gate Console
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gate-text">Sign in</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gate-muted">
              GitHub is the only way in. The console acts entirely as you — it can only see and
              change the repositories your account already can.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-gate-fail/30 bg-gate-fail/10 px-4 py-3 text-sm text-gate-fail">
              {ERRORS[error] || "Sign-in failed. Please try again."}
            </div>
          )}

          <GitHubSignInButton callbackUrl={target} />

          <p className="rounded-xl bg-gate-accentSoft/50 px-4 py-3 text-[11px] leading-relaxed text-gate-muted">
            Scope requested: <span className="font-mono text-gate-text">repo</span> +{" "}
            <span className="font-mono text-gate-text">workflow</span> — needed to read your code
            and commit the workflow file. No password, no email login.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Only same-origin paths — never bounce a sign-in to an external URL. */
function safeCallback(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}
