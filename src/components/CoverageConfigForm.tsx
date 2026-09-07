"use client";

import { useState } from "react";
import { GitBranch, Plus, SlidersHorizontal, X } from "lucide-react";
import type { CoverageConfig, GateEvent, WorkflowTriggers } from "@/lib/types";

const EVENTS: { value: GateEvent; label: string }[] = [
  { value: "push", label: "Push" },
  { value: "pull_request", label: "Pull request" },
];

/**
 * The install / reconfigure form. Two things the console owns:
 *  - `config_cov.json` coverage thresholds (global + per-file), read by the action
 *  - the workflow `on:` triggers (branches + events), baked into the YAML
 */
export function CoverageConfigForm({
  coverage,
  triggers,
  onCoverageChange,
  onTriggersChange,
  branchOptions = [],
  disabled,
  showTriggers = true,
}: {
  coverage: CoverageConfig;
  triggers: WorkflowTriggers;
  onCoverageChange: (c: CoverageConfig) => void;
  onTriggersChange: (t: WorkflowTriggers) => void;
  branchOptions?: string[];
  disabled?: boolean;
  showTriggers?: boolean;
}) {
  const [newPath, setNewPath] = useState("");

  const fileRows = Object.entries(coverage.files);

  const setFile = (path: string, pct: number) =>
    onCoverageChange({ ...coverage, files: { ...coverage.files, [path]: pct } });

  const removeFile = (path: string) => {
    const next = { ...coverage.files };
    delete next[path];
    onCoverageChange({ ...coverage, files: next });
  };

  const addFile = () => {
    const p = newPath.trim();
    if (!p || coverage.files[p] != null) return;
    onCoverageChange({ ...coverage, files: { ...coverage.files, [p]: coverage.global } });
    setNewPath("");
  };

  const toggleBranch = (b: string) => {
    const has = triggers.branches.includes(b);
    onTriggersChange({
      ...triggers,
      branches: has ? triggers.branches.filter((x) => x !== b) : [...triggers.branches, b],
    });
  };

  const toggleEvent = (e: GateEvent) => {
    const has = triggers.events.includes(e);
    const next = has ? triggers.events.filter((x) => x !== e) : [...triggers.events, e];
    onTriggersChange({ ...triggers, events: next.length ? next : triggers.events });
  };

  const branchChoices = Array.from(new Set([...branchOptions, ...triggers.branches]));

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <SlidersHorizontal className="h-4 w-4 text-gate-muted" aria-hidden />
          Coverage thresholds
          <span className="ml-auto font-mono text-[11px] font-normal text-gate-muted">
            config_cov.json
          </span>
        </h3>

        <label className="block">
          <div className="flex items-center justify-between text-xs text-gate-muted">
            <span>Global target — every changed file must reach this</span>
            <span className="font-mono text-gate-text">{coverage.global}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={coverage.global}
            disabled={disabled}
            onChange={(e) => onCoverageChange({ ...coverage, global: Number(e.target.value) })}
            className="mt-1 w-full accent-gate-accent"
          />
        </label>

        <div className="space-y-2">
          <p className="text-xs text-gate-muted">Per-file overrides</p>

          {fileRows.length === 0 && (
            <p className="text-[11px] text-gate-muted">
              None — every file uses the global {coverage.global}% target.
            </p>
          )}

          {fileRows.map(([path, pct]) => (
            <div key={path} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-gate-accentSoft/60 px-2 py-1 text-[11px] text-gate-text">
                {path}
              </code>
              <input
                type="number"
                min={0}
                max={100}
                value={pct}
                disabled={disabled}
                onChange={(e) =>
                  setFile(path, Math.max(0, Math.min(100, Math.round(Number(e.target.value)) || 0)))
                }
                className="w-16 rounded border border-gate-border bg-gate-panel px-2 py-1 text-right text-xs text-gate-text outline-none focus:border-gate-accent"
              />
              <span className="text-xs text-gate-muted">%</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeFile(path)}
                aria-label={`Remove ${path}`}
                className="rounded p-1 text-gate-muted hover:text-gate-fail disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newPath}
              disabled={disabled}
              placeholder="src/path/to/file.js"
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFile();
                }
              }}
              className="min-w-0 flex-1 rounded border border-gate-border bg-gate-panel px-2 py-1 font-mono text-[11px] text-gate-text outline-none focus:border-gate-accent"
            />
            <button
              type="button"
              disabled={disabled || !newPath.trim()}
              onClick={addFile}
              className="inline-flex items-center gap-1 rounded border border-gate-border px-2 py-1 text-[11px] font-medium text-gate-muted hover:text-gate-accent disabled:opacity-40"
            >
              <Plus className="h-3 w-3" aria-hidden />
              Add
            </button>
          </div>
        </div>
      </div>

      {showTriggers && (
        <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
            <GitBranch className="h-4 w-4 text-gate-muted" aria-hidden />
            Triggers
            <span className="ml-auto font-mono text-[11px] font-normal text-gate-muted">
              quality-gate.yml
            </span>
          </h3>

          <div>
            <p className="text-xs text-gate-muted">Branches to watch</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {branchChoices.length === 0 && (
                <span className="text-[11px] text-gate-muted">loading branches…</span>
              )}
              {branchChoices.map((b) => {
                const on = triggers.branches.includes(b);
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
            {triggers.branches.length === 0 && (
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
                    checked={triggers.events.includes(value)}
                    disabled={disabled}
                    onChange={() => toggleEvent(value)}
                    className="accent-gate-accent"
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gate-muted">
              The full report is posted as a PR comment on <span className="font-mono">pull_request</span>{" "}
              events; <span className="font-mono">push</span> events write to the run summary only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
