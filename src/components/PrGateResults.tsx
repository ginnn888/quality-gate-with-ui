"use client";

// One row per open PR on the installation detail page: a PASS/FAIL/SKIPPED
// badge (parsed from the report text by installations.ts), the workflow run
// status, and — on click — the full report inline via <MarkdownReport>. A PR
// the gate hasn't commented on yet just shows "No report yet" with expand
// disabled; there's nothing to open.
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { MarkdownReport } from "@/components/MarkdownReport";
import type { GatePrResult } from "@/lib/types";

function VerdictBadge({ verdict }: { verdict: GatePrResult["reportVerdict"] }) {
  if (!verdict) return null;
  const map = {
    pass: { cls: "bg-gate-pass/15 text-gate-pass", Icon: CheckCircle2, label: "PASS" },
    fail: { cls: "bg-gate-fail/15 text-gate-fail", Icon: XCircle, label: "FAIL" },
    skipped: { cls: "bg-gate-skip/15 text-gate-muted", Icon: MinusCircle, label: "SKIPPED" },
  } as const;
  const { cls, Icon, label } = map[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

function StatusPill({ result }: { result: GatePrResult }) {
  const { runStatus, runConclusion } = result;
  const label = runConclusion ?? runStatus ?? "no run";
  const cls =
    runConclusion === "success"
      ? "bg-gate-pass/15 text-gate-pass"
      : runConclusion === "failure"
        ? "bg-gate-fail/15 text-gate-fail"
        : runStatus && runStatus !== "completed"
          ? "bg-gate-blueSoft text-gate-blue"
          : "bg-gate-skip/15 text-gate-muted";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function PrGateResults({ pulls }: { pulls: GatePrResult[] }) {
  const [open, setOpen] = useState<number | null>(null);

  if (pulls.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gate-border bg-gate-panel px-4 py-6 text-center text-xs text-gate-muted">
        No open pull requests. Open one on a watched branch and the gate report will appear here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {pulls.map((r) => {
        const isOpen = open === r.pr.number;
        return (
          <li
            key={r.pr.number}
            className="overflow-hidden rounded-xl border border-gate-border bg-gate-panel shadow-card"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
              <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-gate-muted" aria-hidden />
              <a
                href={r.pr.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium text-gate-text hover:text-gate-accent"
              >
                <span className="font-mono text-gate-muted">#{r.pr.number}</span> {r.pr.title}
              </a>
              <VerdictBadge verdict={r.reportVerdict} />
              <StatusPill result={r} />
              {r.runHtmlUrl && (
                <a
                  href={r.runHtmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-gate-muted hover:text-gate-accent"
                  aria-label="Open the workflow run"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
              <button
                type="button"
                disabled={!r.reportMarkdown}
                onClick={() => setOpen(isOpen ? null : r.pr.number)}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-gate-border px-2 py-1 text-[11px] font-medium text-gate-muted hover:text-gate-accent disabled:opacity-40"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
                {r.reportMarkdown ? "Report" : "No report yet"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 px-3 pb-2 text-[11px] text-gate-muted">
              <span className="font-mono">{r.pr.headBranch}</span>
              <span>by {r.pr.author}</span>
              {r.reportedAt && (
                <span className="ml-auto">
                  reported {new Date(r.reportedAt).toLocaleString()}
                </span>
              )}
            </div>

            {isOpen && r.reportMarkdown && (
              <div className="border-t border-gate-border p-3">
                <MarkdownReport markdown={r.reportMarkdown} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
