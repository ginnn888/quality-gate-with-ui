// Shared write path for install (POST) and reconfigure (PATCH). Both endpoints
// commit the same managed files in one commit and then set the same two repo
// secrets, so the mechanics live here and each route only supplies its own
// inputs and warning wording.

import { setRepoSecret } from "./githubSecrets";
import {
  CONFIG_PATH,
  SONAR_PROPS_PATH,
  WORKFLOW_PATH,
  buildCoverageConfigJson,
  buildSonarPropertiesFile,
  buildWorkflowYaml,
} from "./workflowTemplate";
import type { CoverageConfig, WorkflowTriggers } from "./types";

export interface ManagedFilesInput {
  triggers: WorkflowTriggers;
  coverage: CoverageConfig;
  /** Target repo name — the `sonar-project.properties` project key is `<org>_<repo>`. */
  repo: string;
  /** SonarCloud org; `sonar-project.properties` is only (re)written when this is set. */
  sonarOrg: string;
  /** Caller's decision on whether this write should touch `sonar-project.properties`. */
  writeSonarProps: boolean;
}

/** The files the console commits into a target repo, in one commit. */
export function buildManagedFiles(
  input: ManagedFilesInput,
): { path: string; contentUtf8: string }[] {
  const files = [
    { path: WORKFLOW_PATH, contentUtf8: buildWorkflowYaml(input.triggers) },
    { path: CONFIG_PATH, contentUtf8: buildCoverageConfigJson(input.coverage) },
  ];
  if (input.writeSonarProps && input.sonarOrg) {
    files.push({
      path: SONAR_PROPS_PATH,
      contentUtf8: buildSonarPropertiesFile(input.sonarOrg, input.repo),
    });
  }
  return files;
}

/**
 * Set each non-empty secret on the repo. A failure is collected as a warning
 * (worded by `onError`) rather than aborting — the files are already committed
 * by the time this runs.
 */
export async function applyRepoSecrets(
  token: string,
  owner: string,
  repo: string,
  entries: { name: string; value: string }[],
  onError: (name: string, message: string) => string,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const { name, value } of entries) {
    if (!value) continue;
    try {
      await setRepoSecret(token, owner, repo, name, value);
    } catch (e) {
      warnings.push(onError(name, (e as Error).message));
    }
  }
  return warnings;
}
