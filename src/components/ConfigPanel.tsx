"use client";

import { SlidersHorizontal } from "lucide-react";
import type { RunConfig } from "@/lib/types";

export function ConfigPanel({
  config,
  onChange,
  disabled,
}: {
  config: RunConfig;
  onChange: (c: RunConfig) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<RunConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-4 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
        <SlidersHorizontal className="h-4 w-4 text-gate-muted" aria-hidden />
        Run configuration
      </h3>

      <label className="block">
        <div className="flex items-center justify-between text-xs text-gate-muted">
          <span>Global coverage target</span>
          <span className="font-mono text-gate-text">{config.globalCoverage}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={config.globalCoverage}
          disabled={disabled}
          onChange={(e) => set({ globalCoverage: Number(e.target.value) })}
          className="mt-1 w-full accent-gate-accent"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-gate-text">
        <input
          type="checkbox"
          checked={config.enableAiReview}
          disabled={disabled}
          onChange={(e) => set({ enableAiReview: e.target.checked })}
          className="accent-gate-accent"
        />
        AI proactive code review (Gemini)
      </label>

      <label className="flex items-center gap-2 text-sm text-gate-text">
        <input
          type="checkbox"
          checked={config.enableSonar}
          disabled={disabled}
          onChange={(e) => set({ enableSonar: e.target.checked })}
          className="accent-gate-accent"
        />
        SonarCloud Quality Gate
      </label>

      <p className="text-[11px] leading-relaxed text-gate-muted">
        Live Gemini/Sonar calls run only when <code className="text-gate-text">GEMINI_API_KEY</code> /{" "}
        <code className="text-gate-text">SONAR_TOKEN</code> are set and{" "}
        <code className="text-gate-text">QG_ENGINE=live</code>. Otherwise the simulation engine runs
        real static analysis over your files.
      </p>
    </div>
  );
}
