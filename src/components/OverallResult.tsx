import { CheckCircle2, XCircle } from "lucide-react";
import type { RunRecord } from "@/lib/types";

function fmt(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function OverallResult({ run }: { run: RunRecord }) {
  const ok = run.report.success;
  return (
    <div
      className={`min-w-0 rounded-xl border p-5 shadow-card ${
        ok
          ? "border-gate-pass/30 bg-gate-pass/10"
          : "border-gate-fail/30 bg-gate-fail/10"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            ok ? "bg-gate-pass/15 text-gate-pass" : "bg-gate-fail/15 text-gate-fail"
          }`}
        >
          {ok ? (
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          ) : (
            <XCircle className="h-6 w-6" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gate-text">
            Quality Gate: {ok ? "PASS" : "FAIL"}
          </h2>
          <p className="break-words text-xs text-gate-muted">
            run <span className="font-mono">{run.id}</span> · {run.engine} engine ·{" "}
            {new Date(run.createdAt).toLocaleString()} · {fmt(run.durationMs)}
          </p>
          {run.source?.repo && (
            <p className="break-words text-xs text-gate-muted">
              source{" "}
              <a
                href={run.source.repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-gate-accent hover:underline"
              >
                {run.source.repo.fullName}
              </a>{" "}
              @ <span className="font-mono">{run.source.repo.ref}</span>
              {run.owner?.login && <> · started by {run.owner.login}</>}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Files" value={String(run.files.length)} />
        <Metric
          label="Coverage"
          value={`${run.report.coverage.statements}%`}
          sub={`target ${run.report.coverage.required}%`}
          bad={!run.report.coverageMet}
        />
        <Metric
          label="npm audit"
          value={run.report.audit.isSecure ? "secure" : "vulnerable"}
          bad={!run.report.audit.isSecure}
        />
        <Metric
          label="SonarCloud"
          value={
            !run.report.sonar.enabled
              ? "skipped"
              : !run.report.sonar.available
                ? "unavailable"
                : run.report.sonar.passed
                  ? "passed"
                  : "failed"
          }
          bad={
            run.report.sonar.enabled &&
            run.report.sonar.available &&
            !run.report.sonar.passed
          }
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
}) {
  return (
    <div className="rounded-md border border-gate-border bg-gate-bg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gate-muted">{label}</div>
      <div className={`text-sm font-semibold ${bad ? "text-gate-fail" : "text-gate-text"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-gate-muted">{sub}</div>}
    </div>
  );
}
