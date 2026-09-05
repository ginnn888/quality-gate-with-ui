import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getContentMeta, getRepo, putFile } from "@/lib/github";
import {
  CONFIG_PATH,
  WORKFLOW_PATH,
  getInstallation,
  listInstallations,
  saveInstallation,
} from "@/lib/installations";
import {
  buildConfigJson,
  buildWorkflowYaml,
  normalizeGateConfig,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";
import type { InstallationRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/installations — repos the signed-in user has installed the gate on.
export async function GET() {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const installations = await listInstallations(session.user.login);
  return NextResponse.json({ installations });
}

// POST /api/installations — commit the workflow + config to a repo.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.login || !session.accessToken) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const token = session.accessToken;

  const body = (await req.json().catch(() => null)) as
    | { owner?: string; repo?: string; config?: unknown }
    | null;
  if (!body?.owner || !body?.repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
  }
  const owner = String(body.owner).trim();
  const repo = String(body.repo).trim();
  const config = normalizeGateConfig(body.config);

  try {
    const meta = await getRepo(token, owner, repo);
    const branch = meta.defaultBranch;

    const workflowYaml = buildWorkflowYaml(config);
    const configJson = buildConfigJson(config);

    const existingWorkflow = await getContentMeta(token, owner, repo, WORKFLOW_PATH, branch);
    const existingConfig = await getContentMeta(token, owner, repo, CONFIG_PATH, branch);
    const verb = existingWorkflow ? "Update" : "Add";

    await putFile(token, owner, repo, WORKFLOW_PATH, {
      message: `${verb} Quality Gate workflow`,
      contentUtf8: workflowYaml,
      sha: existingWorkflow?.sha,
      branch,
    });
    await putFile(token, owner, repo, CONFIG_PATH, {
      message: `${verb} Quality Gate config`,
      contentUtf8: configJson,
      sha: existingConfig?.sha,
      branch,
    });

    const now = new Date().toISOString();
    const prior = await getInstallation(owner, repo);
    const record: InstallationRecord = {
      fullName: meta.fullName,
      owner: meta.owner,
      name: meta.name,
      private: meta.private,
      htmlUrl: meta.htmlUrl,
      defaultBranch: branch,
      installedBy: {
        login: session.user.login,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      },
      installedAt: prior?.installedAt ?? now,
      updatedAt: now,
      config,
      workflowPath: WORKFLOW_PATH,
      configPath: CONFIG_PATH,
    };
    await saveInstallation(record);
    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    return installError(e);
  }
}
