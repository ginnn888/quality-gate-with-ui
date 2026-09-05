"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { GateConfigPanel } from "@/components/GateConfigPanel";
import type { GateConfig, InstallationRecord, WorkflowRunRow } from "@/lib/types";

interface DetailPayload {
  record: InstallationRecord;
  runs: WorkflowRunRow[];
  state: "ok" | "files-missing";
}

export default function InstallationDetailPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const router = useRouter();
  const base = `/api/installations/${owner}/${repo}`;

  const [data, setData] = useState<DetailPayload | null>(null);
  const [config, setConfig] = useState<GateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "save" | "uninstall" | "reinstall">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
      setData(d);
      setConfig(d.record.config);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!config) return;
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Save failed (${res.status})`);
      setSaved(true);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reinstall() {
    if (!config) return;
    setBusy("reinstall");
    setError(null);
    try {
      const res = await fetch("/api/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, config }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Re-install failed (${res.status})`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function uninstall() {
    if (!confirm(`Uninstall the quality gate from ${owner}/${repo}? This removes both files from the repo.`))
      return;
    setBusy("uninstall");
    setError(null);
    try {
      const res = await fetch(base, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Uninstall failed (${res.status})`);
      router.push("/installed");
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/installed"
        className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        installed
      </Link>

      <section className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gate-text">
          <span className="font-mono">{owner}/{repo}</span>
        </h1>
        {data?.record.htmlUrl && (
          <a
            href={data.record.htmlUrl}
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
      ) : !data || !config ? (
        <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error || "Not found."}
        </div>
      ) : (
        <>
          {data.state === "files-missing" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gate-warn/40 bg-gate-warn/10 p-3 text-sm text-gate-warn">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">
                The workflow or config file is missing from <span className="font-mono">{data.record.defaultBranch}</span>.
                The gate will not run until it is restored.
              </span>
              <button
                onClick={reinstall}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-gate-warn/50 px-2.5 py-1 text-xs font-medium hover:bg-gate-warn/10 disabled:opacity-50"
              >
                {busy === "reinstall" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                Re-commit files
              </button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gate-text">Configuration</h2>
            <GateConfigPanel
              config={config}
              onChange={(c) => {
                setConfig(c);
                setSaved(false);
              }}
              branchOptions={config.branches}
              disabled={busy !== null}
            />
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={busy !== null || config.branches.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gate-accent to-gate-blue px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 disabled:opacity-40"
              >
                {busy === "save" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Save changes
              </button>
              {saved && <span className="text-xs text-gate-pass">saved · committed to the repo</span>}
            </div>
            <p className="text-[11px] text-gate-muted">
              Saving commits an updated <span className="font-mono">quality-gate.config.json</span>
              {" "}(and the workflow file too when the branch/event list changes).
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gate-text">Recent gate runs</h2>
            {data.runs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gate-border bg-gate-panel px-4 py-6 text-center text-xs text-gate-muted">
                No workflow runs yet — push a commit or open a pull request on a watched branch.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gate-border bg-gate-panel shadow-card">
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
                    {data.runs.map((r) => {
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
                          <td className="px-3 py-2 font-mono text-gate-muted">{r.headBranch ?? "—"}</td>
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

          {error && (
            <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
              {error}
            </div>
          )}

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
