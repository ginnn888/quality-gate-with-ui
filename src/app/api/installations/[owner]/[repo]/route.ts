import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GitHubError, commitFiles, deleteFiles, getContentMeta, getFileText } from "@/lib/github";
import { getInstalledRepo } from "@/lib/installations";
import { applyRepoSecrets, buildManagedFiles } from "@/lib/installWrite";
import {
  LEGACY_PATHS,
  MANAGED_PATHS,
  SONAR_PROPS_PATH,
  normalizeCoverageConfig,
  normalizeSonarOrg,
  normalizeTriggers,
} from "@/lib/workflowTemplate";
import { installError } from "@/lib/apiErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ owner: string; repo: string }> };

async function guard(ctx: Ctx) {
  const session = await auth();
  if (!session?.accessToken) {
    return { error: NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 }) };
  }
  const { owner, repo } = await ctx.params;
  const record = await getInstalledRepo(session.accessToken, owner, repo).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  });
  if (!record) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { token: session.accessToken, owner, repo, record };
}

// PATCH — change coverage / triggers. Always re-commits config_cov.json and the
// workflow (idempotent, tiny) so console template updates reach existing
// installs on any Save. Optionally refreshes a secret. All writes land in one commit.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;

  const body = (await req.json().catch(() => null)) as {
    coverage?: unknown;
    triggers?: unknown;
    geminiApiKey?: string;
    sonarToken?: string;
    sonarOrg?: string;
  } | null;

  const coverage = normalizeCoverageConfig(body?.coverage ?? record.coverage);
  const triggers = normalizeTriggers(body?.triggers ?? record.triggers);
  const branch = record.defaultBranch;

  try {
    // Keep sonar-project.properties in sync when it already exists, or add it
    // now if this Save supplies a SonarCloud org. The org is taken from the
    // request, falling back to whatever the committed file already declares.
    const existingProps = await getFileText(token, owner, repo, SONAR_PROPS_PATH, branch).catch(
      () => null,
    );
    const orgFromFile = existingProps?.match(/^\s*sonar\.organization\s*=\s*(\S+)/m)?.[1] ?? "";
    const sonarOrg = normalizeSonarOrg(body?.sonarOrg || orgFromFile);

    const files = buildManagedFiles({
      triggers,
      coverage,
      repo,
      sonarOrg,
      writeSonarProps: Boolean(existingProps != null || body?.sonarOrg),
    });

    await commitFiles(token, owner, repo, branch, files, "Update Automated Quality Gate");

    const warnings = await applyRepoSecrets(
      token,
      owner,
      repo,
      [
        { name: "GEMINI_API_KEY", value: (body?.geminiApiKey ?? "").trim() },
        { name: "SONAR_TOKEN", value: (body?.sonarToken ?? "").trim() },
      ],
      (name, message) => `Could not update the ${name} secret (${message}).`,
    );

    const updated = await getInstalledRepo(token, owner, repo);
    return NextResponse.json({ record: updated, warnings });
  } catch (e) {
    return installError(e);
  }
}

// DELETE — remove every file the console manages, in one commit.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ("error" in g) return g.error;
  const { token, owner, repo, record } = g;
  const branch = record.defaultBranch;

  try {
    const present: string[] = [];
    await Promise.all(
      [...MANAGED_PATHS, ...LEGACY_PATHS].map(async (p) => {
        const meta = await getContentMeta(token, owner, repo, p, branch).catch(() => null);
        if (meta) present.push(p);
      }),
    );
    await deleteFiles(token, owner, repo, branch, present, "Remove Automated Quality Gate");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GitHubError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
