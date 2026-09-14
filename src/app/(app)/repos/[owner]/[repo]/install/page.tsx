import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getRepoInstallContext } from "@/lib/installations";
import { InstallWizard } from "./InstallWizard";

export const dynamic = "force-dynamic";

export default async function InstallPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/signin");

  let context: Awaited<ReturnType<typeof getRepoInstallContext>> | null = null;
  let error: string | null = null;
  try {
    context = await getRepoInstallContext(session.accessToken, owner, repo);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not read the repository";
  }

  if (!context) {
    return (
      <div className="space-y-6">
        <Link
          href="/repos"
          className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          repositories
        </Link>
        <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error ?? "Repository not found."}
        </div>
      </div>
    );
  }

  return (
    <InstallWizard
      owner={owner}
      repo={repo}
      defaultBranch={context.repo.defaultBranch}
      branches={context.branches}
      preflight={context.preflight}
    />
  );
}
