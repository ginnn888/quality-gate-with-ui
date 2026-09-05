"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, History, XCircle } from "lucide-react";
import type { RunSummaryRow } from "@/lib/types";

export default function HistoryPage() {
  const [rows, setRows] = useState<RunSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => alive && setRows(d.runs ?? []))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gate-text">
          <History className="h-5 w-5 text-gate-muted" aria-hidden />
          Run history
        </h1>
        <p className="mt-1 text-sm text-gate-muted">
          Every manual run you have started, newest first. Each links to its shareable report.
        </p>
      </section>

      <div className="overflow-hidden rounded-xl border border-gate-border bg-gate-panel shadow-card">
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">
            No runs yet — start one from{" "}
            <Link href="/" className="text-gate-accent hover:underline">
              Run gate
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-gate-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/runs/${r.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-gate-accent/5"
                >
                  {r.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-gate-pass" aria-hidden />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-gate-fail" aria-hidden />
                  )}
                  <span className="font-mono text-xs text-gate-text">{r.id}</span>
                  {r.repoFullName && (
                    <span className="font-mono text-[11px] text-gate-accent">{r.repoFullName}</span>
                  )}
                  <span className="ml-auto text-[11px] text-gate-muted">
                    {new Date(r.createdAt).toLocaleString()} · {r.fileCount} file(s) · {r.engine}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
