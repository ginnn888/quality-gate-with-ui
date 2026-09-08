import type { CoverageConfig, GateEvent, WorkflowTriggers } from "./types";

// The two files the console commits to a repository when the gate is installed:
//   .github/workflows/quality-gate.yml  — the GitHub Actions workflow
//   config_cov.json                     — the coverage thresholds the action reads
//
// The analysis itself is NOT vendored into the repo. The workflow calls the
// Automated Quality Gate straight from its source repository with
// `uses: ginnn888/aqg-github-marketplace@<ref>`, so every run pulls the current
// version of the gate and there is nothing to keep in sync.

export const WORKFLOW_PATH = ".github/workflows/quality-gate.yml";
export const CONFIG_PATH = "config_cov.json";

/** The Automated Quality Gate action, consumed directly from its repo. */
export const AQG_ACTION_REPO = "ginnn888/aqg-github-marketplace";
/** Git ref of the action to pin the workflow to. `main` tracks the latest gate. */
export const AQG_ACTION_REF = (process.env.AQG_ACTION_REF || "main").trim() || "main";
/** `owner/repo@ref` as it appears in the generated `uses:` line. */
export const AQG_ACTION_USES = `${AQG_ACTION_REPO}@${AQG_ACTION_REF}`;

/** Every file the console writes into a target repo, for drift checks + uninstall. */
export const MANAGED_PATHS = [WORKFLOW_PATH, CONFIG_PATH];

/**
 * Files an older console version vendored into repos under `.quality-gate/`.
 * Nothing writes these any more; uninstall still sweeps them so upgraded
 * installs don't leave a dead action bundle behind.
 */
export const LEGACY_PATHS = [".quality-gate/action.yml", ".quality-gate/dist/index.js"];

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
# The analysis is the Automated Quality Gate, pulled straight from
# github.com/${AQG_ACTION_REPO} on every run (ref: ${AQG_ACTION_REF}).
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
      # Job-level so the SonarCloud step's \`if:\` can see whether the secret is set.
      SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # No \`cache: npm\` here on purpose — the gate installs onto arbitrary repos,
      # and setup-node's cache errors when there is no lockfile anywhere.
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

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

      # SonarCloud runs only when a SONAR_TOKEN repo secret is set; a missing
      # sonar-project.properties must not fail the whole workflow.
      - name: SonarCloud Scan
        if: \${{ always() && env.SONAR_TOKEN != '' }}
        continue-on-error: true
        uses: sonarsource/sonarqube-scan-action@v6
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}

      # AI review + test generation + coverage/audit/Sonar gate. Posts the full
      # report as a PR comment and exits non-zero when the gate fails.
      - name: Automated Quality Gate
        if: always()
        uses: ${AQG_ACTION_USES}
        with:
          gemini_api_key: \${{ secrets.GEMINI_API_KEY }}
          sonar_token: \${{ secrets.SONAR_TOKEN }}
          github_token: \${{ secrets.GITHUB_TOKEN }}
`;
}
