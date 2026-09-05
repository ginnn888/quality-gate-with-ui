"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, PackagePlus } from "lucide-react";
import { GateConfigPanel } from "@/components/GateConfigPanel";
import { SignOutButton } from "@/components/SignOutButton";
import type { GateConfig } from "@/lib/types";

const DEFAULT: GateConfig = {
  globalCoverage: 80,
  perFileCoverage: {},
  enableSonar: true,
  enableAiReview: true,
  branches: [],
  events: ["push", "pull_request"],
};

export default function InstallPage() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params.owner;
  const repo = params.repo;
  const router = useRouter();

  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState<string>("main");
  const [config, setConfig] = useState<GateConfig>(DEFAULT);
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
        setConfig((c) => ({ ...c, branches: [db] }));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [owner, repo]);

  async function install() {
    if (config.branches.length === 0) return;
    setSubmitting(true);
    setError(null);
    setScopeError(false);
    try {
      const res = await fetch("/api/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, config }),
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
          Set the pass/fail thresholds and triggers, then install. You can change all of this
          later, or uninstall.
        </p>
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gate-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> reading repository…
        </p>
      ) : (
        <>
          <GateConfigPanel
            config={config}
            onChange={setConfig}
            branchOptions={branches}
            disabled={submitting}
          />

          <div className="rounded-xl border border-gate-border bg-gate-accentSoft/40 p-4 text-xs text-gate-muted">
            Installing commits two files to{" "}
            <code className="text-gate-text">{defaultBranch}</code>:
            <ul className="mt-1.5 list-disc pl-5 font-mono">
              <li>.github/workflows/quality-gate.yml</li>
              <li>quality-gate.config.json</li>
            </ul>
            <p className="mt-2">
              To actually block merges on a red gate, add a branch-protection rule requiring the
              <span className="font-mono"> Quality Gate </span> check on GitHub. For the live
              Gemini engine, add a <span className="font-mono">GEMINI_API_KEY</span> repo secret —
              otherwise the gate runs the dependency-free simulation.
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
            disabled={submitting || config.branches.length === 0}
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
