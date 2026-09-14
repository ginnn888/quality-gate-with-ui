// Thin GitHub REST client. Every call is made with the signed-in user's OAuth
// token, so the console can only ever see and change what that GitHub account
// can. There is no server-side GitHub token anywhere.

import type { PullRequestRow, WorkflowRunRow } from "./types";

const API = "https://api.github.com";

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  stars: number;
  updatedAt: string;
  htmlUrl: string;
  permissions: { push: boolean; admin: boolean };
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BASE_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "quality-gate-console",
});

async function parseError(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let msg = `GitHub API ${res.status}`;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) msg = parsed.message;
  } catch {
    /* keep the generic message */
  }
  throw new GitHubError(msg, res.status);
}

async function gh<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    headers: BASE_HEADERS(token),
    cache: "no-store",
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as T;
}

async function ghSend<T>(
  token: string,
  method: "PUT" | "DELETE" | "POST" | "PATCH",
  url: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    method,
    headers: { ...BASE_HEADERS(token), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) await parseError(res);
  return (await res.json().catch(() => ({}))) as T;
}

function mapRepo(r: any): GitHubRepo {
  return {
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login ?? r.full_name?.split("/")[0] ?? "",
    private: !!r.private,
    description: r.description ?? null,
    language: r.language ?? null,
    defaultBranch: r.default_branch ?? "main",
    stars: r.stargazers_count ?? 0,
    updatedAt: r.pushed_at || r.updated_at || "",
    htmlUrl: r.html_url ?? "",
    permissions: {
      push: !!r.permissions?.push,
      admin: !!r.permissions?.admin,
    },
  };
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

// ── repositories ───────────────────────────────────────────────────────────

/** The user's own repositories (incl. private + org repos they can push to). */
export async function listUserRepos(token: string, perPage = 100): Promise<GitHubRepo[]> {
  const data = await gh<any[]>(
    token,
    `/user/repos?per_page=${perPage}&sort=pushed&affiliation=owner,collaborator,organization_member`,
  );
  return data.map(mapRepo);
}

/**
 * Search within the repositories the user can access. GitHub's search API needs
 * an explicit `user:` qualifier to include private repos, so the query is
 * scoped to the signed-in login. Any `user:` / `org:` / `repo:` qualifier the
 * caller typed is stripped first so the search can't be steered off that login.
 */
export async function searchUserRepos(
  token: string,
  login: string,
  query: string,
  perPage = 50,
): Promise<GitHubRepo[]> {
  const cleaned = query.replace(/\b(?:user|org|repo):\S+/gi, "").trim();
  const q = `${cleaned} user:${login} fork:true`.trim();
  const data = await gh<{ items: any[] }>(
    token,
    `/search/repositories?q=${encodeURIComponent(q)}&per_page=${perPage}`,
  );
  return (data.items ?? []).map(mapRepo);
}

export async function getRepo(token: string, owner: string, repo: string): Promise<GitHubRepo> {
  return mapRepo(await gh<any>(token, `/repos/${owner}/${repo}`));
}

export async function listBranches(token: string, owner: string, repo: string): Promise<string[]> {
  const data = await gh<any[]>(token, `/repos/${owner}/${repo}/branches?per_page=100`);
  return data.map((b) => b.name);
}

// ── file contents ──────────────────────────────────────────────────────────

/** Metadata for a file already in the repo, or null when it does not exist. */
export async function getContentMeta(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<{ sha: string; contentBase64: string } | null> {
  try {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const data = await gh<{ sha: string; content?: string }>(
      token,
      `/repos/${owner}/${repo}/contents/${encodePath(filePath)}${q}`,
    );
    return { sha: data.sha, contentBase64: data.content ?? "" };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  }
}

/** Decoded UTF-8 text of a file, or null when it does not exist. */
export async function getFileText(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<string | null> {
  const meta = await getContentMeta(token, owner, repo, filePath, ref);
  if (!meta) return null;
  return Buffer.from(meta.contentBase64, "base64").toString("utf8");
}

/** Parsed JSON of a file, or null when it is missing / unparseable. */
export async function getJsonFile<T = unknown>(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<T | null> {
  const text = await getFileText(token, owner, repo, filePath, ref);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Create or update a file. Pass `sha` to update an existing one. */
export async function putFile(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  opts: { message: string; contentUtf8: string; sha?: string; branch?: string },
): Promise<void> {
  await ghSend(token, "PUT", `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, {
    message: opts.message,
    content: Buffer.from(opts.contentUtf8, "utf8").toString("base64"),
    sha: opts.sha,
    branch: opts.branch,
  });
}

/** Delete a file (its current `sha` is required). */
export async function deleteFile(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  opts: { message: string; sha: string; branch?: string },
): Promise<void> {
  await ghSend(token, "DELETE", `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, {
    message: opts.message,
    sha: opts.sha,
    branch: opts.branch,
  });
}

// ── multi-file commits (Git Data API) ─────────────────────────────────────
// Add / delete several files in ONE commit instead of one commit per file.

type TreeEntry = { path: string; mode: "100644"; type: "blob"; sha: string | null };

async function commitTree(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  tree: TreeEntry[],
  message: string,
): Promise<void> {
  const ref = await gh<{ object: { sha: string } }>(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  const parentSha = ref.object.sha;
  const parent = await gh<{ tree: { sha: string } }>(
    token,
    `/repos/${owner}/${repo}/git/commits/${parentSha}`,
  );
  const newTree = await ghSend<{ sha: string }>(token, "POST", `/repos/${owner}/${repo}/git/trees`, {
    base_tree: parent.tree.sha,
    tree,
  });
  const commit = await ghSend<{ sha: string }>(
    token,
    "POST",
    `/repos/${owner}/${repo}/git/commits`,
    { message, tree: newTree.sha, parents: [parentSha] },
  );
  await ghSend(
    token,
    "PATCH",
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { sha: commit.sha },
  );
}

/** Create/update several files in a single commit on `branch`. */
export async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; contentUtf8: string }[],
  message: string,
): Promise<void> {
  const tree = await Promise.all(
    files.map(async (f): Promise<TreeEntry> => {
      const blob = await ghSend<{ sha: string }>(
        token,
        "POST",
        `/repos/${owner}/${repo}/git/blobs`,
        { content: Buffer.from(f.contentUtf8, "utf8").toString("base64"), encoding: "base64" },
      );
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    }),
  );
  await commitTree(token, owner, repo, branch, tree, message);
}

/** Delete several files in a single commit. Missing paths make GitHub 422 — filter first. */
export async function deleteFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  message: string,
): Promise<void> {
  if (paths.length === 0) return;
  const tree: TreeEntry[] = paths.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null }));
  await commitTree(token, owner, repo, branch, tree, message);
}

// ── Actions: workflow runs ─────────────────────────────────────────────────

function mapRun(r: any): WorkflowRunRow {
  return {
    id: r.id,
    runNumber: r.run_number,
    status: r.status ?? "unknown",
    conclusion: r.conclusion ?? null,
    event: r.event ?? "",
    headBranch: r.head_branch ?? null,
    headSha: r.head_sha ?? "",
    htmlUrl: r.html_url ?? "",
    createdAt: r.created_at ?? "",
  };
}

/** Recent runs of one workflow file (e.g. `quality-gate.yml`). */
export async function listWorkflowRuns(
  token: string,
  owner: string,
  repo: string,
  workflowFile: string,
  perPage = 30,
): Promise<WorkflowRunRow[]> {
  const data = await gh<{ workflow_runs?: any[] }>(
    token,
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
      workflowFile,
    )}/runs?per_page=${perPage}`,
  );
  return (data.workflow_runs ?? []).map(mapRun);
}

/**
 * Permanently delete one workflow run and its logs. GitHub 409s on a run that
 * is still in progress — callers should skip non-completed runs.
 */
export async function deleteWorkflowRun(
  token: string,
  owner: string,
  repo: string,
  runId: number,
): Promise<void> {
  await ghSend(token, "DELETE", `/repos/${owner}/${repo}/actions/runs/${runId}`, undefined);
}

// ── Actions: secrets (encrypted writes) ────────────────────────────────────

/** The repo's Actions public key — needed to encrypt a secret value before upload. */
export async function getActionsPublicKey(
  token: string,
  owner: string,
  repo: string,
): Promise<{ keyId: string; key: string }> {
  const data = await gh<{ key_id: string; key: string }>(
    token,
    `/repos/${owner}/${repo}/actions/secrets/public-key`,
  );
  return { keyId: data.key_id, key: data.key };
}

/** Create or update one repo Actions secret. `encryptedValue` is a libsodium sealed box, base64. */
export async function putActionsSecret(
  token: string,
  owner: string,
  repo: string,
  name: string,
  encryptedValue: string,
  keyId: string,
): Promise<void> {
  await ghSend(token, "PUT", `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
    encrypted_value: encryptedValue,
    key_id: keyId,
  });
}

/**
 * Names of the repo's Actions secrets. Requires admin on the repo — returns
 * `null` when the token cannot read them so callers can degrade gracefully.
 */
export async function listActionsSecretNames(
  token: string,
  owner: string,
  repo: string,
): Promise<string[] | null> {
  try {
    const data = await gh<{ secrets?: { name: string }[] }>(
      token,
      `/repos/${owner}/${repo}/actions/secrets?per_page=100`,
    );
    return (data.secrets ?? []).map((s) => s.name);
  } catch (e) {
    if (e instanceof GitHubError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

// ── pull requests + comments ──────────────────────────────────────────────

export async function listOpenPullRequests(
  token: string,
  owner: string,
  repo: string,
  perPage = 20,
): Promise<PullRequestRow[]> {
  const data = await gh<any[]>(
    token,
    `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=${perPage}`,
  );
  return data.map((p) => ({
    number: p.number,
    title: p.title ?? "",
    htmlUrl: p.html_url ?? "",
    headBranch: p.head?.ref ?? "",
    headSha: p.head?.sha ?? "",
    author: p.user?.login ?? "",
    updatedAt: p.updated_at ?? "",
  }));
}

export interface IssueComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

export async function listIssueComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  perPage = 100,
): Promise<IssueComment[]> {
  const data = await gh<any[]>(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${perPage}`,
  );
  return data.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    user: c.user?.login ?? "",
    createdAt: c.created_at ?? "",
    updatedAt: c.updated_at ?? "",
  }));
}

// ── branch protection: require the gate status check ──────────────────────

/**
 * Whether `branch` already requires `context` as a passing status check before
 * merge. `readable: false` when the token can't see protection (needs admin).
 */
export async function getRequiredCheckState(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  context: string,
): Promise<{ readable: boolean; required: boolean }> {
  try {
    const data = await gh<{ contexts?: string[]; checks?: { context: string }[] }>(
      token,
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(
        branch,
      )}/protection/required_status_checks`,
    );
    const contexts = new Set([
      ...(data.contexts ?? []),
      ...(data.checks ?? []).map((c) => c.context),
    ]);
    return { readable: true, required: contexts.has(context) };
  } catch (e) {
    // 404 = no protection / no required checks, but the token could read it.
    if (e instanceof GitHubError && e.status === 404) return { readable: true, required: false };
    // 403 = the token lacks admin on the repo.
    if (e instanceof GitHubError && e.status === 403) return { readable: false, required: false };
    throw e;
  }
}

/** Reshape a GET /protection body into a PUT /protection body, preserving
 *  whatever rule is already there. */
function protectionGetToPut(cur: any, requiredContexts: string[]): Record<string, unknown> {
  const restr = cur?.restrictions;
  return {
    required_status_checks: {
      strict: Boolean(cur?.required_status_checks?.strict),
      contexts: requiredContexts,
    },
    enforce_admins: Boolean(cur?.enforce_admins?.enabled) || null,
    required_pull_request_reviews: cur?.required_pull_request_reviews
      ? {
          dismiss_stale_reviews: Boolean(cur.required_pull_request_reviews.dismiss_stale_reviews),
          require_code_owner_reviews: Boolean(
            cur.required_pull_request_reviews.require_code_owner_reviews,
          ),
          required_approving_review_count:
            cur.required_pull_request_reviews.required_approving_review_count ?? 0,
        }
      : null,
    restrictions: restr
      ? {
          users: (restr.users ?? []).map((u: any) => u.login),
          teams: (restr.teams ?? []).map((t: any) => t.slug),
          apps: (restr.apps ?? []).map((a: any) => a.slug),
        }
      : null,
  };
}

/**
 * Add `context` to `branch`'s required status checks, creating a minimal
 * protection rule if the branch has none. Needs admin on the repo (surfaces as
 * a GitHubError with status 403).
 */
export async function requireStatusCheck(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  context: string,
): Promise<void> {
  const prot = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;
  try {
    // Fast path: append the context, leaving every other protection setting alone.
    await ghSend(token, "POST", `${prot}/required_status_checks/contexts`, [context]);
    return;
  } catch (e) {
    if (!(e instanceof GitHubError) || e.status !== 404) throw e;
  }
  // 404 → the branch has no `required_status_checks` block yet.
  const current = await gh<any>(token, prot).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) return null;
    throw e;
  });
  if (current) {
    const existing: string[] = [
      ...(current.required_status_checks?.contexts ?? []),
      ...(current.required_status_checks?.checks ?? []).map((c: any) => c.context),
    ];
    await ghSend(token, "PUT", prot, protectionGetToPut(current, [...new Set([...existing, context])]));
  } else {
    await ghSend(token, "PUT", prot, {
      required_status_checks: { strict: false, contexts: [context] },
      enforce_admins: null,
      required_pull_request_reviews: null,
      restrictions: null,
    });
  }
}

/**
 * Remove `context` from `branch`'s required status checks, leaving the rest of
 * the protection rule intact. No-op when it wasn't required. Needs admin.
 */
export async function unrequireStatusCheck(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  context: string,
): Promise<void> {
  try {
    await ghSend(
      token,
      "DELETE",
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(
        branch,
      )}/protection/required_status_checks/contexts`,
      [context],
    );
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return;
    throw e;
  }
}

// ── small concurrency helper ──────────────────────────────────────────────

/** Run `fn` over `items` with at most `limit` in flight. Order is preserved. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
