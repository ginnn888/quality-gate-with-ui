import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runQualityGate } from "@/lib/engine";
import { GitHubError, getFileContent, getRepo } from "@/lib/github";
import { newRunId, saveRun } from "@/lib/store";
import type { RunConfig, RunRecord, RunSource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 25;

interface SourceFile {
  /** flat name handed to the gate (it analyses everything under `src/`) */
  name: string;
  content: string;
  size: number;
  /** original repository path, kept for display */
  path?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  let files: SourceFile[];
  let rawConfig: unknown;
  let source: RunSource;

  try {
    if (contentType.includes("application/json")) {
      ({ files, rawConfig, source } = await collectFromRepo(req, session.accessToken!));
    } else {
      ({ files, rawConfig, source } = await collectFromUpload(req));
    }
  } catch (e) {
    const status = e instanceof BadRequest ? e.status : e instanceof GitHubError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const config = normalizeConfig(rawConfig);
  const runId = newRunId();

  // Unchanged pipeline: the gate receives {name, content} exactly as it always
  // has — repository files simply arrive from the GitHub API instead of a form.
  const result = await runQualityGate({
    runId,
    files: files.map((f) => ({ name: f.name, content: f.content })),
    config,
  });

  const run: RunRecord = {
    id: runId,
    createdAt: new Date().toISOString(),
    engine: result.engine,
    durationMs: result.durationMs,
    config,
    files: files.map((f) => ({ name: f.name, size: f.size, path: f.path })),
    steps: result.steps,
    report: result.report,
    markdown: result.markdown,
    owner: {
      login: session.user.login,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    source,
  };

  await saveRun(run);
  return NextResponse.json(run, { status: 201 });
}

class BadRequest extends Error {
  status = 400;
}

/** Files chosen from a GitHub repository, fetched with the user's own token. */
async function collectFromRepo(req: NextRequest, token: string) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body) throw new BadRequest("Invalid JSON body");

  const owner = String(body.owner || "").trim();
  const repo = String(body.repo || "").trim();
  const paths: string[] = Array.isArray(body.files) ? body.files.map(String) : [];

  if (!owner || !repo) throw new BadRequest("owner and repo are required");
  if (paths.length === 0) throw new BadRequest("Select at least one file to analyse");
  if (paths.length > MAX_FILES) throw new BadRequest(`Too many files (max ${MAX_FILES})`);

  const meta = await getRepo(token, owner, repo);
  const ref = String(body.ref || "").trim() || meta.defaultBranch;

  const files: SourceFile[] = [];
  const used = new Set<string>();

  for (const p of paths) {
    if (!ALLOWED.test(p)) {
      throw new BadRequest(`Unsupported file type: ${p} (allowed: .js .jsx .ts .tsx .mjs .cjs)`);
    }
    const content = await getFileContent(token, owner, repo, ref, p);
    const size = Buffer.byteLength(content, "utf8");
    if (size > MAX_FILE_BYTES) throw new BadRequest(`${p} exceeds 512 KB limit`);
    files.push({ name: flatName(p, used), content, size, path: p });
  }

  const source: RunSource = {
    kind: "repo",
    repo: {
      fullName: meta.fullName,
      owner: meta.owner,
      name: meta.name,
      ref,
      private: meta.private,
      htmlUrl: meta.htmlUrl,
    },
  };
  return { files, rawConfig: body.config, source };
}

/** The original drag-and-drop path, unchanged apart from the owner stamp. */
async function collectFromUpload(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new BadRequest("Expected multipart/form-data");
  }

  const uploads = form.getAll("files").filter((v): v is File => v instanceof File);
  if (uploads.length === 0) throw new BadRequest("No files uploaded");
  if (uploads.length > MAX_FILES) throw new BadRequest(`Too many files (max ${MAX_FILES})`);

  const files: SourceFile[] = [];
  for (const f of uploads) {
    const name = f.name.split(/[\\/]/).pop() || f.name;
    if (!ALLOWED.test(name)) {
      throw new BadRequest(
        `Unsupported file type: ${name} (allowed: .js .jsx .ts .tsx .mjs .cjs)`,
      );
    }
    if (f.size > MAX_FILE_BYTES) throw new BadRequest(`${name} exceeds 512 KB limit`);
    files.push({ name, content: await f.text(), size: f.size });
  }

  let rawConfig: unknown;
  const raw = form.get("config");
  if (typeof raw === "string" && raw.trim()) {
    try {
      rawConfig = JSON.parse(raw);
    } catch {
      throw new BadRequest("Invalid config JSON");
    }
  }
  return { files, rawConfig, source: { kind: "upload" } as RunSource };
}

/**
 * The gate flattens everything into `src/`, so two files with the same
 * basename would collide. Keep the basename when it is unique and fall back to
 * a path-derived name when it is not.
 */
function flatName(repoPath: string, used: Set<string>): string {
  const segments = repoPath.split("/");
  let name = segments[segments.length - 1];
  for (let depth = 2; used.has(name.toLowerCase()) && depth <= segments.length; depth++) {
    name = segments.slice(-depth).join("__");
  }
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = name.replace(/(\.[^.]+)$/, `_${n++}$1`);
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function normalizeConfig(input: unknown): RunConfig {
  const parsed = (input && typeof input === "object" ? input : {}) as Partial<RunConfig>;
  return {
    globalCoverage: clamp(parsed.globalCoverage ?? 80, 0, 100),
    perFileCoverage: sanitizePerFile(parsed.perFileCoverage),
    enableSonar: parsed.enableSonar ?? true,
    enableAiReview: parsed.enableAiReview ?? true,
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

function sanitizePerFile(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = clamp(n, 0, 100);
    }
  }
  return out;
}
