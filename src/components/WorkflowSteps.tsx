"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Workflow } from "lucide-react";
import type { WorkflowStep } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function WorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({ });

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-gate-border bg-gate-panel shadow-card">
      <div className="flex items-center gap-2 border-b border-gate-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gate-muted">
        <Workflow className="h-3.5 w-3.5" aria-hidden />
        Workflow run · automated-quality-gate
      </div>
      <ul className="divide-y divide-gate-border">
        {steps.map((step, i) => {
          const isOpen = open[i] ?? (step.status === "fail");
          return (
            <li key={i}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gate-accent/5"
              >
                <span className="shrink-0 text-gate-muted">
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <span className="shrink-0">
                  <StatusBadge status={step.status} />
                </span>
                <span className="min-w-0 flex-1 break-words text-sm text-gate-text">{step.name}</span>
                <span className="shrink-0 font-mono text-xs text-gate-muted">{fmt(step.durationMs)}</span>
              </button>
              {isOpen && (
                <pre className="max-h-72 max-w-full overflow-auto border-t border-gate-border bg-gate-bg px-4 py-3 font-mono text-xs leading-relaxed text-gate-muted">
{step.log || "(no output)"}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
