import { Bot, CheckCircle2, XCircle } from "lucide-react";
import type { Report } from "@/lib/types";

export function CoverageTable({ report }: { report: Report }) {
  return (
    <section className="min-w-0 rounded-xl border border-gate-border bg-gate-panel shadow-card">
      <h3 className="flex items-center gap-2 border-b border-gate-border px-4 py-2.5 text-sm font-semibold text-gate-text">
        <Bot className="h-4 w-4 text-gate-muted" aria-hidden />
        AI Code Classification &amp; Coverage
      </h3>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gate-muted">
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Importance</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">Actual</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gate-border">
            {report.modifiedFiles.map((f) => {
              const c = report.classifications[f];
              const s = report.fileStatus[f] || { actual: 0, required: 0, pass: false };
              return (
                <tr key={f}>
                  <td className="px-4 py-2 font-mono text-xs text-gate-text">src/{f}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-gate-accentSoft px-1.5 py-0.5 text-[11px] uppercase text-gate-muted">
                      {c?.importance ?? "medium"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gate-muted">{s.required}%</td>
                  <td className={`px-4 py-2 font-semibold ${s.pass ? "text-gate-text" : "text-gate-fail"}`}>
                    {s.actual}%
                  </td>
                  <td className="px-4 py-2">
                    {s.pass ? (
                      <CheckCircle2 className="h-4 w-4 text-gate-pass" aria-hidden />
                    ) : (
                      <XCircle className="h-4 w-4 text-gate-fail" aria-hidden />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
