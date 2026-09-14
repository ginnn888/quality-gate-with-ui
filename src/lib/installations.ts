// "Installed" is not a database row — it is a fact about the repository on
// GitHub: it has `.github/workflows/quality-gate.yml`. Everything here derives
// the console's view of an installation from the repo's own contents, read with
// the signed-in user's token.

import {
  type GitHubRepo,
  GitHubError,
  getContentMeta,
  getJsonFile,
  getFileText,
  getRepo,
  getRequiredCheckState,
  listActionsSecretNames,
  listBranches,
  listIssueComments,
  listOpenPullRequests,
  listUserRepos,
  listWorkflowRuns,
  mapLimit,
} from "./github";
import {
  CONFIG_PATH,
  GATE_CHECK_CONTEXT,
  WORKFLOW_PATH,
  normalizeCoverageConfig,
  normalizeTriggers,
} from "./workflowTemplate";
import type {
  CoverageConfig,
  GatePrResult,
  InstalledRepo,
  InstalledRepoSummary,
  RepoSecretState,
  WorkflowRunRow,
  WorkflowTriggers,
} from "./types";

export { CONFIG_PATH, WORKFLOW_PATH };

/** How many of the user's most-recently-pushed repos the dashboard scans. */
const SCAN_LIMIT = 100;
const SCAN_CONCURRENCY = 12;

const WORKFLOW_FILE = WORKFLOW_PATH.split("/").pop() || "quality-gate.yml";
const GATE_COMMENT_MARKER = "AI-Powered Quality Gate Report";

/**
 * Recover the trigger settings from a workflow file the console generated. The
 * YAML is machine-written, so a light regex read is enough — and it means the
 * console does not need a YAML parser.
 */
export function parseTriggersFromYaml(yaml: string): WorkflowTriggers {
  const onBlock = yaml.split(/\npermissions:/)[0];
  const events: ("push" | "pull_request")[] = [];
  if (/\n\s{2}push:/.test(onBlock)) events.push("push");
  if (/\n\s{2}pull_request:/.test(onBlock)) events.push("pull_request");

  const branchMatch = onBlock.match(/branches:\s*\[([^\]]*)\]/);
  const branches = branchMatch
    ? branchMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
    : [];

  return normalizeTriggers({ events, branches });
}

function secretState(names: string[] | null): RepoSecretState {
  if (names === null) return { geminiApiKey: false, sonarToken: false, readable: false };
  return {
    readable: true,
    geminiApiKey: names.includes("GEMINI_API_KEY"),
    sonarToken: names.includes("SONAR_TOKEN"),
  };
}

/** Full installation view for one repo, or null when the workflow file is absent. */
export async function getInstalledRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<InstalledRepo | null> {
  const meta = await getRepo(token, owner, repo);
  return readInstalledRepo(token, meta);
}

async function readInstalledRepo(token: string, meta: GitHubRepo): Promise<InstalledRepo | null> {
  const branch = meta.defaultBranch;

  const [workflowText, coverageJson, configMeta, secretNames] = await Promise.all([
    getFileText(token, meta.owner, meta.name, WORKFLOW_PATH, branch),
    getJsonFile<Partial<CoverageConfig>>(token, meta.owner, meta.name, CONFIG_PATH, branch),
    getContentMeta(token, meta.owner, meta.name, CONFIG_PATH, branch),
    listActionsSecretNames(token, meta.owner, meta.name),
  ]);

  if (workflowText == null) return null;

  return {
    fullName: meta.fullName,
    owner: meta.owner,
    name: meta.name,
    private: meta.private,
    htmlUrl: meta.htmlUrl,
    defaultBranch: branch,
    coverage: normalizeCoverageConfig(coverageJson ?? {}),
    triggers: parseTriggersFromYaml(workflowText),
    hasWorkflow: true,
    hasConfig: configMeta != null,
    secrets: secretState(secretNames),
  };
}

type WorkflowHit = { repo: GitHubRepo; workflowText: string | null };

/**
 * The user's recently-pushed repos that carry the gate workflow. The
 * existence-check response already includes the file body, so the workflow text
 * is decoded here instead of being fetched a second time per repo.
 */
async function scanInstalled(token: string): Promise<WorkflowHit[]> {
  const repos = await listUserRepos(token, SCAN_LIMIT);

  const hits = await mapLimit(repos, SCAN_CONCURRENCY, async (r): Promise<WorkflowHit | null> => {
    const meta = await getContentMeta(token, r.owner, r.name, WORKFLOW_PATH, r.defaultBranch).catch(
      () => null,
    );
    if (!meta) return null;
    const workflowText = meta.contentBase64
      ? Buffer.from(meta.contentBase64, "base64").toString("utf8")
      : null;
    return { repo: r, workflowText };
  });

  return hits.filter((h): h is WorkflowHit => h !== null);
}

/** Every repo the signed-in user can reach that has the gate workflow installed. */
export async function listInstalledRepos(token: string): Promise<InstalledRepoSummary[]> {
  const hits = await scanInstalled(token);

  const summaries = await mapLimit(hits, SCAN_CONCURRENCY, async ({ repo: r, workflowText }) => {
    const cov = await getJsonFile<Partial<CoverageConfig>>(
      token,
      r.owner,
      r.name,
      CONFIG_PATH,
      r.defaultBranch,
    ).catch(() => null);

    const coverage = normalizeCoverageConfig(cov ?? {});
    const triggers = workflowText ? parseTriggersFromYaml(workflowText) : normalizeTriggers({});

    return {
      fullName: r.fullName,
      owner: r.owner,
      name: r.name,
      private: r.private,
      htmlUrl: r.htmlUrl,
      defaultBranch: r.defaultBranch,
      globalCoverage: coverage.global,
      branches: triggers.branches,
    } satisfies InstalledRepoSummary;
  });

  return summaries.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Just the lower-cased full names of installed repos — the scan without the
 * per-repo `config_cov.json` read. Used by `/repos` only to badge rows.
 */
export async function listInstalledFullNames(token: string): Promise<string[]> {
  const hits = await scanInstalled(token);
  return hits.map((h) => h.repo.fullName.toLowerCase());
}

// ── install-wizard context ────────────────────────────────────────────────

export interface RepoInstallContext {
  repo: GitHubRepo;
  branches: string[];
  /**
   * Cheap signals the wizard shows. The gate needs an npm project with jest and
   * sources under src/ to produce a passing run.
   */
  preflight: { hasPackageJson: boolean; hasSrcDir: boolean; hasJest: boolean };
}

/** Repo metadata + branch list + preflight, for the install wizard. */
export async function getRepoInstallContext(
  token: string,
  owner: string,
  repo: string,
): Promise<RepoInstallContext> {
  const meta = await getRepo(token, owner, repo);
  const [branches, pkgText, srcDir, jestConfig] = await Promise.all([
    listBranches(token, owner, repo).catch(() => [meta.defaultBranch]),
    getFileText(token, owner, repo, "package.json", meta.defaultBranch).catch(() => null),
    getContentMeta(token, owner, repo, "src", meta.defaultBranch).catch(() => null),
    getContentMeta(token, owner, repo, "jest.config.js", meta.defaultBranch).catch(() => null),
  ]);

  let hasPackageJson = false;
  let hasJest = Boolean(jestConfig);
  if (pkgText != null) {
    hasPackageJson = true;
    try {
      const pkg = JSON.parse(pkgText);
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if ("jest" in deps || pkg.jest != null) hasJest = true;
    } catch {
      /* unparseable package.json — leave hasJest as-is */
    }
  }

  return {
    repo: meta,
    branches,
    preflight: { hasPackageJson, hasSrcDir: Boolean(srcDir), hasJest },
  };
}

// ── installation detail (record + runs + per-PR results) ──────────────────

/** Parse the PASS / FAIL / SKIPPED verdict out of a posted gate report. */
function verdictFromReport(markdown: string | null): GatePrResult["reportVerdict"] {
  if (!markdown) return null;
  if (/Result:\s*✅\s*PASS\s*\(Skipped\)/i.test(markdown) || /checks were skipped/i.test(markdown)) {
    return "skipped";
  }
  if (/Overall Result:\s*✅\s*PASS/i.test(markdown) || /Overall Result:\s*PASS/i.test(markdown)) {
    return "pass";
  }
  if (/Overall Result:\s*❌\s*FAIL/i.test(markdown) || /Overall Result:\s*FAIL/i.test(markdown)) {
    return "fail";
  }
  return null;
}

/** For each open PR: its latest gate run and the report comment the action posted. */
async function gatePrResults(
  token: string,
  owner: string,
  repo: string,
): Promise<GatePrResult[]> {
  const [pulls, runs] = await Promise.all([
    listOpenPullRequests(token, owner, repo, 20).catch(() => []),
    listWorkflowRuns(token, owner, repo, WORKFLOW_FILE, 50).catch(() => []),
  ]);

  const runBySha = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (!runBySha.has(r.headSha)) runBySha.set(r.headSha, r);
  }

  return mapLimit(pulls, 6, async (pr) => {
    const run = runBySha.get(pr.headSha) ?? null;

    let reportMarkdown: string | null = null;
    let reportedAt: string | null = null;
    try {
      const comments = await listIssueComments(token, owner, repo, pr.number);
      const gate = [...comments].reverse().find((c) => c.body.includes(GATE_COMMENT_MARKER));
      if (gate) {
        reportMarkdown = gate.body;
        reportedAt = gate.updatedAt || gate.createdAt;
      }
    } catch {
      /* comments unreadable — leave report null */
    }

    return {
      pr,
      runStatus: run?.status ?? null,
      runConclusion: run?.conclusion ?? null,
      runHtmlUrl: run?.htmlUrl ?? null,
      reportMarkdown,
      reportedAt,
      reportVerdict: verdictFromReport(reportMarkdown),
    } satisfies GatePrResult;
  });
}

/** Whether the default branch requires the gate check before merge. */
export interface BranchProtectionState {
  /** false when the token can't read protection (needs repo admin). */
  readable: boolean;
  required: boolean;
  /** The status-check context a branch rule must require. */
  context: string;
}

export interface InstallationDetail {
  record: InstalledRepo;
  runs: WorkflowRunRow[];
  pulls: GatePrResult[];
  protection: BranchProtectionState;
}

/**
 * Everything the installation detail page renders: the installation record,
 * recent workflow runs, the per-PR gate results, and whether the default branch
 * requires the gate check. `null` when the repo has no gate workflow (or the
 * token cannot see the repo).
 */
export async function getInstallationDetail(
  token: string,
  owner: string,
  repo: string,
): Promise<InstallationDetail | null> {
  const record = await getInstalledRepo(token, owner, repo).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  });
  if (!record) return null;

  const [runs, pulls, check] = await Promise.all([
    listWorkflowRuns(token, owner, repo, WORKFLOW_FILE, 20).catch(() => []),
    gatePrResults(token, owner, repo),
    getRequiredCheckState(token, owner, repo, record.defaultBranch, GATE_CHECK_CONTEXT).catch(
      () => ({ readable: false, required: false }),
    ),
  ]);

  return {
    record,
    runs,
    pulls,
    protection: { ...check, context: GATE_CHECK_CONTEXT },
  };
}
