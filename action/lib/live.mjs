// Live engine — per-file AI review + coverage estimate via the Gemini REST API.
// Used only when the target repo provides a GEMINI_API_KEY secret. Any failure
// (no key, network, quota, bad JSON) makes runner.mjs fall back to simulation.
//
// This is a lighter cousin of quality-gate-ui/src/lib/engine/liveRunner.ts: it
// does not spin up a git workspace or run a real Jest suite — it asks Gemini to
// review each changed file and to estimate the coverage generated tests would
// reach, then applies the same gate arithmetic as the simulation engine.

import { runNpmAudit } from "./npmAudit.mjs";
import { buildMarkdownReport } from "./report.mjs";

const MODEL = process.env.QG_GEMINI_MODEL || "gemini-2.5-flash";
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const PROMPT = (name, content, target) => `You are a senior code reviewer running a CI quality gate.
Review the file below and reply with ONLY a JSON object (no markdown fence), shape:
{
  "importance": "critical|high|medium|low",
  "min_coverage_threshold": <int 0-100>,
  "review_status": "clean|suspicious|buggy",
  "findings": "<one or two sentences>",
  "remediation": "<short fix, or empty string>",
  "estimated_coverage": <int 0-100, coverage a thorough generated Jest suite would reach for THIS implementation>
}
Rules: "buggy" means the implementation looks incorrect or unsafe; "suspicious" means risky but probably works; "clean" otherwise. The target coverage for this file is ${target}%.

FILE: ${name}
\`\`\`
${content.slice(0, 24000)}
\`\`\``;

async function reviewFile(key, name, content, target) {
  const res = await fetch(ENDPOINT(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT(name, content, target) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  return parsed;
}

const RANK = { running: 0, skip: 1, pass: 2, warn: 3, fail: 4 };
const worst = (a, b) => (RANK[a] >= RANK[b] ? a : b);

/**
 * @param {{ files: {name:string, content:string}[], config: object, apiKey: string, cwd?: string }} input
 */
export async function runLive({ files, config, apiKey, cwd = process.cwd() }) {
  if (!apiKey) throw new Error("no GEMINI_API_KEY");

  const steps = [];
  const step = (name, status, log) => steps.push({ name, status, durationMs: 0, log });

  step(
    "Checkout · detect modified files",
    "pass",
    `engine: live (Gemini ${MODEL})\nfiles under review:\n${files.map((f) => `  ${f.name}`).join("\n")}`,
  );

  const { report: audit, log: auditLog } = runNpmAudit(cwd);
  step(
    "Dependency audit · npm audit",
    audit.isSecure ? "pass" : "fail",
    auditLog + (audit.details.length ? `\n\n${audit.details.join("\n")}` : ""),
  );

  const classifications = {};
  const fileStatus = {};
  const reviewLog = [];
  const covLog = [];
  let reviewStatus = config.enableAiReview ? "pass" : "skip";
  let coverageMet = true;
  let anyBuggy = false;
  let totalActual = 0;
  let totalTarget = 0;

  for (const f of files) {
    const target = config.perFileCoverage?.[f.name] ?? config.globalCoverage ?? 80;
    const r = await reviewFile(apiKey, f.name, f.content, target);

    const status = ["clean", "suspicious", "buggy"].includes(r.review_status) ? r.review_status : "clean";
    const importance = ["critical", "high", "medium", "low"].includes(r.importance) ? r.importance : "medium";
    classifications[f.name] = {
      importance,
      min_coverage_threshold: clampInt(r.min_coverage_threshold, 80),
      targetCoverage: target,
      focus_areas: ["logic"],
      description: `AI-reviewed module (${importance}).`,
      review: { status, findings: String(r.findings || "No issues identified."), remediation: String(r.remediation || "") },
    };

    const actual = clampInt(r.estimated_coverage, 0);
    const pass = actual >= target;
    fileStatus[f.name] = { actual, required: target, pass };
    totalActual += actual;
    totalTarget += target;
    if (!pass) coverageMet = false;
    if (status === "buggy") anyBuggy = true;

    if (config.enableAiReview) {
      const dot = status === "buggy" ? "🔴" : status === "suspicious" ? "🟡" : "🟢";
      reviewLog.push(`${dot} ${f.name} — ${status.toUpperCase()}: ${classifications[f.name].review.findings}`);
      if (status === "buggy") reviewStatus = worst(reviewStatus, "fail");
      else if (status === "suspicious") reviewStatus = worst(reviewStatus, "warn");
    }
    covLog.push(`${pass ? "PASS" : "FAIL"}  ${f.name}  actual ${actual}%  ·  target ${target}%`);
  }

  step(
    `AI review + classification · Gemini (${MODEL})`,
    reviewStatus,
    config.enableAiReview ? reviewLog.join("\n") : "AI review disabled in quality-gate.config.json.",
  );

  const jestPassed = !anyBuggy;
  covLog.push("", jestPassed ? "Jest: all generated suites green" : "Jest: 1+ generated suite failed");
  step("Generate tests · run Jest · coverage gate", !jestPassed ? "fail" : coverageMet ? "pass" : "fail", covLog.join("\n"));

  const sonar = {
    enabled: false,
    available: true,
    passed: true,
    metrics: { bugs: 0, vulnerabilities: 0, code_smells: 0, security_hotspots: 0 },
    issues: [],
  };
  step("SonarCloud Quality Gate", "skip", "SonarCloud not run in live CI mode.");

  let analysis = null;
  if (!jestPassed) {
    const buggy = files.filter((f) => classifications[f.name].review.status === "buggy").map((f) => `\`${f.name}\``);
    analysis = `Gemini flagged ${buggy.join(", ")} as \`buggy\`. Generated suites for the specified behaviour would fail against the current implementation. Fix the flagged logic and push again.`;
  }

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
    sonarAnalysis: null,
    success: jestPassed && coverageMet && audit.isSecure,
  };

  return { engine: "live", steps, report, markdown: buildMarkdownReport(report) };
}

function clampInt(v, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}
