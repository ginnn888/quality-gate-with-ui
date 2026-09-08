// "Installed" is not a database row — it is a fact about the repository on
// GitHub: it has `.github/workflows/quality-gate.yml`. Everything here derives
// the console's view of an installation from the repo's own contents, read with
// the signed-in user's token.

import {
  type GitHubRepo,
  getContentMeta,
  getJsonFile,
  getFileText,
  getRepo,
  listActionsSecretNames,
  listUserRepos,
  mapLimit,
} from "./github";
import {
  CONFIG_PATH,
  WORKFLOW_PATH,
  normalizeCoverageConfig,
  normalizeTriggers,
} from "./workflowTemplate";
import type {
  CoverageConfig,
  InstalledRepo,
  InstalledRepoSummary,
  RepoSecretState,
  WorkflowTriggers,
} from "./types";

export { CONFIG_PATH, WORKFLOW_PATH };

/** How many of the user's most-recently-pushed repos the dashboard scans. */
const SCAN_LIMIT = 100;
const SCAN_CONCURRENCY = 12;

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

/** Every repo the signed-in user can reach that has the gate workflow installed. */
export async function listInstalledRepos(token: string): Promise<InstalledRepoSummary[]> {
  const repos = (await listUserRepos(token, SCAN_LIMIT)).slice(0, SCAN_LIMIT);

  const hits = await mapLimit(repos, SCAN_CONCURRENCY, async (r) => {
    const meta = await getContentMeta(token, r.owner, r.name, WORKFLOW_PATH, r.defaultBranch).catch(
      () => null,
    );
    return meta ? r : null;
  });

  const installed = hits.filter((r): r is GitHubRepo => r !== null);

  const summaries = await mapLimit(installed, SCAN_CONCURRENCY, async (r) => {
    const cov = await getJsonFile<Partial<CoverageConfig>>(
      token,
      r.owner,
      r.name,
      CONFIG_PATH,
      r.defaultBranch,
    ).catch(() => null);
    const workflowText = await getFileText(
      token,
      r.owner,
      r.name,
      WORKFLOW_PATH,
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
