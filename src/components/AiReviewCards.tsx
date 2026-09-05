import { ScanSearch } from "lucide-react";
import type { Report, ReviewStatus } from "@/lib/types";

const DOT: Record<ReviewStatus, string> = {
  clean: "bg-gate-pass",
  suspicious: "bg-gate-warn",
  buggy: "bg-gate-fail",
};

export function AiReviewCards({ report }: { report: Report }) {
  return (
    <section className="rounded-xl border border-gate-border bg-gate-panel shadow-card">
      <h3 className="flex items-center gap-2 border-b border-gate-border px-4 py-2.5 text-sm font-semibold text-gate-text">
        <ScanSearch className="h-4 w-4 text-gate-muted" aria-hidden />
        AI Proactive Code Review
      </h3>
      <div className="divide-y divide-gate-border">
        {report.modifiedFiles.map((f) => {
          const c = report.classifications[f];
          if (!c) return null;
          return (
            <article key={f} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[c.review.status]}`} aria-hidden />
                <span className="break-all font-mono text-xs text-gate-text">src/{f}</span>
                <span className="text-[11px] uppercase tracking-wide text-gate-muted">
                  {c.review.status}
                </span>
              </div>
              <p className="mt-1.5 break-words text-sm text-gate-muted">{c.review.findings}</p>
              {c.review.remediation && (
                <pre className="mt-2 max-w-full overflow-x-auto rounded-md border border-gate-border bg-gate-bg px-3 py-2 font-mono text-xs text-gate-text">
{c.review.remediation}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
