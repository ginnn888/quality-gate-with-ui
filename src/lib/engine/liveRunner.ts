import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import type { RunConfig } from "../types";

// Executes the REAL Automated Quality Gate against the uploaded files, in a
// throwaway git workspace created inside the action dir so Node resolves the
// action's own node_modules (jest, @google/generative-ai, …).
//
// Full pipeline, three phases:
//   1. `generate-tests.js --prepare`  → AI review + test-gen + Jest + npm audit,
//                                        writes .gate-state.json + coverage/lcov.info
//   2. sonar-scanner (sonarqube-scanner npm)  → real upload to SonarCloud.
//                                        By default this targets the project's
//                                        MAIN branch: a free-plan / private
//                                        SonarCloud org only exposes main-branch
//                                        analysis through the API (every other
//                                        branch + PR read returns HTTP 403), so
//                                        an isolated side branch can be uploaded
//                                        but never read back. Set QG_SONAR_BRANCH
//                                        to a side branch only on a public/paid
//                                        project.
//   3. `generate-tests.js --report`   → polls the real SonarCloud gate, renders
//                                        the Markdown, writes qg-summary.json
//
// The script itself is only patched to (a) make the Gemini model + Sonar poll
// count env-configurable, (b) let the Sonar fetch target a branch, (c) derive a
// pass/fail from the metrics when the gate poll never resolves, and (d) dump its
// `summary` + Markdown to disk.

export interface LiveRunOutput {
  ok: boolean;
  summary: any | null;
  markdown: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  workspace: string;
  scanner: { ran: boolean; ok: boolean; branch: string | null; log: string };
}

function actionDir(): string {
  return (
    process.env.QG_ACTION_DIR ||
    path.resolve(process.cwd(), "..", "Automated-Quality-Gate (1)", "Automated-Quality-Gate")
  );
}

function scannerJs(): string {
  return path.join(process.cwd(), "node_modules", "sonarqube-scanner", "bin", "sonar-scanner.js");
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
}

function patchScript(src: string): string {
  let out = src;

  // 1) Gemini model override
  out = out.replace(
    /const MODEL_NAME = ['"][^'"]+['"];/,
    "const MODEL_NAME = process.env.QG_GEMINI_MODEL || 'gemini-3.1-flash-lite';",
  );

  // 2) Sonar poll count env-configurable (a real CE task can take ~1 min)
  out = out.replace(
    /const maxAttempts = \d+;\s*\/\/ Max[^\n]*\n/,
    "const maxAttempts = Number(process.env.QG_SONAR_MAX_ATTEMPTS) || 24; // web console\n",
  );

  // 3) let the Sonar fetch target a specific branch (only used on public/paid
  //    projects; on the free plan SONAR_BRANCH is left unset → main branch)
  out = out.replace(
    "const prParam = prNumber ? `&pullRequest=${prNumber}` : '';",
    "const prParam = prNumber ? `&pullRequest=${prNumber}` : '';\n" +
      "    const branchParam = (!prNumber && process.env.SONAR_BRANCH) ? `&branch=${encodeURIComponent(process.env.SONAR_BRANCH)}` : '';",
  );
  out = out.split("${prParam}`").join("${prParam}${branchParam}`");
  out = out.split("${prParam}&").join("${prParam}${branchParam}&");

  // 4) fallback: the QG poll returns status "NONE" until SonarCloud has computed
  //    a gate for the branch (always the case on a branch's very first analysis).
  //    If the poll never resolves but real metric numbers came back, derive
  //    pass/fail from them so the gate is reported instead of "UNAVAILABLE".
  out = out.replace(
    "    // Issues Fetch (If not passed)\n    if (!sonarReport.passed) {",
    [
      "    if (isPending && sonarReport.metrics.bugs !== 'N/A') {",
      "      sonarReport.passed = Number(sonarReport.metrics.bugs) === 0 && Number(sonarReport.metrics.vulnerabilities) === 0;",
      "      console.log(`SonarCloud QG unresolved; derived from metrics: bugs=${sonarReport.metrics.bugs} vulnerabilities=${sonarReport.metrics.vulnerabilities} -> ${sonarReport.passed ? 'OK' : 'ERROR'}`);",
      "    }",
      "",
      "    // Issues Fetch (If not passed)",
      "    if (!sonarReport.passed) {",
    ].join("\n"),
  );

  // 5) persist the summary + rendered report
  out = out.replace(
    /const markdownReport = generateMarkdownReport\(summary\);\s*\n\s*await postPRComment\(markdownReport\);/,
    `const markdownReport = generateMarkdownReport(summary);
    try {
      fs.writeFileSync('qg-summary.json', JSON.stringify(summary, null, 2));
      fs.writeFileSync('qg-report.md', markdownReport);
    } catch (e) { console.error('Could not persist qg-summary:', e.message); }
    await postPRComment(markdownReport);`,
  );

  return out;
}

function runNode(ws: string, env: NodeJS.ProcessEnv, args: string[], timeout = 300_000) {
  return spawnSync("node", args, {
    cwd: ws,
    env,
    encoding: "utf8",
    shell: false,
    timeout,
    maxBuffer: 48 * 1024 * 1024,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// After a scan, wait for SonarCloud's Compute Engine to finish processing the
// submitted report — otherwise the Quality Gate poll in `--report` races it and
// comes back empty.
async function waitForCeTask(
  ws: string,
  token: string,
  maxMs = 210_000,
): Promise<{ status: string; note: string }> {
  const taskFile = path.join(ws, ".scannerwork", "report-task.txt");
  if (!existsSync(taskFile)) return { status: "UNKNOWN", note: "no report-task.txt" };
  const props = Object.fromEntries(
    readFileSync(taskFile, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const url = props["ceTaskUrl"];
  if (!url) return { status: "UNKNOWN", note: "no ceTaskUrl" };

  const auth = `Basic ${Buffer.from(token + ":").toString("base64")}`;
  const deadline = Date.now() + maxMs;
  let last = "PENDING";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.ok) {
        const data = await res.json();
        last = data?.task?.status || last;
        if (["SUCCESS", "FAILED", "CANCELED"].includes(last)) {
          return { status: last, note: `CE task ${props["ceTaskId"] || ""} → ${last}` };
        }
      }
    } catch {
      /* keep polling */
    }
    await sleep(5000);
  }
  return { status: last, note: `CE task did not finish within ${Math.round(maxMs / 1000)}s (last: ${last})` };
}

export async function runRealGate(
  runId: string,
  files: { name: string; content: string }[],
  config: RunConfig,
): Promise<LiveRunOutput> {
  const AQG = actionDir();
  if (!existsSync(path.join(AQG, "generate-tests.js"))) {
    throw new Error(`Automated Quality Gate not found at ${AQG} (set QG_ACTION_DIR)`);
  }

  const ws = path.join(AQG, ".qg-runs", runId);
  const scannerResult = { ran: false, ok: false, branch: null as string | null, log: "" };
  mkdirSync(path.join(ws, "src"), { recursive: true });

  for (const f of ["package.json", "package-lock.json", "prompt-template.js", "audit-resolve.json"]) {
    if (existsSync(path.join(AQG, f))) copyFileSync(path.join(AQG, f), path.join(ws, f));
  }

  const token = process.env.SONAR_TOKEN || "";
  const wantSonar = config.enableSonar && !!token;
  const projectKey = process.env.SONAR_PROJECT_KEY || "";
  const org = process.env.SONAR_ORGANIZATION || "";
  // Empty / unset → scan the project's MAIN branch (the only branch a free-plan
  // private SonarCloud org lets the API read back). A non-empty value targets a
  // side branch and only works on a public or paid project.
  const branch = (process.env.QG_SONAR_BRANCH || "").trim();

  if (wantSonar) {
    // Regenerate sonar-project.properties from env so the scan and the later
    // fetch agree on projectKey / organization. Fall back to the action's file.
    if (projectKey && org) {
      writeFileSync(
        path.join(ws, "sonar-project.properties"),
        [
          `sonar.projectKey=${projectKey}`,
          `sonar.organization=${org}`,
          "sonar.host.url=https://sonarcloud.io",
          "sonar.sources=src",
          "sonar.javascript.lcov.reportPaths=coverage/lcov.info",
          "",
        ].join("\n"),
      );
    } else if (existsSync(path.join(AQG, "sonar-project.properties"))) {
      copyFileSync(
        path.join(AQG, "sonar-project.properties"),
        path.join(ws, "sonar-project.properties"),
      );
    }
  }

  writeFileSync(
    path.join(ws, "config_cov.json"),
    JSON.stringify({ global: config.globalCoverage, files: config.perFileCoverage || {} }, null, 2),
  );
  writeFileSync(
    path.join(ws, "generate-tests.js"),
    patchScript(readFileSync(path.join(AQG, "generate-tests.js"), "utf8")),
  );

  // git base (empty src/) → branch `work` that adds the uploaded files, so the
  // script's `git diff main...HEAD -- src/` reports them as modified
  git(ws, ["init", "-b", "main"]);
  git(ws, ["config", "user.email", "gate@local"]);
  git(ws, ["config", "user.name", "Quality Gate Console"]);
  git(ws, ["config", "commit.gpgsign", "false"]);
  writeFileSync(path.join(ws, "src", ".gitkeep"), "");
  git(ws, ["add", "-A"]);
  git(ws, ["commit", "-m", "base", "--no-verify"]);
  git(ws, ["checkout", "-b", "work"]);
  for (const f of files) {
    writeFileSync(path.join(ws, "src", path.basename(f.name)), f.content);
  }
  git(ws, ["add", "-A"]);
  git(ws, ["commit", "-m", "changes under review", "--no-verify"]);

  // base env: strip GitHub Actions context, point diff at `main`
  const baseEnv: NodeJS.ProcessEnv = { ...process.env, GITHUB_BASE_REF: "main" };
  for (const k of [
    "GITHUB_EVENT_NAME",
    "GITHUB_EVENT_PATH",
    "GITHUB_ACTIONS",
    "GITHUB_TOKEN",
    "GITHUB_RUN_ID",
    "GITHUB_REPOSITORY",
  ]) {
    delete baseEnv[k];
  }
  delete baseEnv.SONAR_TOKEN;
  delete baseEnv.SONAR_BRANCH;

  // ---- phase 1: prepare (AI review, test-gen, jest, audit) ----------------
  const prep = runNode(ws, baseEnv, ["generate-tests.js", "--prepare"]);
  const stateFile = path.join(ws, ".gate-state.json");
  if (!existsSync(stateFile)) {
    return {
      ok: false,
      summary: null,
      markdown: null,
      stdout: prep.stdout || "",
      stderr: prep.stderr || (prep.error ? String(prep.error) : ""),
      exitCode: prep.status,
      workspace: ws,
      scanner: scannerResult,
    };
  }

  // ---- phase 2: real SonarCloud scan -------------------------------------
  if (wantSonar && existsSync(scannerJs())) {
    scannerResult.ran = true;
    scannerResult.branch = branch || null;
    const dArgs = [
      `-Dsonar.token=${token}`,
      "-Dsonar.host.url=https://sonarcloud.io",
      "-Dsonar.scm.disabled=true",
      "-Dsonar.sources=src",
      "-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info",
    ];
    if (projectKey) dArgs.push(`-Dsonar.projectKey=${projectKey}`);
    if (org) dArgs.push(`-Dsonar.organization=${org}`);
    if (branch) dArgs.push(`-Dsonar.branch.name=${branch}`);

    const scan = runNode(
      ws,
      { ...baseEnv, SONAR_TOKEN: token, SONAR_HOST_URL: "https://sonarcloud.io" },
      [scannerJs(), ...dArgs],
      420_000,
    );
    scannerResult.ok = scan.status === 0;
    scannerResult.log =
      (scan.stdout || "").slice(-8000) +
      (scan.stderr ? `\n--- scanner stderr ---\n${(scan.stderr || "").slice(-4000)}` : "") +
      (scan.error ? `\n${String(scan.error)}` : "");

    if (scannerResult.ok) {
      const ce = await waitForCeTask(ws, token);
      scannerResult.log += `\n\n[compute engine] ${ce.note}`;
      if (ce.status === "FAILED" || ce.status === "CANCELED") scannerResult.ok = false;
    }
  } else if (wantSonar) {
    scannerResult.log = "sonarqube-scanner not installed (npm i sonarqube-scanner) — scan skipped.";
  }

  // ---- phase 3: report (polls the real SonarCloud gate) ------------------
  const reportEnv: NodeJS.ProcessEnv = { ...baseEnv };
  if (wantSonar) {
    reportEnv.SONAR_TOKEN = token;
    if (branch) reportEnv.SONAR_BRANCH = branch;
  }
  const rep = runNode(ws, reportEnv, ["generate-tests.js", "--report"]);

  let summary: any = null;
  let markdown: string | null = null;
  try {
    const p = path.join(ws, "qg-summary.json");
    if (existsSync(p)) summary = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    /* leave null */
  }
  try {
    const p = path.join(ws, "qg-report.md");
    if (existsSync(p)) markdown = readFileSync(p, "utf8");
  } catch {
    /* leave null */
  }

  const stdout =
    `===== phase 1: prepare =====\n${prep.stdout || ""}\n` +
    (scannerResult.ran
      ? `\n===== phase 2: sonar-scanner (branch: ${scannerResult.branch || "main"}) =====\n${scannerResult.log}\n`
      : wantSonar
        ? `\n===== phase 2: sonar-scanner =====\n${scannerResult.log}\n`
        : "") +
    `\n===== phase 3: report =====\n${rep.stdout || ""}`;
  const stderr = [prep.stderr, rep.stderr].filter(Boolean).join("\n");

  if (summary) {
    try {
      rmSync(ws, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  return {
    ok: !!summary,
    summary,
    markdown,
    stdout,
    stderr,
    exitCode: rep.status,
    workspace: ws,
    scanner: scannerResult,
  };
}
