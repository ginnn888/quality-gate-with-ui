"use client";

import { GitBranch } from "lucide-react";
import { ConfigPanel } from "@/components/ConfigPanel";
import type { GateConfig, GateEvent, RunConfig } from "@/lib/types";

const EVENTS: { value: GateEvent; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "pull_request", label: "Pull request" },
];

/**
 * The install / reconfigure form: the shared run thresholds (via ConfigPanel)
 * plus the two fields that only matter for an installed gate — which branches
 * it watches and which events trigger it.
 */
export function GateConfigPanel({
  config,
  onChange,
  branchOptions = [],
  disabled,
}: {
  config: GateConfig;
  onChange: (c: GateConfig) => void;
  branchOptions?: string[];
  disabled?: boolean;
}) {
  const setRun = (c: RunConfig) => onChange({ ...config, ...c });

  const toggleBranch = (b: string) => {
    const has = config.branches.includes(b);
    onChange({
      ...config,
      branches: has ? config.branches.filter((x) => x !== b) : [...config.branches, b],
    });
  };

  const toggleEvent = (e: GateEvent) => {
    const has = config.events.includes(e);
    const next = has ? config.events.filter((x) => x !== e) : [...config.events, e];
    onChange({ ...config, events: next.length ? next : config.events });
  };

  const options = Array.from(new Set([...branchOptions, ...config.branches]));

  return (
    <div className="space-y-4">
      <ConfigPanel config={config} onChange={setRun} disabled={disabled} />

      <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <GitBranch className="h-4 w-4 text-gate-muted" aria-hidden />
          Triggers
        </h3>

        <div>
          <p className="text-xs text-gate-muted">Branches to watch</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {options.length === 0 && (
              <span className="text-[11px] text-gate-muted">loading branches…</span>
            )}
            {options.map((b) => {
              const on = config.branches.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleBranch(b)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition disabled:opacity-50 ${
                    on
                      ? "border-gate-accent/40 bg-gate-accentSoft text-gate-accent"
                      : "border-gate-border text-gate-muted hover:text-gate-text"
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
          {config.branches.length === 0 && (
            <p className="mt-1 text-[11px] text-gate-fail">Select at least one branch.</p>
          )}
        </div>

        <div>
          <p className="text-xs text-gate-muted">Events</p>
          <div className="mt-1.5 flex gap-3">
            {EVENTS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-gate-text">
                <input
                  type="checkbox"
                  checked={config.events.includes(value)}
                  disabled={disabled}
                  onChange={() => toggleEvent(value)}
                  className="accent-gate-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
