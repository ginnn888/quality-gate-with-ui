import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { listInstallations } from "@/lib/installations";
import { InstalledRepoCard } from "@/components/InstalledRepoCard";

export const dynamic = "force-dynamic";

export default async function InstalledPage() {
  const session = await auth();
  if (!session?.user?.login) redirect("/signin?callbackUrl=/installed");

  const rows = await listInstallations(session.user.login);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gate-text">
          <PackageCheck className="h-5 w-5 text-gate-muted" aria-hidden />
          Installed repositories
        </h1>
        <p className="mt-1 text-sm text-gate-muted">
          Repositories running the quality gate on every push and pull request. Open one to see
          its recent runs, change thresholds, or uninstall.
        </p>
      </section>

      {rows.length === 0 ? (
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
