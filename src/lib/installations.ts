import { promises as fs } from "node:fs";
import path from "node:path";
import type { InstallationRecord, InstallationSummaryRow } from "./types";

// One JSON file per repo the console has installed the quality gate onto,
// under .data/installations/. Same filesystem-store pattern as ./store.ts:
// each record carries the GitHub login that installed it, so a user only ever
// sees their own installations.
const DATA_DIR = path.join(process.cwd(), ".data", "installations");

export const WORKFLOW_PATH = ".github/workflows/quality-gate.yml";
export const CONFIG_PATH = "quality-gate.config.json";

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** `owner__repo`, filesystem-safe. Repo names allow `.` `-` `_`, never `__`. */
function key(owner: string, repo: string): string {
  return `${owner}__${repo}`.toLowerCase();
}

function fileFor(owner: string, repo: string): string {
  return path.join(DATA_DIR, `${key(owner, repo)}.json`);
}

export async function saveInstallation(rec: InstallationRecord): Promise<void> {
  await ensureDir();
  await fs.writeFile(fileFor(rec.owner, rec.name), JSON.stringify(rec, null, 2), "utf8");
}

export async function getInstallation(
  owner: string,
  repo: string,
): Promise<InstallationRecord | null> {
  try {
    const raw = await fs.readFile(fileFor(owner, repo), "utf8");
    return JSON.parse(raw) as InstallationRecord;
  } catch {
    return null;
  }
}

export async function deleteInstallation(owner: string, repo: string): Promise<void> {
  try {
    await fs.unlink(fileFor(owner, repo));
  } catch {
    /* already gone */
  }
}

/** True when `login` installed this gate. Legacy records with no installer are public. */
export function ownsInstallation(
  rec: InstallationRecord,
  login: string | undefined | null,
): boolean {
  if (!rec.installedBy?.login) return true;
  return !!login && rec.installedBy.login.toLowerCase() === login.toLowerCase();
}

export async function listInstallations(login?: string): Promise<InstallationSummaryRow[]> {
  await ensureDir();
  const entries = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  const rows: InstallationSummaryRow[] = [];
  for (const file of entries) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      const rec = JSON.parse(raw) as InstallationRecord;
      if (login && !ownsInstallation(rec, login)) continue;
      rows.push({
        fullName: rec.fullName,
        owner: rec.owner,
        name: rec.name,
        private: rec.private,
        htmlUrl: rec.htmlUrl,
        defaultBranch: rec.defaultBranch,
        branches: rec.config.branches,
        installedAt: rec.installedAt,
        updatedAt: rec.updatedAt,
        globalCoverage: rec.config.globalCoverage,
      });
    } catch {
      /* skip corrupt file */
    }
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows;
}
