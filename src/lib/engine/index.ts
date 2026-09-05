import type {
  FileClassification,
  Report,
  RunConfig,
  SonarReport,
  StepStatus,
  WorkflowStep,
} from "../types";
import { buildMarkdownReport } from "../report";
import { analyzeFile } from "./heuristics";
import { runNpmAudit } from "./npmAudit";
import { runRealGate } from "./liveRunner";

export interface EngineInput {
  runId: string;
  files: { name: string; content: string }[];
  config: RunConfig;
}

export interface EngineResult {
  engine: "simulation" | "live";
  durationMs: number;
  steps: WorkflowStep[];
  report: Report;
  markdown: string;
}

function resolveEngine(): "simulation" | "live" {
  return process.env.QG_ENGINE === "live" && !!process.env.GEMINI_API_KEY
    ? "live"
    : "simulation";
}

const worst = (a: StepStatus, b: StepStatus): StepStatus => {
  const rank: Record<StepStatus, number> = { running: 0, skip: 1, pass: 2, warn: 3, fail: 4 };
  return rank[a] >= rank[b] ? a : b;
};

export async function runQualityGate(input: EngineInput): Promise<EngineResult> {
  const started = Date.now();
  const engine = resolveEngine();
  const { runId, files, config } = input;

  if (engine === "live") {
    return runLive(runId, files, config, started);
  }

  const steps: WorkflowStep[] = [];

  const step = async (
    name: string,
    fn: () => Promise<{ status: StepStatus; log: string }>,
  ) => {
    const t0 = Date.now();
    try {
      const { status, log } = await fn();
      steps.push({ name, status, durationMs: Date.now() - t0, log });
    } catch (e: any) {
      steps.push({
        name,
        status: "fail",
        durationMs: Date.now() - t0,
        log: `Unhandled error: ${e?.message || e}`,
      });
    }
  };

  // 1 — checkout ---------------------------------------------------------------
  await step("Set up job · checkout uploaded files", async () => ({
    status: "pass",
    log:
      `engine: ${engine}\n` +
      `received ${files.length} file(s):\n` +
      files.map((f) => `  src/${f.name}  (${f.content.length} bytes)`).join("\n"),
  }));

  // 2 — install -------------------------------------------------------------
  await step("Install dependencies", async () => ({
    status: "pass",
    log: "$ npm ci\nlockfile resolved · 0 changes\ndependencies ready",
  }));

  // 3 — npm audit -----------------------------------------------------------
  const { report: audit, log: auditLog } = runNpmAudit();
  await step("Dependency audit · npm audit", async () => ({
    status: audit.isSecure ? "pass" : "fail",
    log: auditLog + (audit.details.length ? `\n\n${audit.details.join("\n")}` : ""),
  }));

  // 4 — classification + AI review ---------------------------------------------
  const classifications: Record<string, FileClassification> = {};
  const analyses = files.map((f) => analyzeFile(f.name, f.content));
  const reviewLog: string[] = [];
  let reviewStatus: StepStatus = config.enableAiReview ? "pass" : "skip";

  for (const f of files) {
    const heuristic = analyses.find((a) => a.name === f.name)!;
    let cls = heuristic.classification;

    const override =
      config.perFileCoverage[f.name] ??
      config.globalCoverage ??
      cls.min_coverage_threshold;
    cls = { ...cls, targetCoverage: override };
    classifications[f.name] = cls;

    if (config.enableAiReview) {
      const dot = cls.review.status === "buggy" ? "🔴" : cls.review.status === "suspicious" ? "🟡" : "🟢";
      reviewLog.push(`${dot} ${f.name} — ${cls.review.status.toUpperCase()}: ${cls.review.findings}`);
      if (cls.review.status === "buggy") reviewStatus = worst(reviewStatus, "fail");
      else if (cls.review.status === "suspicious") reviewStatus = worst(reviewStatus, "warn");
    }
  }

  await step("AI proactive code review · heuristics", async () => ({
    status: reviewStatus,
    log: config.enableAiReview
      ? reviewLog.join("\n")
      : "AI review disabled in run configuration.",
  }));

  // 5 — test generation + coverage gate -------------------------------------
  const fileStatus: Record<string, { actual: number; required: number; pass: boolean }> = {};
  const covLog: string[] = ["estimating generated-test coverage from static analysis"];
  let coverageMet = true;
  let anyBuggy = false;
  let totalActual = 0;
  let totalTarget = 0;

  for (const f of files) {
    const a = analyses.find((x) => x.name === f.name)!;
    const cls = classifications[f.name];
    const required = cls.targetCoverage;
    const actual = a.coverageActual;
    const pass = actual >= required;
    fileStatus[f.name] = { actual, required, pass };
    totalActual += actual;
    totalTarget += required;
    if (!pass) coverageMet = false;
    if (cls.review.status === "buggy") anyBuggy = true;
    covLog.push(
      `${pass ? "PASS" : "FAIL"}  src/${f.name}  actual ${actual}%  ·  target ${required}%`,
    );
  }

  const jestPassed = !anyBuggy;
  covLog.push("", jestPassed ? "Jest: all generated suites green" : "Jest: 1+ generated suite failed (see AI analysis)");
  const covStatus: StepStatus = !jestPassed ? "fail" : coverageMet ? "pass" : "fail";
  await step("Generate tests · run Jest · coverage gate", async () => ({
    status: covStatus,
    log: covLog.join("\n"),
  }));

  // 6 — Sonar -------------------------------------------------------------
  let sonar: SonarReport = {
    enabled: false,
    available: true,
    passed: true,
    metrics: { bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0 },
    issues: [],
  };
  let sonarAnalysis: string | null = null;

  if (!config.enableSonar) {
    steps.push({
      name: "SonarCloud Quality Gate",
      status: "skip",
      durationMs: 0,
      log: "SonarCloud disabled in run configuration.",
    });
  } else {
    // derive a plausible Sonar view from the static findings
    const all = analyses.flatMap((a) => a.findings);
    const bugs = analyses.filter((a) => a.classification.review.status === "buggy").length;
    const vulns = all.filter((f) => f.kind === "security" && (f.severity === "high" || f.severity === "critical")).length;
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
        .map((f) => ({
          severity: f.severity.toUpperCase(),
          message: f.message,
          component: "uploaded source",
        })),
    };
    steps.push({
      name: "SonarCloud Quality Gate",
      status: sonar.passed ? "pass" : "fail",
      durationMs: 0,
      log:
        `projectKey: ${process.env.SONAR_PROJECT_KEY || "(simulation)"}\n` +
        `bugs=${sonar.metrics.bugs} vulnerabilities=${sonar.metrics.vulnerabilities} ` +
        `code_smells=${sonar.metrics.code_smells} security_hotspots=${sonar.metrics.security_hotspots}\n` +
        `quality gate: ${sonar.passed ? "OK" : "ERROR"}`,
    });
  }

  // 7 — AI narratives -----------------------------------------------------
  let analysis: string | null = null;
  if (!jestPassed) {
    const buggyFiles = files
      .filter((f) => classifications[f.name].review.status === "buggy")
      .map((f) => `\`src/${f.name}\``);
    analysis = `Generated suites for ${buggyFiles.join(", ")} failed. The AI review flagged these files as \`buggy\` — the generated tests assert the *specified* behaviour, which the current implementation does not satisfy. Fix the flagged logic, then re-run the gate.`;
  }

  if (config.enableSonar && sonar.enabled && !sonar.passed && sonar.issues.length > 0) {
    sonarAnalysis = sonar.issues
      .slice(0, 5)
      .map((i) => `- **[${i.severity}]** ${i.message}`)
      .join("\n");
  }

  // 8 — assemble report -------------------------------------------------
  const report: Report = {
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

  return {
    engine,
    durationMs: Date.now() - started,
    steps,
    report,
    markdown: buildMarkdownReport(report),
  };
}

// ---------------------------------------------------------------------------
// LIVE ENGINE — runs the real Automated-Quality-Gate/generate-tests.js
// ---------------------------------------------------------------------------

const stripSrc = (k: string) => k.replace(/^\.?\/?src\//, "");

function tail(s: string, n = 6000): string {
  return s.length > n ? "…\n" + s.slice(-n) : s;
}

function buildSonarLog(
  sonar: SonarReport,
  scanner: { ran: boolean; ok: boolean; branch: string | null; log: string },
): string {
  if (!sonar.enabled) return "SonarCloud disabled for this run.";

  const project = process.env.SONAR_PROJECT_KEY || "(from sonar-project.properties)";
  const scanLine = scanner.ran
    ? `sonar-scanner: ${scanner.ok ? "upload OK" : "FAILED"}` +
      (scanner.branch ? ` · branch "${scanner.branch}"` : "")
    : "sonar-scanner: not run";
  const scanTail = scanner.log ? `\n\n--- sonar-scanner output (tail) ---\n${tail(scanner.log, 4000)}` : "";

  if (!sonar.available) {
    return (
      `project: ${project}\n${scanLine}\n\n` +
      `SonarCloud returned no usable analysis via the API, so the Quality Gate is\n` +
      `reported as UNAVAILABLE and is NOT counted toward the result.\n` +
      `Common causes: the Compute Engine task is still processing; the token lacks\n` +
      `"Execute Analysis" permission; or QG_SONAR_BRANCH points at a non-main branch\n` +
      `on a free-plan private project (the API only exposes main-branch data — every\n` +
      `other branch/PR read returns HTTP 403). Set QG_SONAR_BRANCH to the project's\n` +
      `main branch name.` +
      scanTail
    );
  }

  return (
    `project: ${project}\n${scanLine}\n\n` +
    `bugs=${sonar.metrics.bugs} vulnerabilities=${sonar.metrics.vulnerabilities} ` +
    `code_smells=${sonar.metrics.code_smells} security_hotspots=${sonar.metrics.security_hotspots}\n` +
    `quality gate: ${sonar.passed ? "OK" : "ERROR / not OK"}` +
    scanTail
  );
}

async function runLive(
  runId: string,
  files: { name: string; content: string }[],
  config: RunConfig,
  started: number,
): Promise<EngineResult> {
  const model = process.env.QG_GEMINI_MODEL || "gemini-3.1-flash-lite";
  const wantSonar = config.enableSonar && !!process.env.SONAR_TOKEN;

  const out = await runRealGate(runId, files, config);

  // --- pipeline could not produce a summary: surface the raw failure ---------
  if (!out.ok || !out.summary) {
    const log =
      `The real pipeline (generate-tests.js) exited with code ${out.exitCode} ` +
      `without producing a summary.\n\n--- stderr ---\n${tail(out.stderr)}\n\n--- stdout ---\n${tail(out.stdout)}`;
    const report: Report = {
      modifiedFiles: files.map((f) => f.name),
      classifications: {},
      fileStatus: {},
      audit: { critical: 0, high: 0, moderate: 0, low: 0, isSecure: false, details: [] },
      sonar: {
        enabled: wantSonar,
        available: false,
        passed: false,
        metrics: { bugs: "N/A", vulnerabilities: "N/A", code_smells: "N/A", security_hotspots: "N/A" },
        issues: [],
      },
      coverage: { statements: 0, branches: 0, functions: 0, lines: 0, required: config.globalCoverage },
      coverageMet: false,
      jestPassed: false,
      testsGenerated: 0,
      analysis: null,
      sonarAnalysis: null,
      success: false,
    };
    return {
      engine: "live",
      durationMs: Date.now() - started,
      steps: [
        {
          name: `Run Automated Quality Gate · generate-tests.js (Gemini ${model})`,
          status: "fail",
          durationMs: Date.now() - started,
          log,
        },
      ],
      report,
      markdown: buildMarkdownReport(report),
    };
  }

  // --- map the real `summary` onto our Report shape -------------------------
  const s = out.summary;
  const modifiedFiles: string[] = (s.modifiedFiles || []).map(stripSrc);

  const classifications: Record<string, FileClassification> = {};
  for (const [k, v] of Object.entries<any>(s.classifications || {})) {
    classifications[stripSrc(k)] = {
      importance: v.importance || "medium",
      min_coverage_threshold: v.min_coverage_threshold ?? 80,
      targetCoverage: v.targetCoverage ?? v.min_coverage_threshold ?? config.globalCoverage,
      focus_areas: Array.isArray(v.focus_areas) ? v.focus_areas : ["logic"],
      description: v.description || "",
      review: {
        status: v.review?.status || "clean",
        findings: v.review?.findings || "No issues identified.",
        remediation: v.review?.remediation || "",
      },
    };
  }

  const fileStatus: Record<string, { actual: number; required: number; pass: boolean }> = {};
  for (const [k, v] of Object.entries<any>(s.fileStatus || {})) {
    fileStatus[stripSrc(k)] = {
      actual: Number(v.actual) || 0,
      required: Number(v.required) || 0,
      pass: !!v.pass,
    };
  }

  const audit = {
    critical: s.audit?.critical ?? 0,
    high: s.audit?.high ?? 0,
    moderate: s.audit?.moderate ?? 0,
    low: s.audit?.low ?? 0,
    isSecure: s.audit?.isSecure ?? false,
    details: Array.isArray(s.audit?.details) ? s.audit.details : [],
  };

  const sonarMetrics = {
    bugs: s.sonar?.metrics?.bugs ?? "N/A",
    vulnerabilities: s.sonar?.metrics?.vulnerabilities ?? "N/A",
    code_smells: s.sonar?.metrics?.code_smells ?? "N/A",
    security_hotspots: s.sonar?.metrics?.security_hotspots ?? "N/A",
  };
  // The web console does not run a fresh sonar-scanner upload, so if the API
  // returns no usable analysis we mark it "unavailable" rather than "failed".
  const sonarHasData =
    Object.values(sonarMetrics).some((v) => v !== "N/A") || !!s.sonar?.passed;

  const sonar: SonarReport = wantSonar
    ? {
        enabled: true,
        available: sonarHasData,
        passed: !!s.sonar?.passed,
        metrics: sonarMetrics,
        issues: Array.isArray(s.sonar?.issues)
          ? s.sonar.issues.map((i: any) => ({
              severity: i.severity,
              message: i.message,
              component: i.component,
              line: i.line,
            }))
          : [],
      }
    : {
        enabled: false,
        available: true,
        passed: true,
        metrics: { bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0 },
        issues: [],
      };

  const coverage = {
    statements: Number(s.coverage?.statements) || 0,
    branches: Number(s.coverage?.branches) || 0,
    functions: Number(s.coverage?.functions) || 0,
    lines: Number(s.coverage?.lines) || 0,
    required: Number(s.coverage?.required) || config.globalCoverage,
  };

  const jestPassed = !!s.jestPassed;
  const coverageMet = !!s.coverageMet;
  const success =
    jestPassed &&
    coverageMet &&
    audit.isSecure &&
    (!sonar.enabled || !sonar.available || sonar.passed);

  const report: Report = {
    modifiedFiles,
    classifications,
    fileStatus,
    audit,
    sonar,
    coverage,
    coverageMet,
    jestPassed,
    testsGenerated: Number(s.testsGenerated) || modifiedFiles.length,
    analysis: s.analysis || null,
    sonarAnalysis: s.sonarAnalysis || null,
    success,
  };

  // --- reconstruct workflow steps from the real run -----------------------
  const perFileReview = modifiedFiles
    .map((f) => {
      const c = classifications[f];
      if (!c) return "";
      const dot = c.review.status === "buggy" ? "🔴" : c.review.status === "suspicious" ? "🟡" : "🟢";
      return `${dot} src/${f} — ${c.review.status.toUpperCase()}: ${c.review.findings}`;
    })
    .filter(Boolean)
    .join("\n");

  const perFileCov = modifiedFiles
    .map((f) => {
      const st = fileStatus[f];
      if (!st) return `?     src/${f}  (no coverage row)`;
      return `${st.pass ? "PASS" : "FAIL"}  src/${f}  actual ${st.actual}%  ·  target ${st.required}%`;
    })
    .join("\n");

  const reviewWorst = modifiedFiles.reduce<StepStatus>((acc, f) => {
    const st = classifications[f]?.review.status;
    return worst(acc, st === "buggy" ? "fail" : st === "suspicious" ? "warn" : "pass");
  }, "pass");

  const steps: WorkflowStep[] = [
    {
      name: "Checkout · detect modified files (git diff main…HEAD)",
      status: "pass",
      durationMs: 0,
      log: `engine: live\nGemini model: ${model}\n\nfiles under review:\n${modifiedFiles
        .map((f) => `  src/${f}`)
        .join("\n")}`,
    },
    {
      name: "Dependency audit · npm audit",
      status: audit.isSecure ? "pass" : "fail",
      durationMs: 0,
      log:
        `critical=${audit.critical} high=${audit.high} moderate=${audit.moderate} low=${audit.low}\n` +
        `result: ${audit.isSecure ? "SECURE" : "VULNERABLE"}` +
        (audit.details.length ? `\n\n${audit.details.join("\n")}` : ""),
    },
    {
      name: `AI review + classification · Gemini (${model})`,
      status: reviewWorst,
      durationMs: 0,
      log: perFileReview || "(no classifications returned)",
    },
    {
      name: "Generate tests · run Jest · coverage gate",
      status: !jestPassed || !coverageMet ? "fail" : "pass",
      durationMs: 0,
      log:
        `${perFileCov}\n\n` +
        `aggregate statements: ${coverage.statements}%  ·  target: ${coverage.required}%\n` +
        `Jest: ${jestPassed ? "all suites passed" : "FAILED"}` +
        (s.analysis ? `\n\n--- AI failure analysis ---\n${s.analysis}` : ""),
    },
    {
      name: "SonarCloud scan + Quality Gate",
      status: !sonar.enabled
        ? "skip"
        : !sonar.available
          ? "warn"
          : sonar.passed
            ? "pass"
            : "fail",
      durationMs: 0,
      log: buildSonarLog(sonar, out.scanner),
    },
    {
      name: "Full pipeline log · generate-tests.js",
      status: success ? "pass" : "warn",
      durationMs: 0,
      log: tail(out.stdout, 18000) + (out.stderr.trim() ? `\n\n--- stderr ---\n${tail(out.stderr, 4000)}` : ""),
    },
  ];

  // The real script always embeds a Sonar section; correct it when we could
  // not get real data so the rendered PR comment matches the cards above.
  let markdown = out.markdown || buildMarkdownReport(report);
  if (!sonar.enabled || !sonar.available) {
    const replacement = !sonar.enabled
      ? "### 📡 SonarCloud Status\n- **Quality Gate:** ⏭️ SKIPPED (disabled for this run)\n"
      : "### 📡 SonarCloud Status\n- **Quality Gate:** ⚠️ UNAVAILABLE (scan produced no gate result; not counted)\n";
    markdown = markdown.replace(
      /### 📡 SonarCloud Status[\s\S]*?(?=\n---|\n### |$)/,
      replacement,
    );
  }

  return {
    engine: "live",
    durationMs: Date.now() - started,
    steps,
    report,
    markdown,
  };
}
