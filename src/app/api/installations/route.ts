import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getContentMeta, getRepo, putFile } from "@/lib/github";
import { getInstalledRepo, listInstalledRepos } from "@/lib/installations";
import { setRepoSecret } from "@/lib/githubSecrets";
import {
  CONFIG_PATH,
  WORKFLOW_PATH,
  buildCoverageConfigJson,
  buildWorkflowYaml,
  normalizeCoverageConfig,
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

// POST /api/installations — commit the workflow + config_cov.json to a repo and
// set the GEMINI_API_KEY / SONAR_TOKEN repo secrets the action needs.
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
  } | null;

  if (!body?.owner || !body?.repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }
  const owner = String(body.owner).trim();
  const repo = String(body.repo).trim();
  const coverage = normalizeCoverageConfig(body.coverage);
  const triggers = normalizeTriggers(body.triggers);
  const geminiApiKey = (body.geminiApiKey ?? "").trim();
  const sonarToken = (body.sonarToken ?? "").trim();

  try {
    const meta = await getRepo(token, owner, repo);
    if (!meta.permissions.push) {
      return NextResponse.json(
        { error: "You need push access to this repository to install the gate." },
        { status: 403 },
      );
    }
    const branch = meta.defaultBranch;

    const existingWorkflow = await getContentMeta(token, owner, repo, WORKFLOW_PATH, branch);
    const existingConfig = await getContentMeta(token, owner, repo, CONFIG_PATH, branch);
    const verb = existingWorkflow ? "Update" : "Add";

    await putFile(token, owner, repo, WORKFLOW_PATH, {
      message: `${verb} Quality Gate workflow`,
      contentUtf8: buildWorkflowYaml(triggers),
      sha: existingWorkflow?.sha,
      branch,
    });
    await putFile(token, owner, repo, CONFIG_PATH, {
      message: `${verb} Quality Gate coverage config`,
      contentUtf8: buildCoverageConfigJson(coverage),
      sha: existingConfig?.sha,
      branch,
    });

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
        "No GEMINI_API_KEY provided — the gate cannot run until that repo secret is set.",
      );
    }

    const record = await getInstalledRepo(token, owner, repo);
    return NextResponse.json({ record, warnings }, { status: 201 });
  } catch (e) {
    return installError(e);
  }
}
