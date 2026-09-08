"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { CoverageConfigForm } from "@/components/CoverageConfigForm";
import { PrGateResults } from "@/components/PrGateResults";
import type {
  CoverageConfig,
  GatePrResult,
  InstalledRepo,
  WorkflowRunRow,
  WorkflowTriggers,
} from "@/lib/types";

interface DetailPayload {
  record: InstalledRepo;
  runs: WorkflowRunRow[];
  pulls: GatePrResult[];
}

export default function InstallationDetailPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const router = useRouter();
  const base = `/api/installations/${owner}/${repo}`;

  const [data, setData] = useState<DetailPayload | null>(null);
  const [coverage, setCoverage] = useState<CoverageConfig | null>(null);
  const [triggers, setTriggers] = useState<WorkflowTriggers | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [sonarToken, setSonarToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "secrets" | "uninstall">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
      setData(d);
      setCoverage(d.record.coverage);
      setTriggers(d.record.triggers);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveConfig() {
    if (!coverage || !triggers) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverage, triggers }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Save failed (${res.status})`);
      setNotice("Saved — committed to the repository.");
      if (d.warnings?.length) setNotice(d.warnings.join(" "));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveSecrets() {
    if (!geminiKey.trim() && !sonarToken.trim()) return;
    setBusy("secrets");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: geminiKey.trim() || undefined,
          sonarToken: sonarToken.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Save failed (${res.status})`);
      setGeminiKey("");
      setSonarToken("");
      setNotice(d.warnings?.length ? d.warnings.join(" ") : "Secrets updated.");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function uninstall() {
    if (
      !confirm(`Uninstall the quality gate from ${owner}/${repo}? This removes both files from the repo.`)
    )
      return;
    setBusy("uninstall");
    setError(null);
    try {
      const res = await fetch(base, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Uninstall failed (${res.status})`);
      router.push("/");
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  }

  const record = data?.record;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        installed
      </Link>

      <section className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gate-text">
          <span className="font-mono">{owner}/{repo}</span>
        </h1>
        {record?.htmlUrl && (
          <a
            href={record.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
          >
            open on GitHub <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </section>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gate-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> loading…
        </p>
      ) : !record || !coverage || !triggers ? (
        <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error || "Not found."}
        </div>
      ) : (
        <>
          {!record.hasConfig && (
            <div className="flex items-center gap-3 rounded-lg border border-gate-warn/40 bg-gate-warn/10 p-3 text-sm text-gate-warn">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="font-mono">config_cov.json</span> is missing on{" "}
                <span className="font-mono">{record.defaultBranch}</span>. Click{" "}
                <strong>Save changes</strong> to re-commit it.
              </span>
            </div>
          )}

          {/* config */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gate-text">Configuration</h2>
            <CoverageConfigForm
              coverage={coverage}
              triggers={triggers}
              onCoverageChange={(c) => {
                setCoverage(c);
                setNotice(null);
              }}
              onTriggersChange={(t) => {
                setTriggers(t);
                setNotice(null);
              }}
              branchOptions={triggers.branches}
              disabled={busy !== null}
            />
            <button
              onClick={saveConfig}
              disabled={busy !== null || triggers.branches.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gate-accent to-gate-blue px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 disabled:opacity-40"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save changes
            </button>
            <p className="text-[11px] text-gate-muted">
              Saving re-commits <span className="font-mono">config_cov.json</span> and{" "}
              <span className="font-mono">.github/workflows/quality-gate.yml</span> — use it to pull
              in console updates too. The gate itself is always fetched fresh from{" "}
              <span className="font-mono">ginnn888/aqg-github-marketplace</span> at run time.
            </p>
          </div>

          {/* secrets */}
          <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
              <KeyRound className="h-4 w-4 text-gate-muted" aria-hidden />
              Repository secrets
            </h2>

            {record.secrets.readable ? (
              <ul className="space-y-1 text-xs">
                <SecretRow name="GEMINI_API_KEY" present={record.secrets.geminiApiKey} required />
                <SecretRow name="SONAR_TOKEN" present={record.secrets.sonarToken} />
              </ul>
            ) : (
              <p className="text-[11px] text-gate-muted">
                Can&apos;t read this repo&apos;s secret list (needs admin). You can still set new
                values below.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="password"
                autoComplete="off"
                value={geminiKey}
                disabled={busy !== null}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="New GEMINI_API_KEY"
                className="rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
              <input
                type="password"
                autoComplete="off"
                value={sonarToken}
                disabled={busy !== null}
                onChange={(e) => setSonarToken(e.target.value)}
                placeholder="New SONAR_TOKEN (optional)"
                className="rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
              />
            </div>
            <button
              onClick={saveSecrets}
              disabled={busy !== null || (!geminiKey.trim() && !sonarToken.trim())}
              className="inline-flex items-center gap-2 rounded-lg border border-gate-border px-3 py-1.5 text-xs font-medium text-gate-muted transition hover:text-gate-accent disabled:opacity-40"
            >
              {busy === "secrets" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
              )}
              Update secrets
            </button>
          </div>

          {notice && (
            <div className="rounded-lg border border-gate-border bg-gate-accentSoft/40 p-3 text-xs text-gate-muted">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
              {error}
            </div>
          )}

          {/* pull request results */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gate-text">Pull requests</h2>
            <PrGateResults pulls={data!.pulls} />
          </div>

          {/* recent runs */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gate-text">Recent gate runs</h2>
            {data!.runs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gate-border bg-gate-panel px-4 py-6 text-center text-xs text-gate-muted">
                No workflow runs yet — push a commit or open a pull request on a watched branch.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gate-border bg-gate-panel shadow-card">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gate-border text-gate-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Run</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Branch</th>
                      <th className="px-3 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gate-border">
                    {data!.runs.map((r) => {
                      const c = r.conclusion ?? r.status;
                      const cls =
                        c === "success"
                          ? "text-gate-pass"
                          : c === "failure"
                            ? "text-gate-fail"
                            : "text-gate-muted";
                      return (
                        <tr key={r.id} className="hover:bg-gate-accent/5">
                          <td className="px-3 py-2">
                            <a
                              href={r.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-gate-accent hover:underline"
                            >
                              #{r.runNumber}
                            </a>
                          </td>
                          <td className={`px-3 py-2 font-medium ${cls}`}>{c}</td>
                          <td className="px-3 py-2 text-gate-muted">{r.event}</td>
                          <td className="px-3 py-2 font-mono text-gate-muted">
                            {r.headBranch ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gate-muted">
                            {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gate-muted">
              To block merges on a failing gate, add a branch-protection rule on GitHub that
              requires the <span className="font-mono">Quality Gate</span> status check.
            </p>
          </div>

          <div className="border-t border-gate-border pt-4">
            <button
              onClick={uninstall}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-gate-fail/40 px-4 py-2 text-sm font-medium text-gate-fail transition hover:bg-gate-fail/10 disabled:opacity-50"
            >
              {busy === "uninstall" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              Uninstall from this repository
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SecretRow({
  name,
  present,
  required,
}: {
  name: string;
  present: boolean;
  required?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      {present ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-gate-pass" aria-hidden />
      ) : (
        <XCircle className={`h-3.5 w-3.5 ${required ? "text-gate-fail" : "text-gate-muted"}`} aria-hidden />
      )}
      <span className="font-mono text-gate-text">{name}</span>
      <span className="text-gate-muted">
        {present ? "set" : required ? "missing — the gate cannot run" : "not set"}
      </span>
    </li>
  );
}
