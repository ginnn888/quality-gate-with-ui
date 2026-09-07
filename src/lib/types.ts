// Shared types for the Quality Gate console.
//
// The console does not run any analysis itself. It installs the Automated
// Quality Gate GitHub Action onto a repository, tunes its coverage config, and
// reads back what the Action posts to each pull request. Everything here
// describes either the files committed into a repo or data pulled from GitHub.

/** GitHub events the installed workflow reacts to. */
export type GateEvent = "push" | "pull_request";

/**
 * `config_cov.json` — the file the Automated Quality Gate action reads for its
 * coverage thresholds. Shape matches `generate-tests.js` (`qgConfig.global`,
 * `qgConfig.files[path]`).
 */
export interface CoverageConfig {
  /** global statement-coverage target, 0–100 */
  global: number;
  /** per-file overrides, keyed by repo-relative path e.g. "src/math.js" */
  files: Record<string, number>;
}

/**
 * Trigger settings baked into the generated workflow YAML. Not read by the
 * action — they only shape the `on:` block of `.github/workflows/quality-gate.yml`.
 */
export interface WorkflowTriggers {
  branches: string[];
  events: GateEvent[];
}

/** Which Actions secrets the target repo already has (names only — values never leave GitHub). */
export interface RepoSecretState {
  geminiApiKey: boolean;
  sonarToken: boolean;
  /** false when the token cannot read the repo's secret list (needs admin) */
  readable: boolean;
}

/** Everything the console needs to render and edit one installed repository. */
export interface InstalledRepo {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  coverage: CoverageConfig;
  triggers: WorkflowTriggers;
  hasWorkflow: boolean;
  hasConfig: boolean;
  secrets: RepoSecretState;
}

/** Compact row for the installed-repos dashboard. */
export interface InstalledRepoSummary {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  globalCoverage: number;
  branches: string[];
}

/** A GitHub Actions workflow run, as shown on the installation detail page. */
export interface WorkflowRunRow {
  id: number;
  runNumber: number;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string | null;
  headSha: string;
  htmlUrl: string;
  createdAt: string;
}

/** One pull request on an installed repo. */
export interface PullRequestRow {
  number: number;
  title: string;
  htmlUrl: string;
  headBranch: string;
  headSha: string;
  author: string;
  updatedAt: string;
}

/** A pull request plus the Quality Gate outcome the Action reported on it. */
export interface GatePrResult {
  pr: PullRequestRow;
  /** latest workflow run for this PR's head sha */
  runStatus: string | null;
  runConclusion: string | null;
  runHtmlUrl: string | null;
  /** the Automated Quality Gate report comment body, if one has been posted */
  reportMarkdown: string | null;
  reportedAt: string | null;
}
