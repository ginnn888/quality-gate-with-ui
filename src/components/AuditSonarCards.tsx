import { Radar, ShieldCheck } from "lucide-react";
import type { Report } from "@/lib/types";

export function AuditSonarCards({ report }: { report: Report }) {
  const a = report.audit;
  const s = report.sonar;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <ShieldCheck className="h-4 w-4 text-gate-muted" aria-hidden />
          Security &amp; Audit · npm audit
        </h3>
        <p className={`mt-1 text-sm font-semibold ${a.isSecure ? "text-gate-pass" : "text-gate-fail"}`}>
          {a.isSecure ? "SECURE" : "VULNERABLE"}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {(["critical", "high", "moderate", "low"] as const).map((k) => (
            <div key={k} className="rounded border border-gate-border bg-gate-bg py-2">
              <div className="text-base font-bold text-gate-text">{a[k]}</div>
              <div className="text-[10px] uppercase text-gate-muted">{k}</div>
            </div>
          ))}
        </div>
        {a.details.length > 0 && (
          <ul className="mt-3 max-h-32 space-y-0.5 overflow-auto break-words text-xs text-gate-muted">
            {a.details.slice(0, 12).map((d, i) => (
              <li key={i}>· {d}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <Radar className="h-4 w-4 text-gate-muted" aria-hidden />
          SonarCloud Quality Gate
        </h3>
        {!s.enabled ? (
          <p className="mt-1 text-sm text-gate-muted">Skipped — SonarCloud not enabled for this run.</p>
        ) : !s.available ? (
          <p className="mt-1 text-sm text-gate-warn">
            Unavailable — no fresh SonarCloud analysis for this project/token. Not counted toward the
            result. (The console does not run a sonar-scanner upload.)
          </p>
        ) : (
          <>
            <p className={`mt-1 text-sm font-semibold ${s.passed ? "text-gate-pass" : "text-gate-fail"}`}>
              {s.passed ? "PASSED" : "FAILED"}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {(
                [
                  ["bugs", s.metrics.bugs],
                  ["vulns", s.metrics.vulnerabilities],
                  ["smells", s.metrics.code_smells],
                  ["hotspots", s.metrics.security_hotspots],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="rounded border border-gate-border bg-gate-bg py-2">
                  <div className="text-base font-bold text-gate-text">{val}</div>
                  <div className="text-[10px] uppercase text-gate-muted">{label}</div>
                </div>
              ))}
            </div>
            {s.issues.length > 0 && (
              <ul className="mt-3 max-h-32 space-y-1 overflow-auto text-xs text-gate-muted">
                {s.issues.slice(0, 8).map((i, idx) => (
                  <li key={idx}>
                    <span className="font-semibold text-gate-warn">[{i.severity}]</span> {i.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
