// "/" — the dashboard. A Server Component: it calls listInstalledRepos()
// directly (no client-side fetch, no loading spinner on first paint) and
// renders one InstalledRepoCard per repo that already has the gate. This page
// has no client half — there is nothing on it to click that needs local state.

import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageCheck, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { listInstalledRepos } from "@/lib/installations";
import { InstalledRepoCard } from "@/components/InstalledRepoCard";

// Force per-request rendering: this page reads the signed-in user's own
// repos, so it must never be cached/reused across different users.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/signin");

  let rows: Awaited<ReturnType<typeof listInstalledRepos>> = [];
  let error: string | null = null;
  try {
    rows = await listInstalledRepos(session.accessToken);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gate-text">
            <PackageCheck className="h-5 w-5 text-gate-accent" aria-hidden />
            Installed repositories
          </h1>
          <p className="mt-1 text-sm text-gate-muted">
            Repositories running the Automated Quality Gate — pulled from{" "}
            <span className="font-mono text-gate-text">
              NonnaritRammaneekultawat-6609650459/test-github-marketplace
            </span>{" "}
            — on
            every push and pull request. Open one to tune coverage, manage secrets, or read the
            latest PR results.
          </p>
        </div>
        <Link
          href="/repos"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-gate-accent to-gate-blue px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Install on a repo
        </Link>
      </section>

      {error && (
        <div className="rounded-lg border border-gate-fail/30 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error}
        </div>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gate-border bg-gate-panel px-4 py-10 text-center text-sm text-gate-muted">
          Nothing installed yet.{" "}
          <Link href="/repos" className="text-gate-accent hover:underline">
            Pick a repository
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <InstalledRepoCard key={row.fullName} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
