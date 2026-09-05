// Shared types for the Quality Gate console.
// The `Report` shape mirrors the `summary` object produced by
// Automated-Quality-Gate/generate-tests.js so the UI renders the same data
// that would otherwise land in a GitHub PR comment.

export type StepStatus = "pass" | "fail" | "skip" | "warn" | "running";

export interface WorkflowStep {
  name: string;
  status: StepStatus;
  durationMs: number;
  log: string;
}

export type ReviewStatus = "clean" | "suspicious" | "buggy";

export interface FileReview {
  status: ReviewStatus;
  findings: string;
  remediation: string;
}

export interface FileClassification {
  importance: "critical" | "high" | "medium" | "low";
  min_coverage_threshold: number;
  targetCoverage: number;
  focus_areas: string[];
  description: string;
  review: FileReview;
}

export interface FileCoverageStatus {
  actual: number;
  required: number;
  pass: boolean;
}

export interface AuditReport {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  isSecure: boolean;
  details: string[];
}

export interface SonarReport {
  enabled: boolean;
  /** false when Sonar is enabled but the API returned no usable analysis for this project/token */
  available: boolean;
  passed: boolean;
  metrics: {
    bugs: string | number;
    vulnerabilities: string | number;
    code_smells: string | number;
    security_hotspots: string | number;
  };
  issues: { severity: string; message: string; component: string; line?: number }[];
}

export interface CoverageSummary {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  required: number;
}

export interface Report {
  modifiedFiles: string[];
  classifications: Record<string, FileClassification>;
  fileStatus: Record<string, FileCoverageStatus>;
  audit: AuditReport;
  sonar: SonarReport;
  coverage: CoverageSummary;
  coverageMet: boolean;
  jestPassed: boolean;
  testsGenerated: number;
  analysis: string | null;
  sonarAnalysis: string | null;
  success: boolean;
}

export interface RunConfig {
  globalCoverage: number;
  perFileCoverage: Record<string, number>;
  enableSonar: boolean;
  enableAiReview: boolean;
}

/** GitHub events the installed workflow reacts to. */
export type GateEvent = "push" | "pull_request";

/**
 * The thresholds + trigger config the console commits to a repo as
 * `quality-gate.config.json` when the gate is installed. A superset of
 * `RunConfig`: the extra fields drive how the workflow YAML is generated.
 */
export interface GateConfig extends RunConfig {
  /** branches the workflow runs on (push + pull_request targets) */
  branches: string[];
  events: GateEvent[];
}

/** One repository the console has installed the quality gate onto. */
export interface InstallationRecord {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  installedBy: RunOwner;
  installedAt: string;
  updatedAt: string;
  config: GateConfig;
  workflowPath: string;
  configPath: string;
}

export interface InstallationSummaryRow {
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  branches: string[];
  installedAt: string;
  updatedAt: string;
  globalCoverage: number;
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

/** Where the analysed code came from. */
export interface RunSource {
  kind: "upload" | "repo";
  repo?: {
    fullName: string;
    owner: string;
    name: string;
    ref: string;
    private: boolean;
    htmlUrl: string;
  };
}

/** The GitHub account that started the run — runs are private to their owner. */
export interface RunOwner {
  login: string;
  name?: string | null;
  image?: string | null;
}

export interface RunRecord {
  id: string;
  createdAt: string;
  engine: "simulation" | "live";
  durationMs: number;
  config: RunConfig;
  /** `path` is the repository path when the run came from a repo. */
  files: { name: string; size: number; path?: string }[];
  steps: WorkflowStep[];
  report: Report;
  markdown: string;
  owner?: RunOwner;
  source?: RunSource;
}

export interface RunSummaryRow {
  id: string;
  createdAt: string;
  engine: "simulation" | "live";
  success: boolean;
  fileCount: number;
  durationMs: number;
  repoFullName?: string;
  sourceKind?: "upload" | "repo";
}
