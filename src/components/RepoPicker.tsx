"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Globe2, Lock, Search, XCircle } from "lucide-react";
import type { GitHubRepo } from "@/lib/github";
import type { RunSummaryRow } from "@/lib/types";

type Visibility = "all" | "public" | "private";
type RepoStatus = { success: boolean; createdAt: string } | null;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function VisibilityIcon({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <Lock className="h-3.5 w-3.5 shrink-0 text-gate-accent" aria-hidden />
  ) : (
    <Globe2 className="h-3.5 w-3.5 shrink-0 text-gate-blue" aria-hidden />
  );
}

function StatusPill({ status }: { status: RepoStatus }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gate-skip/10 px-2 py-0.5 text-[11px] font-medium text-gate-muted">
        <CircleDashed className="h-3 w-3" aria-hidden />
        not analysed
      </span>
    );
  }
  return status.success ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-gate-pass/10 px-2 py-0.5 text-[11px] font-medium text-gate-pass">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      passing
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-gate-fail/10 px-2 py-0.5 text-[11px] font-medium text-gate-fail">
      <XCircle className="h-3 w-3" aria-hidden />
      failing
    </span>
  );
}

/**
 * Repository dashboard — find the repo, see its visibility and its last
 * quality-gate result at a glance. Typing searches GitHub (scoped to the
 * signed-in account, so private repos are included); an empty box shows the
 * most recently pushed repositories the account can reach.
 */
export function RepoPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: GitHubRepo | null;
  onSelect: (repo: GitHubRepo | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusByRepo, setStatusByRepo] = useState<Record<string, RepoStatus>>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest run per repository, so each row can show a pass/fail pill — this is
  // the "status of each repository" the dashboard promises at a glance.
  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.runs ?? []) as RunSummaryRow[];
        const byRepo: Record<string, RepoStatus> = {};
        for (const r of rows) {
          if (r.repoFullName && !byRepo[r.repoFullName]) {
            byRepo[r.repoFullName] = { success: r.success, createdAt: r.createdAt };
          }
        }
        setStatusByRepo(byRepo);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    let alive = true;
    setLoading(true);
    setError(null);

    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/github/repos?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || `GitHub request failed (${res.status})`);
        setRepos(data.repos ?? []);
      } catch (e: any) {
        if (alive) setError(e.message || "Could not load repositories");
      } finally {
        if (alive) setLoading(false);
      }
    }, query.trim() ? 350 : 0);

    return () => {
      alive = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  // Local narrowing on top of the server list keeps typing responsive between
  // debounced round-trips, and applies the visibility filter client-side.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((r) => {
      if (visibility === "public" && r.private) return false;
      if (visibility === "private" && !r.private) return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [repos, query, visibility]);

  if (selected) {
    const status = statusByRepo[selected.fullName] ?? null;
    return (
      <section className="rounded-xl border border-gate-accent/40 bg-gate-panel p-4 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  selected.private
                    ? "bg-gate-accentSoft text-gate-accent"
                    : "bg-gate-blueSoft text-gate-blue"
                }`}
              >
                <VisibilityIcon isPrivate={selected.private} />
                {selected.private ? "Private" : "Public"}
              </span>
              <span className="truncate font-mono text-sm font-semibold text-gate-text">
                {selected.fullName}
              </span>
              <StatusPill status={status} />
            </div>
            {selected.description && (
              <p className="mt-1.5 line-clamp-2 text-xs text-gate-muted">{selected.description}</p>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-md border border-gate-border px-2.5 py-1 text-xs font-medium text-gate-muted transition hover:border-gate-accent/50 hover:text-gate-accent disabled:opacity-50"
          >
            Change
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gate-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your repositories…"
            className="w-full rounded-xl border border-gate-border bg-gate-panel py-2.5 pl-9 pr-3 text-sm text-gate-text shadow-card outline-none placeholder:text-gate-muted focus:border-gate-accent disabled:opacity-50"
          />
        </div>

        <div className="flex shrink-0 gap-1 rounded-xl border border-gate-border bg-gate-panel p-1 text-xs shadow-card">
          {(
            [
              ["all", "All"],
              ["public", "Public"],
              ["private", "Private"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => setVisibility(value)}
              className={`rounded-lg px-2.5 py-1.5 font-medium transition disabled:opacity-50 ${
                visibility === value
                  ? "bg-gate-accentSoft text-gate-accent"
                  : "text-gate-muted hover:text-gate-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-gate-fail/30 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error}
        </div>
      )}

      <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-gate-border bg-gate-panel shadow-card">
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">loading repositories…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">
            {query.trim() ? `No repositories match “${query.trim()}”.` : "No repositories found."}
          </p>
        ) : (
          <ul className="divide-y divide-gate-border">
            {visible.map((r) => {
              const status = statusByRepo[r.fullName] ?? null;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(r)}
                    className="block w-full px-4 py-3 text-left transition hover:bg-gate-accent/5 disabled:opacity-50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <VisibilityIcon isPrivate={r.private} />
                      <span className="truncate font-mono text-xs font-medium text-gate-text">
                        {r.fullName}
                      </span>
                      <StatusPill status={status} />
                      <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-gate-muted">
                        {r.language && <span>{r.language}</span>}
                        {r.updatedAt && <span>· {timeAgo(r.updatedAt)}</span>}
                      </span>
                    </div>
                    {r.description && (
                      <p className="mt-1 line-clamp-1 pl-5 text-[11px] text-gate-muted">
                        {r.description}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
