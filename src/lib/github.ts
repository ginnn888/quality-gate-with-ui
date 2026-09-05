// Thin GitHub REST client. Every call is made with the signed-in user's OAuth
// token, so the console can only ever see what that GitHub account can see.

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
}

export interface RepoFileEntry {
  path: string;
  size: number;
}

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function gh<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "quality-gate-console",
    },
    cache: "no-store",
  });
  if (!res.ok) {
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
  return (await res.json()) as T;
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
  };
}

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
 * scoped to the signed-in login.
 */
export async function searchUserRepos(
  token: string,
  login: string,
  query: string,
  perPage = 50,
): Promise<GitHubRepo[]> {
  const q = `${query} user:${login} fork:true`;
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

const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;
const IGNORED_DIR =
  /(^|\/)(node_modules|dist|build|out|coverage|\.next|\.git|vendor|__snapshots__|\.yarn)(\/|$)/i;
const TEST_FILE = /(\.(test|spec)\.[jt]sx?$)|((^|\/)(__tests__|tests?)\/)/i;

/**
 * Every analysable source file in a ref, already filtered down to the file
 * types the quality gate understands. Test files and build output are dropped —
 * the gate generates its own tests.
 */
export async function listSourceFiles(
  token: string,
  owner: string,
  repo: string,
  ref: string,
): Promise<{ files: RepoFileEntry[]; truncated: boolean }> {
  const tree = await gh<{ tree: any[]; truncated: boolean }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  const files = (tree.tree ?? [])
    .filter(
      (n) =>
        n.type === "blob" &&
        SOURCE_EXT.test(n.path) &&
        !IGNORED_DIR.test(n.path) &&
        !TEST_FILE.test(n.path),
    )
    .map((n) => ({ path: n.path as string, size: Number(n.size) || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return { files, truncated: !!tree.truncated };
}

/** Raw content of one file at a ref. */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  ref: string,
  filePath: string,
): Promise<string> {
  const data = await gh<{ content?: string; encoding?: string; size: number }>(
    token,
    `/repos/${owner}/${repo}/contents/${filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(ref)}`,
  );
  if (!data.content) throw new GitHubError(`${filePath} has no readable content`, 422);
  return Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8");
}
