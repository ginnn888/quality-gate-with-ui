import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, commitFiles, getContentMeta, getRepo, requireStatusCheck } from "@/lib/github";
import { getInstalledRepo } from "@/lib/installations";
import { applyRepoSecrets, buildManagedFiles } from "@/lib/installWrite";
import {
  AUDIT_RESOLVE_PATH,
  GATE_CHECK_CONTEXT,
  buildAuditResolveStub,
  normalizeCoverageConfig,
  normalizeSonarOrg,
  normalizeTriggers,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/installations — commit the workflow + config_cov.json into a repo
// (one commit) and set the GEMINI_API_KEY / SONAR_TOKEN repo secrets the gate
// needs. The gate itself is pulled from
// NonnaritRammaneekultawat-6609650459/test-github-marketplace at run time, so
// nothing else is written into the repo.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const token = session.accessToken;

  const body = (await req.json().catch(() => null)) as {
    owner?: string;
    repo?: string;
    coverage?: unknown;
    triggers?: unknown;
    geminiApiKey?: string;
    sonarToken?: string;
    sonarOrg?: string;
    requireCheck?: boolean;
  } | null;

  if (!body?.owner || !body?.repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }
  const owner = String(body.owner).trim();
  const repo = String(body.repo).trim();
  const coverage = normalizeCoverageConfig(body.coverage);
  const triggers = normalizeTriggers(body.triggers);
  const requireCheck = body.requireCheck === true;

  // The console's own env vars are the fallback for both secrets.
  const geminiApiKey = (body.geminiApiKey ?? "").trim() || (process.env.GEMINI_API_KEY ?? "").trim();
  const sonarToken = (body.sonarToken ?? "").trim() || (process.env.SONAR_TOKEN ?? "").trim();
  // Optional, and only ever from the wizard — never a console-wide env fallback:
  // sonar-project.properties is per-repo and pointing it at the wrong org
  // silently breaks the scan. When present alongside a token the console commits
  // the file so the gate can query SonarCloud without hand-authoring it.
  const sonarOrg = normalizeSonarOrg(body.sonarOrg);

  try {
    const meta = await getRepo(token, owner, repo);
    if (!meta.permissions.push) {
      return NextResponse.json(
        { error: "You need push access to this repository to install the gate." },
        { status: 403 },
      );
    }
    const branch = meta.defaultBranch;

    const writesSonarProps = Boolean(sonarToken && sonarOrg);
    const files = buildManagedFiles({
      triggers,
      coverage,
      repo,
      sonarOrg,
      writeSonarProps: writesSonarProps,
    });

    // Seed an empty audit-resolve.json when the repo has none, so there is a
    // place to whitelist npm advisories the gate would otherwise fail on.
    const hasAuditResolve = await getContentMeta(
      token,
      owner,
      repo,
      AUDIT_RESOLVE_PATH,
      branch,
    ).catch(() => null);
    if (!hasAuditResolve) {
      files.push({ path: AUDIT_RESOLVE_PATH, contentUtf8: buildAuditResolveStub() });
    }

    await commitFiles(token, owner, repo, branch, files, "Install Automated Quality Gate");

    const warnings = await applyRepoSecrets(
      token,
      owner,
      repo,
      [
        { name: "GEMINI_API_KEY", value: geminiApiKey },
        { name: "SONAR_TOKEN", value: sonarToken },
      ],
      (name, message) =>
        `Committed the files, but could not set the ${name} secret (${message}). Add it under Settings → Secrets and variables → Actions.`,
    );
    if (!geminiApiKey) {
      warnings.push(
        "No Gemini API key available (none provided and GEMINI_API_KEY is not set on the console) — the gate cannot run until that repo secret is set.",
      );
    }
    if (sonarToken && !sonarOrg) {
      warnings.push(
        "SONAR_TOKEN is set but no SonarCloud organization was provided, so sonar-project.properties was not written — the gate will skip SonarCloud until that file exists.",
      );
    }

    if (requireCheck) {
      try {
        await requireStatusCheck(token, owner, repo, branch, GATE_CHECK_CONTEXT);
      } catch (e) {
        const admin = e instanceof GitHubError && e.status === 403;
        warnings.push(
          admin
            ? `Installed, but could not require the "${GATE_CHECK_CONTEXT}" check on ${branch} — that needs admin on the repo. Add it under Settings → Branches → Branch protection rules.`
            : `Installed, but could not set branch protection (${(e as Error).message}).`,
        );
      }
    }

    const record = await getInstalledRepo(token, owner, repo);
    return NextResponse.json({ record, warnings }, { status: 201 });
  } catch (e) {
    return installError(e);
  }
}
