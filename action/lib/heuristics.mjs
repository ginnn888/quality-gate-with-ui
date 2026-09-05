// Dependency-free static analysis for the Quality Gate simulation engine.
//
// PORT NOTE: this is a plain-ESM copy of
//   quality-gate-ui/src/lib/engine/heuristics.ts
// It runs inside a consumer repo's Actions checkout, where the Next app's
// TypeScript sources are not present, so the two files are kept in sync by hand.
// If you change the analysis rules in one, mirror them in the other.

// Replace comment bodies with spaces so pattern checks never fire on prose,
// while keeping byte offsets and line numbers intact.
function blankComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
  return out;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// deterministic pseudo-random in [0,1) seeded by a string
function seeded(str) {
  const h = hash(str);
  return (h % 100000) / 100000;
}

const SECRET_RE =
  /(password|passwd|pwd|secret|api[_-]?key|apikey|token|access[_-]?key|private[_-]?key|client[_-]?secret)[\w.$-]*\s*[:=]\s*(['"`])(?!.*(?:placeholder|changeme|example|process\.env|dummy|your[_-]|xxxx|<))[^'"`\s]{6,}\2/i;

/**
 * @param {string} name
 * @param {string} rawCode
 * @returns {{ name: string, findings: object[], classification: object, coverageActual: number }}
 */
export function analyzeFile(name, rawCode) {
  const findings = [];
  const code = blankComments(rawCode);
  const lines = code.split("\n");
  const add = (f) => findings.push(f);

  // ---- security ----
  if (/\beval\s*\(/.test(code)) {
    add({
      severity: "critical",
      kind: "security",
      message: "Use of eval() enables arbitrary code execution on attacker-controlled input.",
      remediation: "Replace eval() with JSON.parse() for data, or a strict allow-list parser for expressions.",
    });
  }
  if (/new\s+Function\s*\(/.test(code)) {
    add({
      severity: "high",
      kind: "security",
      message: "new Function(...) compiles strings into code — same risk class as eval().",
      remediation: "Remove dynamic code compilation; model the behaviour with plain functions or a lookup table.",
    });
  }
  if (/child_process/.test(code) && /(^|[^F])\bexec\s*\(/.test(code) && !/execFile|spawn/.test(code)) {
    add({
      severity: "high",
      kind: "security",
      message: "child_process.exec() runs its argument through a shell — vulnerable to command injection.",
      remediation: "Use execFile()/spawn() with an argument array and shell: false.",
    });
  }
  if (SECRET_RE.test(code)) {
    add({
      severity: "high",
      kind: "security",
      message: "Hardcoded credential/secret literal found in source.",
      remediation: "Move the value to an environment variable and read it via process.env.",
    });
  }
  if (/Math\.random\s*\(/.test(code) && /(token|secret|password|nonce|salt|session|id\b)/i.test(code)) {
    add({
      severity: "medium",
      kind: "security",
      message: "Math.random() is not cryptographically secure but appears to feed a token/secret/id.",
      remediation: "Use crypto.randomBytes()/crypto.randomUUID() for security-sensitive values.",
    });
  }
  if (/["'`]\s*\+\s*\w+\s*\+\s*["'`]/.test(code) && /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i.test(code)) {
    add({
      severity: "high",
      kind: "security",
      message: "SQL statement appears to be assembled by string concatenation.",
      remediation: "Use parameterised queries / prepared statements.",
    });
  }
  lines.forEach((l, i) => {
    if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(l)) {
      add({
        severity: "low",
        kind: "security",
        message: `Plain-HTTP URL on line ${i + 1} — traffic is unencrypted.`,
        remediation: "Switch the endpoint to https://.",
      });
    }
  });

  // ---- logic / quality ----
  const exportsMatch = code.match(/module\.exports\s*=\s*{([^}]*)}/);
  const namedExports = exportsMatch
    ? exportsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const hasValidation = /(typeof\s|Number\.is|Array\.isArray|instanceof|throw\s|isNaN\()/.test(code);
  if (namedExports.length > 0 && !hasValidation) {
    add({
      severity: "medium",
      kind: "logic",
      message: `Exported API (${namedExports.join(", ")}) performs no input validation.`,
      remediation: "Guard each public function: assert argument types and throw TypeError on bad input.",
    });
  }
  if (
    /[*/]/.test(code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /function|=>/.test(code) &&
    !/Object\.is\s*\(/.test(code) &&
    /math|calc|percent|multiply|divide/i.test(name + code)
  ) {
    add({
      severity: "low",
      kind: "logic",
      message: "Arithmetic result is returned without normalising negative zero (-0).",
      remediation: "return Object.is(result, -0) ? 0 : result;",
    });
  }
  if (/[^=!<>]==[^=]/.test(code)) {
    add({
      severity: "low",
      kind: "style",
      message: "Loose equality (==) used — prefer strict equality (===).",
    });
  }
  if (/console\.(log|debug|info)\s*\(/.test(code)) {
    add({ severity: "info", kind: "style", message: "Leftover console logging in source." });
  }
  if (/\b(TODO|FIXME|HACK)\b/.test(code)) {
    add({ severity: "info", kind: "style", message: "Unresolved TODO/FIXME marker in source." });
  }

  // ---- roll up into a classification ----
  const has = (s) => findings.some((f) => f.severity === s);
  const countAtLeast = (levels) => findings.filter((f) => levels.includes(f.severity)).length;

  let importance = "medium";
  if (has("critical")) importance = "critical";
  else if (has("high")) importance = "high";
  else if (countAtLeast(["medium"]) === 0 && code.length < 400) importance = "low";

  let status = "clean";
  if (has("critical") || countAtLeast(["high"]) >= 1) status = "buggy";
  else if (has("medium") || countAtLeast(["low"]) >= 2) status = "suspicious";

  const minCoverage = { critical: 90, high: 80, medium: 70, low: 50 }[importance];

  const realFindings = findings.filter((f) => f.severity !== "info");
  const findingsText =
    realFindings.length === 0
      ? "No issues identified."
      : realFindings.map((f) => `[${f.severity.toUpperCase()}] ${f.message}`).join(" ");
  const remediation = realFindings.find((f) => f.remediation)?.remediation ?? "";

  const focus = Array.from(new Set(findings.map((f) => (f.kind === "style" ? "logic" : f.kind))));
  if (focus.length === 0) focus.push("logic");

  const classification = {
    importance,
    min_coverage_threshold: minCoverage,
    targetCoverage: minCoverage,
    focus_areas: focus,
    description:
      namedExports.length > 0
        ? `Module exposing ${namedExports.length} function(s): ${namedExports.slice(0, 4).join(", ")}.`
        : "Source module analysed by the quality gate.",
    review: { status, findings: findingsText, remediation },
  };

  // ---- estimate coverage the generated tests would reach ----
  let actual = minCoverage + Math.round(seeded(name + code.length) * 12) - 3;
  if (!hasValidation && namedExports.length > 0) actual -= 22;
  if (status === "buggy") actual -= 14;
  if (status === "suspicious") actual -= 6;
  actual = Math.max(0, Math.min(100, actual));

  return { name, findings, classification, coverageActual: actual };
}
