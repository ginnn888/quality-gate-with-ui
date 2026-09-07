import { promises as fs } from "node:fs";
import path from "node:path";
import { ACTION_DIR } from "./workflowTemplate";

// The Automated Quality Gate is vendored into this repo under vendor/ as a
// ready-to-run local GitHub Action (action.yml + the ncc-bundled dist/index.js,
// which has no external runtime deps). On install the console commits these
// files into the target repo under `.quality-gate/`, and the workflow runs them
// with `uses: ./.quality-gate` — no published action reference needed.

const VENDOR_DIR = path.join(process.cwd(), "vendor", "quality-gate-action");

/** Files that make up the vendored action, relative to VENDOR_DIR / ACTION_DIR. */
export const ACTION_FILES = ["action.yml", "dist/index.js"] as const;

/** Repo-relative paths of every committed action file. */
export const ACTION_FILE_PATHS = ACTION_FILES.map((f) => `${ACTION_DIR}/${f}`);

/** Read the vendored action files as `{ path, contentUtf8 }` ready to commit. */
export async function readVendoredAction(): Promise<{ path: string; contentUtf8: string }[]> {
  return Promise.all(
    ACTION_FILES.map(async (rel) => ({
      path: `${ACTION_DIR}/${rel}`,
      contentUtf8: await fs.readFile(path.join(VENDOR_DIR, rel), "utf8"),
    })),
  );
}
