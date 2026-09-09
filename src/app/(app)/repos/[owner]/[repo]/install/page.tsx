"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2, PackagePlus } from "lucide-react";
import { CoverageConfigForm } from "@/components/CoverageConfigForm";
import { SignOutButton } from "@/components/SignOutButton";
import type { CoverageConfig, WorkflowTriggers } from "@/lib/types";

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
  const [sonarToken, setSonarToken] = useState("");

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
          sonarToken: sonarToken.trim() || undefined,
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
          Install the gate on <span className="font-mono">{owner}/{repo}</span>
        </h1>
        <p className="mt-1 text-sm text-gate-muted">
          Set the coverage targets and triggers, provide the API key the action needs, then
          install. Everything is editable later, or you can uninstall.
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

          <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
              <KeyRound className="h-4 w-4 text-gate-muted" aria-hidden />
              Repository secrets
            </h3>
            <p className="text-[11px] leading-relaxed text-gate-muted">
              Stored encrypted as GitHub Actions secrets on{" "}
              <span className="font-mono">{owner}/{repo}</span> — the console never keeps them.
            </p>

            <label className="block">
              <span className="text-xs text-gate-muted">Google Gemini API key</span>
              <input
                type="password"
                autoComplete="off"
                value={geminiKey}
                disabled={submitting}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="leave blank to use the console's key"
                className="mt-1 w-full rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
              <span className="mt-1 block text-[11px] text-gate-muted">
                Saved as the <span className="font-mono">GEMINI_API_KEY</span> secret. If left
                blank, the console&apos;s own key is used. The gate cannot run without one.
              </span>
            </label>

            <label className="block">
              <span className="text-xs text-gate-muted">SonarCloud token (optional)</span>
              <input
                type="password"
                autoComplete="off"
                value={sonarToken}
                disabled={submitting}
                onChange={(e) => setSonarToken(e.target.value)}
                placeholder="leave blank to skip SonarCloud"
                className="mt-1 w-full rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
              <span className="mt-1 block text-[11px] text-gate-muted">
                Saved as <span className="font-mono">SONAR_TOKEN</span>. When set, the workflow
                also runs a SonarCloud scan.
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-gate-border bg-gate-accentSoft/40 p-4 text-xs text-gate-muted">
            Installing makes one commit to <code className="text-gate-text">{defaultBranch}</code> with:
            <ul className="mt-1.5 list-disc pl-5 font-mono">
              <li>.github/workflows/quality-gate.yml</li>
              <li>config_cov.json</li>
            </ul>
            <p className="mt-2">
              The workflow runs the gate straight from{" "}
              <span className="font-mono">NonnaritRammaneekultawat-6609650459/test-github-marketplace</span> —
              nothing else is
              added to your repo, and every run uses the current version of the gate.
            </p>
            <p className="mt-2">
              To block merges on a red gate, add a branch-protection rule requiring the
              <span className="font-mono"> Quality Gate </span> check on GitHub.
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
