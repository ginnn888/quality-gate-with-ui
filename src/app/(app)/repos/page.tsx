// "/repos" — browse-and-install. Server half: fetches the user's repo list
// and (separately, the cheaper scan) which of them already have the gate, in
// parallel, then hands both to <ReposBrowser> — the client island that owns
// search and the visibility filter.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listUserRepos } from "@/lib/github";
import { listInstalledFullNames } from "@/lib/installations";
import { ReposBrowser } from "./ReposBrowser";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/signin");

  const [repos, installed] = await Promise.all([
    listUserRepos(session.accessToken).catch(() => []),
    listInstalledFullNames(session.accessToken).catch(() => []),
  ]);

  return <ReposBrowser initialRepos={repos} installedFullNames={installed} />;
}
