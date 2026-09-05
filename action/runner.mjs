// Quality Gate — GitHub Actions entry point.
//
// Reads quality-gate.config.json from the checked-out repo, works out which
// source files changed in this push / pull_request, runs the gate (live Gemini
// when a key is present, otherwise the dependency-free simulation), writes the
// Markdown report to the job summary, and exits non-zero when the gate fails.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";

import { runSimulation } from "./lib/simulate.mjs";
import { runLive } from "./lib/live.mjs";

// Same filters the console uses in quality-gate-ui/src/lib/github.ts
const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const IGNORED_DIR =
  /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.git|vendor|__snapshots__|\.yarn)(\/|$)/i;
const TEST_FILE = /(\.(test|spec)\.[jt]sx?$)|((^|\/)(__tests__|tests?)\/)/i;

const DEFAULT_CONFIG = {
  globalCoverage: 80,
  perFileCoverage: {},
  enableSonar: true,
  enableAiReview: true,
  branches: ["main"],
  events: ["push", "pull_request"],
};

const cwd = process.cwd();

function log(...args) {
  console.log(...args);
}

function git(args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function loadConfig() {
  const rel = process.env.QG_CONFIG_PATH || "quality-gate.config.json";
  const abs = path.resolve(cwd, rel);
  if (!existsSync(abs)) {
    log(`::warning::${rel} not found — using default thresholds`);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const parsed = JSON.parse(readFileSync(abs, "utf8"));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    log(`::warning::could not parse ${rel} (${e.message}) — using default thresholds`);
    return { ...DEFAULT_CONFIG };
  }
}

function changedFiles() {
  const event = process.env.GITHUB_EVENT_NAME || "";
  let range = null;

  try {
    if (event === "pull_request" && process.env.GITHUB_BASE_REF) {
      const base = process.env.GITHUB_BASE_REF;
      try {
        git(["fetch", "--no-tags", "--depth=1", "origin", base]);
      } catch {
        /* best effort — checkout@v4 with fetch-depth:0 already has it */
      }
      range = [`origin/${base}...HEAD`];
    } else if (process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
      const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      const before = payload.before;
      const after = payload.after || "HEAD";
      const zero = /^0{40}$/;
      if (before && !zero.test(before)) range = [`${before}..${after}`];
    }
  } catch (e) {
    log(`::warning::could not resolve diff range (${e.message})`);
  }

  const args = ["diff", "--name-only", "--diff-filter=d"];
  let out = "";
  try {
    out = range ? git([...args, ...range]) : git([...args, "HEAD~1..HEAD"]);
  } catch {
    try {
      out = git([...args, "HEAD"]);
    } catch {
      out = "";
    }
  }

  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => SOURCE_EXT.test(p) && !IGNORED_DIR.test(p) && !TEST_FILE.test(p));
}

function readFiles(paths) {
  const files = [];
  for (const p of paths) {
    const abs = path.resolve(cwd, p);
    if (!existsSync(abs)) continue;
    try {
      files.push({ name: p, content: readFileSync(abs, "utf8") });
    } catch {
      /* skip unreadable */
    }
  }
  return files;
}

function writeSummary(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) {
    try {
      appendFileSync(target, markdown + "\n");
      return;
    } catch {
      /* fall through to stdout */
    }
  }
  log(markdown);
}

async function main() {
  const config = loadConfig();
  log(`Quality Gate config: ${JSON.stringify(config)}`);

  const paths = changedFiles();
  if (paths.length === 0) {
    log("No changed source files in range — quality gate passes with nothing to check.");
    writeSummary(
      "# 🚀 AI-Powered Quality Gate Report\n\n### 📊 Overall Result: ✅ PASS\n\nNo analysable source files changed in this event.",
    );
    process.exit(0);
  }
  log(`Changed source files (${paths.length}):\n${paths.map((p) => `  ${p}`).join("\n")}`);

  const files = readFiles(paths);
  if (files.length === 0) {
    log("Changed files could not be read — skipping.");
    process.exit(0);
  }

  const apiKey = process.env.QG_GEMINI_KEY || process.env.GEMINI_API_KEY || "";
  let result;
  if (apiKey) {
    try {
      log("Running live engine (Gemini)…");
      result = await runLive({ files, config, apiKey, cwd });
    } catch (e) {
      log(`::warning::live engine failed (${e.message}) — falling back to simulation`);
      result = runSimulation({ files, config, cwd });
    }
  } else {
    log("No GEMINI_API_KEY secret — running simulation engine.");
    result = runSimulation({ files, config, cwd });
  }

  log("\n===== pipeline steps =====");
  for (const s of result.steps) {
    log(`\n--- ${s.name} [${s.status.toUpperCase()}] ---\n${s.log}`);
  }

  writeSummary(result.markdown);

  if (!result.report.success) {
    log("\n::error::Quality gate FAILED — see the job summary for details.");
    process.exit(1);
  }
  log("\nQuality gate PASSED.");
}

main().catch((e) => {
  console.error(`::error::runner crashed: ${e?.stack || e}`);
  process.exit(1);
});
