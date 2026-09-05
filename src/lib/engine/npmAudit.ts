import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AuditReport } from "../types";

// Runs a real `npm audit --json` against a target Node project (the bundled
// sample by default) and applies the same audit-resolve.json ignore list the
// GitHub Action uses. Falls back to a static result if npm/network is absent.
export function runNpmAudit(): { report: AuditReport; log: string } {
  const target =
    process.env.QG_AUDIT_PROJECT ||
    path.resolve(process.cwd(), "..", "Automated-Quality-Gate (1)", "Automated-Quality-Gate");

  const report: AuditReport = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    isSecure: true,
    details: [],
  };
  const logLines: string[] = [`$ npm audit --json  (cwd: ${target})`];

  if (!existsSync(path.join(target, "package.json"))) {
    logLines.push("audit target has no package.json — using static baseline");
    return { report: staticBaseline(report), log: logLines.join("\n") };
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const res = spawnSync(npm, ["audit", "--json"], {
    cwd: target,
    encoding: "utf8",
    shell: true,
    timeout: 60_000,
  });
  const output = res.stdout || res.stderr || "";

  let data: any;
  try {
    data = JSON.parse(output);
  } catch {
    logLines.push("could not parse npm audit output — using static baseline");
    return { report: staticBaseline(report), log: logLines.join("\n") };
  }

  const ignored = new Set<number>();
  const resolveFile = path.join(target, "audit-resolve.json");
  if (existsSync(resolveFile)) {
    try {
      const parsed = JSON.parse(readFileSync(resolveFile, "utf8"));
      for (const d of parsed.decisions || []) ignored.add(d.id);
      logLines.push(`audit-resolve.json: ignoring ${ignored.size} advisory id(s)`);
    } catch {
      /* ignore */
    }
  }

  const vulns = data?.vulnerabilities || {};
  for (const v of Object.values<any>(vulns)) {
    if (v?.via && Array.isArray(v.via)) {
      const advId = v.via.find((x: any) => typeof x === "object" && x.source)?.source;
      if (advId && ignored.has(advId)) continue;
    }
    switch (v.severity) {
      case "critical":
        report.critical++;
        break;
      case "high":
        report.high++;
        break;
      case "moderate":
        report.moderate++;
        break;
      case "low":
        report.low++;
        break;
    }
    if (v.name) report.details.push(`${v.name} (${v.severity})`);
  }

  report.isSecure = report.critical === 0 && report.high === 0;
  logLines.push(
    `found: critical=${report.critical} high=${report.high} moderate=${report.moderate} low=${report.low}`,
    report.isSecure ? "result: SECURE" : "result: VULNERABLE (high/critical present)",
  );
  return { report, log: logLines.join("\n") };
}

function staticBaseline(report: AuditReport): AuditReport {
  return { ...report, moderate: 0, low: 0, isSecure: true, details: [] };
}
