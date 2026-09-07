import type { CoverageConfig, GateEvent, WorkflowTriggers } from "./types";

// The two files the console commits to a repository when the gate is installed:
//   .github/workflows/quality-gate.yml  — the GitHub Actions workflow
//   config_cov.json                     — the coverage thresholds the action reads

export const WORKFLOW_PATH = ".github/workflows/quality-gate.yml";
export const CONFIG_PATH = "config_cov.json";

/** The Automated Quality Gate bundle is committed into the target repo here. */
export const ACTION_DIR = ".quality-gate";
/** Every file the console writes into a target repo, for drift checks + uninstall. */
export const MANAGED_PATHS = [
  WORKFLOW_PATH,
  CONFIG_PATH,
  `${ACTION_DIR}/action.yml`,
  `${ACTION_DIR}/dist/index.js`,
];

export const DEFAULT_COVERAGE: CoverageConfig = { global: 80, files: {} };
export const DEFAULT_TRIGGERS: WorkflowTriggers = {
  branches: ["main"],
  events: ["push", "pull_request"],
};

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

/** Coerce arbitrary JSON (e.g. an existing config_cov.json) into a CoverageConfig. */
export function normalizeCoverageConfig(input: unknown): CoverageConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const files: Record<string, number> = {};
  const rawFiles = raw.files;
  if (rawFiles && typeof rawFiles === "object") {
    for (const [k, v] of Object.entries(rawFiles as Record<string, unknown>)) {
      const path = String(k).trim();
      const n = Number(v);
      if (path && Number.isFinite(n)) files[path] = clampInt(n, 0, 100, DEFAULT_COVERAGE.global);
    }
  }

  return {
    global: clampInt(raw.global, 0, 100, DEFAULT_COVERAGE.global),
    files,
  };
}

/** Coerce arbitrary JSON into a valid WorkflowTriggers. */
export function normalizeTriggers(input: unknown): WorkflowTriggers {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<WorkflowTriggers>;

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
    branches: branches.length ? branches : [...DEFAULT_TRIGGERS.branches],
    events: events.length ? events : [...DEFAULT_TRIGGERS.events],
  };
}

/** Pretty-printed `config_cov.json`. */
export function buildCoverageConfigJson(cfg: CoverageConfig): string {
  return JSON.stringify({ global: cfg.global, files: cfg.files }, null, 2) + "\n";
}

const yamlList = (items: string[]) => `[${items.map((b) => JSON.stringify(b)).join(", ")}]`;

/** The `.github/workflows/quality-gate.yml` committed to the target repo. */
export function buildWorkflowYaml(triggers: WorkflowTriggers): string {
  const events = triggers.events.length ? triggers.events : DEFAULT_TRIGGERS.events;
  const branches = triggers.branches.length ? triggers.branches : DEFAULT_TRIGGERS.branches;

  const on = events
    .map((e: GateEvent) => `  ${e}:\n    branches: ${yamlList(branches)}`)
    .join("\n");

  return `# Managed by the Quality Gate console — reconfigure or remove it from the console.
name: Quality Gate

on:
${on}

permissions:
  contents: read
  pull-requests: write
  statuses: write
  checks: write

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
      GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
      SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}
      GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      # Only when this repo is actually an npm project. A repo without a
      # package.json still runs the gate — it just has nothing to test.
      - name: Install dependencies
        run: |
          if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
            npm ci
          elif [ -f package.json ]; then
            npm install
          else
            echo "::notice::No package.json in this repository — skipping dependency install."
          fi

      # Phase 1: AI review + test generation + coverage/audit gate. Writes state.
      - name: Quality Gate (prepare)
        if: always()
        run: node ${ACTION_DIR}/dist/index.js --prepare

      # SonarCloud runs only when a SONAR_TOKEN repo secret is set; a missing
      # sonar-project.properties must not fail the whole workflow.
      - name: SonarCloud Scan
        if: \${{ always() && env.SONAR_TOKEN != '' }}
        continue-on-error: true
        uses: sonarsource/sonarqube-scan-action@v6
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}

      # Phase 2: fetch Sonar status, assemble the report, post it to the PR,
      # and exit non-zero when the gate failed.
      - name: Quality Gate (report)
        if: always()
        run: node ${ACTION_DIR}/dist/index.js --report
`;
}
