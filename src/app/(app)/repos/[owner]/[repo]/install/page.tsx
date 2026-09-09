"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  Loader2,
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

export default function InstallPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner;
  const repo = params.repo;
  const router = useRouter();

  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [coverage, setCoverage] = useState<CoverageConfig>({ global: 80, files: {} });
  const [triggers, setTriggers] = useState<WorkflowTriggers>({
    branches: [],
    events: ["push", "pull_request"],
  });
  const [geminiKey, setGeminiKey] = useState("");
  const [sonarOn, setSonarOn] = useState(false);
  const [sonarToken, setSonarToken] = useState("");
  const [sonarOrg, setSonarOrg] = useState("");
  const [openTestsPr, setOpenTestsPr] = useState(false);
  const [preflight, setPreflight] = useState<{ hasPackageJson: boolean; hasSrcDir: boolean } | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/github/files?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `GitHub request failed (${r.status})`);
        return d;
      })
      .then((d) => {
        if (!alive) return;
        const db = d.repo?.defaultBranch || d.ref || "main";
        setDefaultBranch(db);
        setBranches(d.branches ?? [db]);
        setTriggers((t) => ({ ...t, branches: [db] }));
        if (d.preflight) setPreflight(d.preflight);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [owner, repo]);

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
          openTestsPr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "workflow-scope") setScopeError(true);
        throw new Error(data.error || `Install failed (${res.status})`);
      }
      router.push(`/installed/${owner}/${repo}`);
    } catch (e: any) {
      setError(e.message || "Install failed");
      setSubmitting(false);
    }
  }

  const ready = triggers.branches.length > 0;
  const projectKey = `${sonarOrg.trim() || "<org>"}_${repo}`;
  const sonarActive = sonarOn && sonarToken.trim().length > 0;
  const sonarPropsWritten = sonarActive && sonarOrg.trim().length > 0;

  const committedFiles = [
    ".github/workflows/quality-gate.yml",
    "config_cov.json",
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

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gate-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> reading repository…
        </p>
      ) : (
        <>
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
                <div className="rounded-lg bg-gate-blueSoft/50 p-3 text-xs text-gate-text">
                  <p className="font-semibold">Set these up once on SonarCloud:</p>
                  <ol className="mt-1.5 space-y-1.5">
                    <li className="flex gap-2">
                      <span className="font-mono text-gate-blue">1</span>
                      <span>
                        Sign in at{" "}
                        <a
                          href={SONAR_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                        >
                          sonarcloud.io <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>{" "}
                        with GitHub and create an <strong>organization</strong>.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono text-gate-blue">2</span>
                      <span>
                        Add a <strong>project</strong> for{" "}
                        <span className="font-mono">{repo}</span> (Analyze new project → GitHub).
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-mono text-gate-blue">3</span>
                      <span>
                        Generate a <strong>token</strong> under{" "}
                        <a
                          href={SONAR_TOKEN_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                        >
                          Account → Security <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                        .
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

          {/* Companion tests PR */}
          <div className="rounded-xl border border-gate-border bg-gate-panel shadow-card">
            <label className="flex cursor-pointer items-center gap-3 p-4">
              <input
                type="checkbox"
                checked={openTestsPr}
                disabled={submitting}
                onChange={(e) => setOpenTestsPr(e.target.checked)}
                className="h-4 w-4 accent-gate-accent"
              />
              <GitPullRequest className="h-4 w-4 text-gate-green" aria-hidden />
              <span className="text-sm font-semibold text-gate-text">
                Commit the AI-generated tests as a PR
              </span>
              <span className="ml-auto text-[11px] text-gate-muted">
                {openTestsPr ? "on" : "off"}
              </span>
            </label>

            {openTestsPr && (
              <div className="border-t border-gate-border px-4 pb-4 pt-3 text-xs text-gate-muted">
                <p>
                  Each pull-request run pushes the generated suite + updated{" "}
                  <span className="font-mono">config_cov.json</span> + report to{" "}
                  <span className="font-mono">aqg-tests/pr-&lt;n&gt;</span> and opens one companion
                  PR into that branch (refreshed on later runs, never duplicated).
                </p>
                <p className="mt-1.5 flex items-start gap-1.5">
                  <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  Needs <span className="font-mono">contents: write</span> in the workflow. PRs from
                  forks are skipped.
                </p>
              </div>
            )}
          </div>

          {/* Preflight */}
          {preflight && (!preflight.hasPackageJson || !preflight.hasSrcDir) && (
            <div className="flex gap-2 rounded-xl border border-gate-warn/40 bg-gate-warn/10 p-4 text-xs text-gate-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">This repo can&apos;t pass a run yet — you can still install.</p>
                <ul className="mt-1 list-disc pl-4">
                  {!preflight.hasPackageJson && (
                    <li>
                      no <span className="font-mono">package.json</span> — add one with{" "}
                      <span className="font-mono">jest</span> so tests and coverage can run
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
              <span className="font-mono">test-github-marketplace</span> fresh each run. To block
              merges on a red gate, require the <span className="font-mono">Quality Gate</span> check
              in branch protection.
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
        </>
      )}
    </div>
  );
}
