import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { commitFiles, getRepo } from "@/lib/github";
import { getInstalledRepo, listInstalledRepos } from "@/lib/installations";
import { setRepoSecret } from "@/lib/githubSecrets";
import {
  buildCoverageConfigJson,
  buildSonarPropertiesFile,
  buildWorkflowYaml,
  CONFIG_PATH,
  SONAR_PROPS_PATH,
  WORKFLOW_PATH,
  normalizeCoverageConfig,
  normalizeSonarOrg,
  normalizeTriggers,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/installations — every repo the user can reach that has the gate installed.
export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  try {
    const installations = await listInstalledRepos(session.accessToken);
    return NextResponse.json({ installations });
  } catch (e) {
    return installError(e);
  }
}

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
    openTestsPr?: boolean;
  } | null;

  if (!body?.owner || !body?.repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }
  const owner = String(body.owner).trim();
  const repo = String(body.repo).trim();
  const coverage = normalizeCoverageConfig(body.coverage);
  const triggers = normalizeTriggers(body.triggers);

  // The console's own env vars are the fallback for both secrets.
  const geminiApiKey = (body.geminiApiKey ?? "").trim() || (process.env.GEMINI_API_KEY ?? "").trim();
  const sonarToken = (body.sonarToken ?? "").trim() || (process.env.SONAR_TOKEN ?? "").trim();
  // Optional. When present alongside a token, the console also commits
  // sonar-project.properties so the gate can query SonarCloud without the user
  // hand-authoring that file.
  const sonarOrg = normalizeSonarOrg(body.sonarOrg ?? process.env.SONAR_ORGANIZATION);
  const openTestsPr =
    body.openTestsPr ?? String(process.env.AQG_OPEN_TESTS_PR).toLowerCase() === "true";

  try {
    const meta = await getRepo(token, owner, repo);
    if (!meta.permissions.push) {
      return NextResponse.json(
        { error: "You need push access to this repository to install the gate." },
        { status: 403 },
      );
    }
    const branch = meta.defaultBranch;

    const files = [
      { path: WORKFLOW_PATH, contentUtf8: buildWorkflowYaml(triggers, { openTestsPr }) },
      { path: CONFIG_PATH, contentUtf8: buildCoverageConfigJson(coverage) },
    ];
    const writesSonarProps = Boolean(sonarToken && sonarOrg);
    if (writesSonarProps) {
      files.push({
        path: SONAR_PROPS_PATH,
        contentUtf8: buildSonarPropertiesFile(sonarOrg, repo),
      });
    }

    await commitFiles(token, owner, repo, branch, files, "Install Automated Quality Gate");

    const warnings: string[] = [];
    for (const [name, value] of [
      ["GEMINI_API_KEY", geminiApiKey],
      ["SONAR_TOKEN", sonarToken],
    ] as const) {
      if (!value) continue;
      try {
        await setRepoSecret(token, owner, repo, name, value);
      } catch (e) {
        warnings.push(
          `Committed the files, but could not set the ${name} secret (${
            (e as Error).message
          }). Add it under Settings → Secrets and variables → Actions.`,
        );
      }
    }
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

    const record = await getInstalledRepo(token, owner, repo);
    return NextResponse.json({ record, warnings }, { status: 201 });
  } catch (e) {
    return installError(e);
  }
}
