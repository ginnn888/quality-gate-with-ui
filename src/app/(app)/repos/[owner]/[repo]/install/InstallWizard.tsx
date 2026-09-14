"use client";

// The install form itself — a client island rendered by this route's
// server-component page.tsx, which already fetched the repo's branches and
// preflight signals server-side. Everything here is either local form state
// or the single POST /api/installations call that commits the gate.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  PackagePlus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { CoverageConfigForm } from "@/components/CoverageConfigForm";
import { SignOutButton } from "@/components/SignOutButton";
import type { CoverageConfig, WorkflowTriggers } from "@/lib/types";

const GEMINI_KEYS_URL = "https://aistudio.google.com/app/apikey";
const SONAR_URL = "https://sonarcloud.io";
const SONAR_TOKEN_URL = "https://sonarcloud.io/account/security";
const SONAR_AUTO_ANALYSIS_DOC =
  "https://docs.sonarsource.com/sonarqube-cloud/enriching/automatic-analysis/";

export function InstallWizard({
  owner,
  repo,
  defaultBranch,
  branches,
  preflight,
}: {
  owner: string;
  repo: string;
  defaultBranch: string;
  branches: string[];
  preflight: { hasPackageJson: boolean; hasSrcDir: boolean; hasJest: boolean };
}) {
  const router = useRouter();

  const [coverage, setCoverage] = useState<CoverageConfig>({ global: 80, files: {} });
  const [triggers, setTriggers] = useState<WorkflowTriggers>({
    branches: [defaultBranch],
    events: ["pull_request"],
  });
  const [geminiKey, setGeminiKey] = useState("");
  const [sonarOn, setSonarOn] = useState(false);
  const [sonarToken, setSonarToken] = useState("");
  const [sonarOrg, setSonarOrg] = useState("");
  const [requireCheck, setRequireCheck] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState(false);

  async function install() {
    if (triggers.branches.length === 0) return;
    setSubmitting(true);
    setError(null);
    setScopeError(false);
    try {
      const res = await fetch("/api/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          coverage,
          triggers,
          geminiApiKey: geminiKey.trim(),
          sonarToken: sonarOn ? sonarToken.trim() || undefined : undefined,
          sonarOrg: sonarOn ? sonarOrg.trim() || undefined : undefined,
          requireCheck,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "workflow-scope") setScopeError(true);
        throw new Error(data.error || `Install failed (${res.status})`);
      }
      router.push(`/installed/${owner}/${repo}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
      setSubmitting(false);
    }
  }

  const ready = triggers.branches.length > 0;
  const projectKey = `${sonarOrg.trim() || "<org>"}_${repo}`;
  const sonarActive = sonarOn && sonarToken.trim().length > 0;
  const sonarPropsWritten = sonarActive && sonarOrg.trim().length > 0;
  const preflightOk = preflight.hasPackageJson && preflight.hasSrcDir && preflight.hasJest;

  const committedFiles = [
    ".github/workflows/quality-gate.yml",
    "config_cov.json",
    "audit-resolve.json (if not already there)",
    ...(sonarPropsWritten ? ["sonar-project.properties"] : []),
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/repos"
        className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        repositories
      </Link>

      <section>
        <h1 className="text-xl font-bold text-gate-text">
          Install on <span className="font-mono">{owner}/{repo}</span>
        </h1>
        <p className="mt-1 text-sm text-gate-muted">
          On every pull request the gate reviews the changed code with AI, generates tests, checks
          coverage, and posts one report comment. All settings stay editable after install.
        </p>
      </section>

      <CoverageConfigForm
        coverage={coverage}
        triggers={triggers}
        onCoverageChange={setCoverage}
        onTriggersChange={setTriggers}
        branchOptions={branches}
        disabled={submitting}
      />

      {/* ── Required ─────────────────────────────────────────────── */}
      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gate-muted">
        Required
      </p>

      <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gate-accent" aria-hidden />
          <h3 className="text-sm font-semibold text-gate-text">AI engine — Google Gemini</h3>
          <span className="ml-auto rounded-full bg-gate-fail/10 px-2 py-0.5 text-[10px] font-semibold text-gate-fail">
            needed to run
          </span>
        </div>

        <input
          type="password"
          autoComplete="off"
          value={geminiKey}
          disabled={submitting}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza…  (or leave blank to use this console's shared key)"
          className="w-full rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
        />
        <p className="text-xs text-gate-muted">
          Saved as the <span className="font-mono">GEMINI_API_KEY</span> secret on your repo.{" "}
          <a
            href={GEMINI_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
          >
            Get a free key <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </p>
      </div>

      {/* ── Merge protection ─────────────────────────────────────── */}
      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gate-muted">
        Merge protection
      </p>

      <div className="rounded-xl border border-gate-border bg-gate-panel shadow-card">
        <label className="flex cursor-pointer items-start gap-3 p-4">
          <input
            type="checkbox"
            checked={requireCheck}
            disabled={submitting}
            onChange={(e) => setRequireCheck(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-gate-accent"
          />
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gate-accent" aria-hidden />
          <span className="min-w-0">
            <span className="text-sm font-semibold text-gate-text">
              Block merges while the gate is red
            </span>
            <span className="mt-1 block text-[11px] text-gate-muted">
              Adds a branch-protection rule on{" "}
              <span className="font-mono">{defaultBranch}</span> that requires the{" "}
              <span className="font-mono">Quality Gate</span> check to pass. Needs admin on the
              repo — if you don&apos;t have it, the install still succeeds and you&apos;ll get a
              note on how to add the rule by hand.
            </span>
          </span>
        </label>
      </div>

      {/* ── Optional add-ons ─────────────────────────────────────── */}
      <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gate-muted">
        Optional add-ons
      </p>

      {/* SonarCloud */}
      <div className="rounded-xl border border-gate-border bg-gate-panel shadow-card">
        <label className="flex cursor-pointer items-center gap-3 p-4">
          <input
            type="checkbox"
            checked={sonarOn}
            disabled={submitting}
            onChange={(e) => setSonarOn(e.target.checked)}
            className="h-4 w-4 accent-gate-accent"
          />
          <ShieldCheck className="h-4 w-4 text-gate-blue" aria-hidden />
          <span className="text-sm font-semibold text-gate-text">SonarCloud analysis</span>
          <span className="ml-auto text-[11px] text-gate-muted">
            {sonarOn ? "on" : "adds a static-analysis gate"}
          </span>
        </label>

        {sonarOn && (
          <div className="space-y-3 border-t border-gate-border px-4 pb-4 pt-3">
            <div className="overflow-hidden rounded-lg border border-gate-blue/30 bg-gate-blueSoft/40 text-xs text-gate-text">
              <div className="flex items-center gap-2 border-b border-gate-blue/20 bg-gate-blue/10 px-3 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gate-blue" aria-hidden />
                <span className="text-[13px] font-semibold text-gate-text">
                  One-time SonarCloud setup
                </span>
                <span className="ml-auto text-[10px] text-gate-muted">do this before installing</span>
              </div>

              <ol className="space-y-3 p-3">
                <li className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gate-blue text-[10px] font-bold text-white">
                    1
                  </span>
                  <span className="min-w-0">
                    <strong className="text-gate-text">Create an organization.</strong> Sign in at{" "}
                    <a
                      href={SONAR_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                    >
                      sonarcloud.io <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>{" "}
                    with GitHub → <span className="italic">Create an organization</span>.
                    <span className="mt-0.5 block text-[11px] text-gate-muted">
                      Its key is in the URL{" "}
                      <span className="font-mono">sonarcloud.io/organizations/‹key›</span> → put it
                      in <span className="text-gate-text">Organization key</span> below.
                    </span>
                  </span>
                </li>

                <li className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gate-blue text-[10px] font-bold text-white">
                    2
                  </span>
                  <span className="min-w-0">
                    <strong className="text-gate-text">Add the project.</strong>{" "}
                    <span className="italic">Analyze new project</span> → pick{" "}
                    <span className="font-mono">{owner}/{repo}</span> from GitHub.
                    <span className="mt-0.5 block text-[11px] text-gate-muted">
                      The project key must end up as{" "}
                      <span className="font-mono text-gate-text">‹org&nbsp;key›_{repo}</span> — if
                      SonarCloud picks a different one, rename it under the project&apos;s{" "}
                      <span className="font-mono">Administration → Update Key</span>.
                    </span>
                  </span>
                </li>

                <li className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gate-warn text-[10px] font-bold text-white">
                    3
                  </span>
                  <span className="min-w-0">
                    <strong className="text-gate-warn">Turn OFF Automatic Analysis</strong> for that
                    project: its page →{" "}
                    <span className="font-mono">Administration → Analysis Method</span> → choose{" "}
                    <span className="italic">CI-based / GitHub Actions</span>.
                    <span className="mt-0.5 block text-[11px] text-gate-muted">
                      Left on, the CI scan fails with{" "}
                      <span className="font-mono">sonar-scanner … exit code 3</span>.{" "}
                      <a
                        href={SONAR_AUTO_ANALYSIS_DOC}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                      >
                        docs <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </span>
                  </span>
                </li>

                <li className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gate-blue text-[10px] font-bold text-white">
                    4
                  </span>
                  <span className="min-w-0">
                    <strong className="text-gate-text">Create a token.</strong>{" "}
                    <a
                      href={SONAR_TOKEN_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                    >
                      Account → Security <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>{" "}
                    → generate → paste into <span className="text-gate-text">Token</span> below.
                    <span className="mt-0.5 block text-[11px] text-gate-muted">
                      Stored as the repo&apos;s <span className="font-mono">SONAR_TOKEN</span>{" "}
                      secret. SonarCloud shows it once — copy it right away.
                    </span>
                  </span>
                </li>
              </ol>
            </div>

            <label className="block">
              <span className="text-xs text-gate-muted">Organization key</span>
              <input
                type="text"
                autoComplete="off"
                value={sonarOrg}
                disabled={submitting}
                onChange={(e) => setSonarOrg(e.target.value)}
                placeholder="my-org"
                className="mt-1 w-full rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
            </label>

            <label className="block">
              <span className="text-xs text-gate-muted">Token</span>
              <input
                type="password"
                autoComplete="off"
                value={sonarToken}
                disabled={submitting}
                onChange={(e) => setSonarToken(e.target.value)}
                placeholder="saved as the SONAR_TOKEN secret"
                className="mt-1 w-full rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
            </label>

            <p className="flex items-start gap-1.5 text-[11px] text-gate-muted">
              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {sonarPropsWritten ? (
                <span>
                  The console will commit{" "}
                  <span className="font-mono">sonar-project.properties</span> pointing at{" "}
                  <span className="font-mono text-gate-text">{projectKey}</span> — no file to
                  write yourself.
                </span>
              ) : sonarActive ? (
                <span>
                  Add the organization key too, or SonarCloud stays skipped (the gate needs{" "}
                  <span className="font-mono">sonar-project.properties</span>).
                </span>
              ) : (
                <span>Enter the token to turn SonarCloud on.</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Preflight */}
      {!preflightOk && (
        <div className="flex gap-2 rounded-xl border border-gate-warn/40 bg-gate-warn/10 p-4 text-xs text-gate-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">This repo can&apos;t pass a run yet — you can still install.</p>
            <ul className="mt-1 list-disc pl-4">
              {!preflight.hasPackageJson && (
                <li>
                  no <span className="font-mono">package.json</span> — add one so{" "}
                  <span className="font-mono">npm install</span> and tests can run
                </li>
              )}
              {preflight.hasPackageJson && !preflight.hasJest && (
                <li>
                  no <span className="font-mono">jest</span> in{" "}
                  <span className="font-mono">package.json</span> — the gate runs{" "}
                  <span className="font-mono">npx jest --coverage</span>, so add{" "}
                  <span className="font-mono">jest</span> to devDependencies
                </li>
              )}
              {!preflight.hasSrcDir && (
                <li>
                  no <span className="font-mono">src/</span> — the gate reviews changed{" "}
                  <span className="font-mono">.js/.ts/.jsx/.tsx</span> under it
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-xl border border-gate-border bg-gate-accentSoft/40 p-4 text-xs text-gate-muted">
        <p className="font-semibold text-gate-text">
          One commit to <span className="font-mono">{defaultBranch}</span>:
        </p>
        <ul className="mt-1.5 space-y-0.5 font-mono">
          {committedFiles.map((f) => (
            <li key={f} className="flex items-center gap-1.5">
              <span className="text-gate-accent">+</span> {f}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          No action code is copied in — the workflow calls{" "}
          <span className="font-mono">test-github-marketplace@1.1</span> fresh each run.{" "}
          {requireCheck
            ? "The Quality Gate check will be required before merges (if you have admin)."
            : "To block merges on a red gate later, turn on merge protection above or add the rule on GitHub."}
        </p>
      </div>

      {error && (
        <div className="space-y-2 rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          <p>{error}</p>
          {scopeError && (
            <div className="flex items-center gap-2">
              <span className="text-xs">Re-authenticate to grant the workflow permission:</span>
              <SignOutButton />
            </div>
          )}
        </div>
      )}

      <button
        onClick={install}
        disabled={submitting || !ready}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-gate-accent to-gate-blue px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <PackagePlus className="h-4 w-4" aria-hidden />
        )}
        {submitting ? "Installing…" : "Install quality gate"}
      </button>
    </div>
  );
}
