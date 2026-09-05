import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import type { StepStatus } from "@/lib/types";

const MAP: Record<StepStatus, { label: string; cls: string; Icon: ComponentType<{ className?: string }> }> = {
  pass: { label: "pass", cls: "bg-gate-pass/15 text-gate-pass border-gate-pass/30", Icon: CheckCircle2 },
  fail: { label: "fail", cls: "bg-gate-fail/15 text-gate-fail border-gate-fail/30", Icon: XCircle },
  warn: { label: "warn", cls: "bg-gate-warn/15 text-gate-warn border-gate-warn/30", Icon: AlertTriangle },
  skip: { label: "skipped", cls: "bg-gate-skip/15 text-gate-muted border-gate-skip/30", Icon: CircleDashed },
  running: {
    label: "running",
    cls: "bg-gate-accent/15 text-gate-accent border-gate-accent/30",
    Icon: Loader2,
  },
};

export function StatusBadge({ status, className = "" }: { status: StepStatus; className?: string }) {
  const s = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls} ${className}`}
    >
      <s.Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} aria-hidden />
      {s.label}
    </span>
  );
}
