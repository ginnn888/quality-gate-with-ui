import type { GateConfig, GateEvent } from "./types";

// Builds the two files the console commits to a repo when the gate is
// installed: the GitHub Actions workflow and the thresholds file it reads.

/** `owner/repo/path@ref` of the reusable composite action. Overridable for forks. */
export const ACTION_REF =
  process.env.QG_ACTION_REF || "ginnn888/quality-gate-with-ui/action@main";

export const DEFAULT_GATE_CONFIG: GateConfig = {
  globalCoverage: 80,
  perFileCoverage: {},
  enableSonar: true,
  enableAiReview: true,
  branches: ["main"],
  events: ["push", "pull_request"],
};

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

/** Coerce arbitrary JSON into a valid GateConfig. */
export function normalizeGateConfig(input: unknown): GateConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<GateConfig>;

  const perFileCoverage: Record<string, number> = {};
  if (raw.perFileCoverage && typeof raw.perFileCoverage === "object") {
    for (const [k, v] of Object.entries(raw.perFileCoverage as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) perFileCoverage[k] = clampInt(n, 0, 100, 80);
    }
  }

  const events = Array.isArray(raw.events)
    ? (raw.events.filter((e) => e === "push" || e === "pull_request") as GateEvent[])
    : [];

  const branches = Array.isArray(raw.branches)
    ? Array.from(
        new Set(
          raw.branches
            .map((b) => String(b).trim())
            .filter((b) => b && /^[\w./-]+$/.test(b)),
        ),
      )
    : [];

  return {
    globalCoverage: clampInt(raw.globalCoverage, 0, 100, DEFAULT_GATE_CONFIG.globalCoverage),
    perFileCoverage,
    enableSonar: raw.enableSonar ?? DEFAULT_GATE_CONFIG.enableSonar,
    enableAiReview: raw.enableAiReview ?? DEFAULT_GATE_CONFIG.enableAiReview,
    branches: branches.length ? branches : [...DEFAULT_GATE_CONFIG.branches],
    events: events.length ? events : [...DEFAULT_GATE_CONFIG.events],
  };
}

/** Pretty-printed `quality-gate.config.json`. */
export function buildConfigJson(cfg: GateConfig): string {
  return (
    JSON.stringify(
      {
        globalCoverage: cfg.globalCoverage,
        perFileCoverage: cfg.perFileCoverage,
        enableSonar: cfg.enableSonar,
        enableAiReview: cfg.enableAiReview,
        branches: cfg.branches,
        events: cfg.events,
      },
      null,
      2,
    ) + "\n"
  );
}

const yamlList = (items: string[]) => `[${items.map((b) => JSON.stringify(b)).join(", ")}]`;

/** The `.github/workflows/quality-gate.yml` committed to the target repo. */
export function buildWorkflowYaml(cfg: GateConfig): string {
  const events = cfg.events.length ? cfg.events : DEFAULT_GATE_CONFIG.events;
  const branches = cfg.branches.length ? cfg.branches : DEFAULT_GATE_CONFIG.branches;

  const triggers = events
    .map((e: GateEvent) => `  ${e}:\n    branches: ${yamlList(branches)}`)
    .join("\n");

  return `# Managed by the Quality Gate console — reconfigure or remove it from the console.
name: Quality Gate

on:
${triggers}

permissions:
  contents: read
  pull-requests: write

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ${ACTION_REF}
        with:
          config-path: quality-gate.config.json
          gemini-api-key: \${{ secrets.GEMINI_API_KEY }}
          github-token: \${{ secrets.GITHUB_TOKEN }}
`;
}
