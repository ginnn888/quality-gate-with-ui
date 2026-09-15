// One card on the dashboard ("/") per repo that has the gate installed —
// purely presentational, `row` is already the fully-derived summary from
// listInstalledRepos(). Links into that repo's detail page.
import Link from "next/link";
import { GitBranch, Globe2, Lock } from "lucide-react";
import type { InstalledRepoSummary } from "@/lib/types";

export function InstalledRepoCard({ row }: { row: InstalledRepoSummary }) {
  return (
    <Link
      href={`/installed/${row.owner}/${row.name}`}
      className="flex flex-col gap-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card transition hover:border-gate-accent/40"
    >
      <div className="flex items-start gap-2">
        {row.private ? (
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gate-accent" aria-hidden />
        ) : (
          <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gate-blue" aria-hidden />
        )}
        <span className="min-w-0 flex-1 break-words font-mono text-sm font-semibold text-gate-text">
          {row.fullName}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gate-muted">
        <span className="inline-flex items-center gap-1">
          <GitBranch className="h-3 w-3" aria-hidden />
          {row.branches.join(", ") || "—"}
        </span>
        <span>coverage ≥ {row.globalCoverage}%</span>
      </div>
    </Link>
  );
}
