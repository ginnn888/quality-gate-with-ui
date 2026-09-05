import { promises as fs } from "node:fs";
import path from "node:path";
import type { RunRecord, RunSummaryRow } from "./types";

// Runs are persisted as JSON on disk so a result can be revisited or shared
// via its /runs/<id> URL — the "send it to a colleague" path that GitHub PRs
// made awkward. Each record carries the GitHub login that produced it, so the
// history list and the permalink only ever show a user their own runs.
const DATA_DIR = path.join(process.cwd(), ".data", "runs");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export function newRunId(): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run_${ts}_${rand}`;
}

export async function saveRun(run: RunRecord): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    path.join(DATA_DIR, `${run.id}.json`),
    JSON.stringify(run, null, 2),
    "utf8",
  );
}

export async function getRun(id: string): Promise<RunRecord | null> {
  if (!/^run_[a-z0-9_]+$/i.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}

/** True when `login` is allowed to read this run. Legacy runs have no owner. */
export function ownsRun(run: RunRecord, login: string | undefined | null): boolean {
  if (!run.owner?.login) return true;
  return !!login && run.owner.login.toLowerCase() === login.toLowerCase();
}

export async function listRuns(login?: string, limit = 50): Promise<RunSummaryRow[]> {
  await ensureDir();
  const entries = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  const rows: RunSummaryRow[] = [];
  for (const file of entries) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      const run = JSON.parse(raw) as RunRecord;
      if (login && !ownsRun(run, login)) continue;
      rows.push({
        id: run.id,
        createdAt: run.createdAt,
        engine: run.engine,
        success: run.report.success,
        fileCount: run.files.length,
        durationMs: run.durationMs,
        repoFullName: run.source?.repo?.fullName,
        sourceKind: run.source?.kind,
      });
    } catch {
      /* skip corrupt file */
    }
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, limit);
}
