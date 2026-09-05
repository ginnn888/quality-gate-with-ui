"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe2, Lock, GitBranch } from "lucide-react";
import type { InstallationSummaryRow, WorkflowRunRow } from "@/lib/types";

function RunBadge({ owner, name }: { owner: string; name: string }) {
  const [run, setRun] = useState<WorkflowRunRow | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "files-missing" | "none">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/installations/${owner}/${name}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setRun((d.runs ?? [])[0] ?? null);
        setState(d.state === "files-missing" ? "files-missing" : (d.runs ?? []).length ? "ok" : "none");
      })
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [owner, name]);

  if (state === "files-missing")
    return <span className="rounded-full bg-gate-warn/15 px-2 py-0.5 text-[11px] font-medium text-gate-warn">files missing</span>;
  if (state === "loading")
    return <span className="text-[11px] text-gate-muted">…</span>;
  if (!run) return <span className="text-[11px] text-gate-muted">no runs yet</span>;

  const c = run.conclusion ?? run.status;
  const cls =
    c === "success"
      ? "bg-gate-pass/15 text-gate-pass"
      : c === "failure"
        ? "bg-gate-fail/15 text-gate-fail"
        : "bg-gate-skip/15 text-gate-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{c}</span>;
}

export function InstalledRepoCard({ row }: { row: InstallationSummaryRow }) {
  return (
    <Link
      href={`/installed/${row.owner}/${row.name}`}
      className="flex flex-col gap-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card transition hover:border-gate-accent/40"
    >
      <div className="flex items-start gap-2">
        {row.private ? (
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gate-accent" aria-hidden />
        ) : (
          <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gate-blue" aria-hidden />
        )}
        <span className="min-w-0 flex-1 break-words font-mono text-sm font-semibold text-gate-text">
          {row.fullName}
        </span>
        <RunBadge owner={row.owner} name={row.name} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gate-muted">
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" aria-hidden />
          {row.branches.join(", ") || "—"}
        </span>
        <span>coverage ≥ {row.globalCoverage}%</span>
        <span className="ml-auto">installed {new Date(row.installedAt).toLocaleDateString()}</span>
      </div>
    </Link>
  );
}
