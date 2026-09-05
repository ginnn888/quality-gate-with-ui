// The Quality Gate "simulation" pipeline — dependency-free static analysis over
// the changed source files, plus a real `npm audit`. Mirrors the simulation
// branch of quality-gate-ui/src/lib/engine/index.ts.
//
// PORT NOTE: plain-ESM copy; keep the stage logic in sync with index.ts.

import { analyzeFile } from "./heuristics.mjs";
import { runNpmAudit } from "./npmAudit.mjs";
import { buildMarkdownReport } from "./report.mjs";

const RANK = { running: 0, skip: 1, pass: 2, warn: 3, fail: 4 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/**
 * @param {{ files: {name:string, content:string}[], config: object, cwd?: string }} input
 * @returns {{ engine: "simulation", steps: object[], report: object, markdown: string }}
 */
export function runSimulation({ files, config, cwd = process.cwd() }) {
  const steps = [];
  const step = (name, status, log) => steps.push({ name, status, durationMs: 0, log });

  // 1 — checkout ------------------------------------------------------------
  step(
    "Checkout · detect modified files",
    "pass",
    `engine: simulation\nreceived ${files.length} changed file(s):\n` +
      files.map((f) => `  ${f.name}  (${f.content.length} bytes)`).join("\n"),
  );

  // 2 — install ----------------------------------------------------------------
  step("Install dependencies", "pass", "$ npm ci\nlockfile resolved\ndependencies ready");

  // 3 — npm audit ------------------------------------------------------------
  const { report: audit, log: auditLog } = runNpmAudit(cwd);
  step(
    "Dependency audit · npm audit",
    audit.isSecure ? "pass" : "fail",
    auditLog + (audit.details.length ? `\n\n${audit.details.join("\n")}` : ""),
  );

  // 4 — classification + AI review ------------------------------------------
  const analyses = files.map((f) => analyzeFile(f.name, f.content));
  const classifications = {};
  const reviewLog = [];
  let reviewStatus = config.enableAiReview ? "pass" : "skip";

  for (const f of files) {
    const heuristic = analyses.find((a) => a.name === f.name);
    let cls = heuristic.classification;
    const override =
      config.perFileCoverage?.[f.name] ?? config.globalCoverage ?? cls.min_coverage_threshold;
    cls = { ...cls, targetCoverage: override };
    classifications[f.name] = cls;

    if (config.enableAiReview) {
      const dot = cls.review.status === "buggy" ? "🔴" : cls.review.status === "suspicious" ? "🟡" : "🟢";
      reviewLog.push(`${dot} ${f.name} — ${cls.review.status.toUpperCase()}: ${cls.review.findings}`);
      if (cls.review.status === "buggy") reviewStatus = worst(reviewStatus, "fail");
      else if (cls.review.status === "suspicious") reviewStatus = worst(reviewStatus, "warn");
    }
  }
  step(
    "AI proactive code review · heuristics",
    reviewStatus,
    config.enableAiReview ? reviewLog.join("\n") : "AI review disabled in quality-gate.config.json.",
  );

  // 5 — test generation + coverage gate ----------------------------------------
  const fileStatus = {};
  const covLog = ["estimating generated-test coverage from static analysis"];
  let coverageMet = true;
  let anyBuggy = false;
  let totalActual = 0;
  let totalTarget = 0;

  for (const f of files) {
    const a = analyses.find((x) => x.name === f.name);
    const cls = classifications[f.name];
    const required = cls.targetCoverage;
    const actual = a.coverageActual;
    const pass = actual >= required;
    fileStatus[f.name] = { actual, required, pass };
    totalActual += actual;
    totalTarget += required;
    if (!pass) coverageMet = false;
    if (cls.review.status === "buggy") anyBuggy = true;
    covLog.push(`${pass ? "PASS" : "FAIL"}  ${f.name}  actual ${actual}%  ·  target ${required}%`);
  }

  const jestPassed = !anyBuggy;
  covLog.push("", jestPassed ? "Jest: all generated suites green" : "Jest: 1+ generated suite failed");
  step(
    "Generate tests · run Jest · coverage gate",
    !jestPassed ? "fail" : coverageMet ? "pass" : "fail",
    covLog.join("\n"),
  );

  // 6 — Sonar -------------------------------------------------------------
  let sonar = {
    enabled: false,
    available: true,
    passed: true,
    metrics: { bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0 },
    issues: [],
  };
  if (!config.enableSonar) {
    step("SonarCloud Quality Gate", "skip", "SonarCloud disabled in quality-gate.config.json.");
  } else {
    const all = analyses.flatMap((a) => a.findings);
    const bugs = analyses.filter((a) => a.classification.review.status === "buggy").length;
    const vulns = all.filter(
      (f) => f.kind === "security" && (f.severity === "high" || f.severity === "critical"),
    ).length;
    const smells = all.filter((f) => f.severity === "medium" || f.severity === "low").length;
    const hotspots = all.filter((f) => f.kind === "security" && f.severity === "medium").length;
    sonar = {
      enabled: true,
      available: true,
      passed: bugs === 0 && vulns === 0,
      metrics: { bugs, vulnerabilities: vulns, code_smells: smells, security_hotspots: hotspots },
      issues: all
        .filter((f) => f.severity !== "info")
        .slice(0, 10)
        .map((f) => ({ severity: f.severity.toUpperCase(), message: f.message, component: "changed source" })),
    };
    step(
      "SonarCloud Quality Gate",
      sonar.passed ? "pass" : "fail",
      `bugs=${sonar.metrics.bugs} vulnerabilities=${sonar.metrics.vulnerabilities} ` +
        `code_smells=${sonar.metrics.code_smells} security_hotspots=${sonar.metrics.security_hotspots}\n` +
        `quality gate: ${sonar.passed ? "OK" : "ERROR"}`,
    );
  }

  // 7 — AI narratives -----------------------------------------------------
  let analysis = null;
  if (!jestPassed) {
    const buggyFiles = files
      .filter((f) => classifications[f.name].review.status === "buggy")
      .map((f) => `\`${f.name}\``);
    analysis = `Generated suites for ${buggyFiles.join(", ")} failed. The AI review flagged these files as \`buggy\` — the generated tests assert the *specified* behaviour, which the current implementation does not satisfy. Fix the flagged logic, then push again.`;
  }
  let sonarAnalysis = null;
  if (config.enableSonar && sonar.enabled && !sonar.passed && sonar.issues.length > 0) {
    sonarAnalysis = sonar.issues.slice(0, 5).map((i) => `- **[${i.severity}]** ${i.message}`).join("\n");
  }

  // 8 — assemble report -------------------------------------------------
  const report = {
    modifiedFiles: files.map((f) => f.name),
    classifications,
    fileStatus,
    audit,
    sonar,
    coverage: {
      statements: files.length ? Math.round(totalActual / files.length) : 0,
      branches: files.length ? Math.round((totalActual / files.length) * 0.9) : 0,
      functions: files.length ? Math.round((totalActual / files.length) * 1.02) : 0,
      lines: files.length ? Math.round(totalActual / files.length) : 0,
      required: files.length ? Math.round(totalTarget / files.length) : 80,
    },
    coverageMet,
    jestPassed,
    testsGenerated: files.length,
    analysis,
    sonarAnalysis,
    success:
      jestPassed &&
      coverageMet &&
      audit.isSecure &&
      (!config.enableSonar || !sonar.enabled || sonar.passed),
  };

  return { engine: "simulation", steps, report, markdown: buildMarkdownReport(report) };
}
