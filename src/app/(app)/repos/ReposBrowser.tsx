"use client";

// The searchable repo list. `initialRepos` / `installedFullNames` are read
// server-side by page.tsx so the first paint needs no client fetch at all;
// this file only calls the network once the user actually types a query
// (GitHub search, debounced) — clearing the box drops back to the server list
// instead of re-fetching it.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Globe2, Lock, Search } from "lucide-react";
import type { GitHubRepo } from "@/lib/github";

type Visibility = "all" | "public" | "private";

export function ReposBrowser({
  initialRepos,
  installedFullNames,
}: {
  initialRepos: GitHubRepo[];
  installedFullNames: string[];
}) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [repos, setRepos] = useState<GitHubRepo[]>(initialRepos);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const installed = useMemo(
    () => new Set(installedFullNames.map((n) => n.toLowerCase())),
    [installedFullNames],
  );

  // The server already handed us the user's repos. Only reach for GitHub search
  // once the user actually types a query; clearing it drops back to that list.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setRepos(initialRepos);
      setLoading(false);
      setError(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    let alive = true;
    setLoading(true);
    setError(null);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/github/repos?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || `GitHub request failed (${res.status})`);
        setRepos(data.repos ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load repositories");
      } finally {
        if (alive) setLoading(false);
      }
    }, 350);
    return () => {
      alive = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, initialRepos]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter((r) => {
      if (visibility === "public" && r.private) return false;
      if (visibility === "private" && !r.private) return false;
      if (!q) return true;
      return r.fullName.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q);
    });
  }, [repos, query, visibility]);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-xl font-bold text-gate-text">Repositories</h1>
        <p className="mt-1 text-sm text-gate-muted">
          Install the quality gate onto a repository. Installing commits a small GitHub Actions
          workflow so every push and pull request is checked automatically.
        </p>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gate-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your repositories…"
            className="w-full rounded-xl border border-gate-border bg-gate-panel py-2.5 pl-9 pr-3 text-sm text-gate-text shadow-card outline-none placeholder:text-gate-muted focus:border-gate-accent"
          />
        </div>
        <div className="flex shrink-0 gap-1 rounded-xl border border-gate-border bg-gate-panel p-1 text-xs shadow-card">
          {(["all", "public", "private"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={`rounded-lg px-2.5 py-1.5 font-medium capitalize transition ${
                visibility === v
                  ? "bg-gate-accentSoft text-gate-accent"
                  : "text-gate-muted hover:text-gate-text"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-gate-fail/30 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error}
        </div>
      )}

      <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-gate-border bg-gate-panel shadow-card">
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">loading repositories…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">
            {query.trim() ? `No repositories match “${query.trim()}”.` : "No repositories found."}
          </p>
        ) : (
          <ul className="divide-y divide-gate-border">
            {visible.map((r) => {
              const isInstalled = installed.has(r.fullName.toLowerCase());
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
                >
                  {r.private ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-gate-accent" aria-hidden />
                  ) : (
                    <Globe2 className="h-3.5 w-3.5 shrink-0 text-gate-blue" aria-hidden />
                  )}
                  <span className="truncate font-mono text-xs font-medium text-gate-text">
                    {r.fullName}
                  </span>
                  {r.language && (
                    <span className="text-[11px] text-gate-muted">{r.language}</span>
                  )}
                  <div className="ml-auto shrink-0">
                    {isInstalled ? (
                      <Link
                        href={`/installed/${r.owner}/${r.name}`}
                        className="inline-flex items-center gap-1 rounded-full bg-gate-pass/10 px-2.5 py-1 text-[11px] font-medium text-gate-pass hover:bg-gate-pass/20"
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Installed
                      </Link>
                    ) : (
                      <Link
                        href={`/repos/${r.owner}/${r.name}/install`}
                        className="rounded-lg bg-gradient-to-r from-gate-accent to-gate-blue px-3 py-1 text-[11px] font-semibold text-white shadow-card hover:brightness-105"
                      >
                        Install
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
