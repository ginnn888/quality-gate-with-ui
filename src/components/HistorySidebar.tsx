"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, History, XCircle } from "lucide-react";
import type { RunSummaryRow } from "@/lib/types";

export function HistorySidebar({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<RunSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setRows(d.runs ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <aside className="h-fit rounded-xl border border-gate-border bg-gate-panel shadow-card">
      <h3 className="flex items-center gap-2 border-b border-gate-border px-4 py-2.5 text-sm font-semibold text-gate-text">
        <History className="h-4 w-4 text-gate-muted" aria-hidden />
        Recent runs
      </h3>
      {loading ? (
        <p className="px-4 py-3 text-xs text-gate-muted">loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gate-muted">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-gate-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/runs/${r.id}`}
                className="block px-4 py-2.5 hover:bg-gate-accent/5"
              >
                <div className="flex items-center gap-2">
                  {r.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-gate-pass" aria-hidden />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-gate-fail" aria-hidden />
                  )}
                  <span className="flex-1 truncate font-mono text-xs text-gate-text">{r.id}</span>
                </div>
                {r.repoFullName && (
                  <div className="mt-0.5 truncate font-mono text-[11px] text-gate-accent">
                    {r.repoFullName}
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-gate-muted">
                  {new Date(r.createdAt).toLocaleString()} · {r.fileCount} file(s) · {r.engine}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
