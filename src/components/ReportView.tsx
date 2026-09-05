import { FileSearch, Wrench } from "lucide-react";
import type { RunRecord } from "@/lib/types";
import { OverallResult } from "./OverallResult";
import { WorkflowSteps } from "./WorkflowSteps";
import { CoverageTable } from "./CoverageTable";
import { AiReviewCards } from "./AiReviewCards";
import { AuditSonarCards } from "./AuditSonarCards";
import { MarkdownReport } from "./MarkdownReport";
import { ShareBar } from "./ShareBar";

export function ReportView({ run }: { run: RunRecord }) {
  return (
    <div className="min-w-0 space-y-5">
      <OverallResult run={run} />
      <ShareBar run={run} />
      {run.report.analysis && (
        <div className="rounded-xl border border-gate-fail/30 bg-gate-fail/10 p-4 text-sm text-gate-text shadow-card">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <FileSearch className="h-4 w-4 text-gate-fail" aria-hidden />
            AI Test Failure Analysis
          </div>
          <p className="text-gate-muted">{run.report.analysis}</p>
        </div>
      )}
      <WorkflowSteps steps={run.steps} />
      <CoverageTable report={run.report} />
      <AiReviewCards report={run.report} />
      <AuditSonarCards report={run.report} />
      {run.report.sonarAnalysis && (
        <div className="rounded-xl border border-gate-border bg-gate-panel p-4 text-sm shadow-card">
          <div className="mb-1 flex items-center gap-2 font-semibold text-gate-text">
            <Wrench className="h-4 w-4 text-gate-muted" aria-hidden />
            AI SonarCloud Remediation
          </div>
          <pre className="max-w-full whitespace-pre-wrap break-words font-mono text-xs text-gate-muted">
{run.report.sonarAnalysis}
          </pre>
        </div>
      )}
      <MarkdownReport markdown={run.markdown} />
    </div>
  );
}
