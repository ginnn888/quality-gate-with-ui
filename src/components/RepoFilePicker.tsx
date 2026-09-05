"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Search } from "lucide-react";
import type { GitHubRepo, RepoFileEntry } from "@/lib/github";

const MAX_FILES = 25;

/**
 * Step 2 — pick which files in the chosen repository the gate should check.
 * The API already filtered the tree down to analysable sources (no tests, no
 * build output), so this is a straight selection over that list.
 */
export function RepoFilePicker({
  repo,
  gitRef,
  onRefChange,
  selected,
  onSelectedChange,
  disabled,
}: {
  repo: GitHubRepo;
  gitRef: string | null;
  onRefChange: (ref: string) => void;
  selected: string[];
  onSelectedChange: (paths: string[]) => void;
  disabled?: boolean;
}) {
  const [files, setFiles] = useState<RepoFileEntry[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setFiles([]);

    const qs = new URLSearchParams({ owner: repo.owner, repo: repo.name });
    if (gitRef) qs.set("ref", gitRef);

    fetch(`/api/github/files?${qs}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `GitHub request failed (${res.status})`);
        return data;
      })
      .then((data) => {
        if (!alive) return;
        setFiles(data.files ?? []);
        setBranches(data.branches ?? []);
        setTruncated(!!data.truncated);
        if (!gitRef && data.ref) onRefChange(data.ref);
      })
      .catch((e) => alive && setError(e.message || "Could not read the repository"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.owner, repo.name, gitRef]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files;
  }, [files, filter]);

  const atLimit = selected.length >= MAX_FILES;

  function toggle(path: string) {
    if (selected.includes(path)) onSelectedChange(selected.filter((p) => p !== path));
    else if (!atLimit) onSelectedChange([...selected, path]);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gate-muted">
          <GitBranch className="h-3.5 w-3.5" aria-hidden />
          Branch
          <select
            value={gitRef ?? repo.defaultBranch}
            disabled={disabled || loading || branches.length === 0}
            onChange={(e) => {
              onSelectedChange([]);
              onRefChange(e.target.value);
            }}
            className="rounded-md border border-gate-border bg-gate-bg px-2 py-1 font-mono text-xs text-gate-text outline-none focus:border-gate-accent disabled:opacity-50"
          >
            {(branches.length ? branches : [gitRef ?? repo.defaultBranch]).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gate-muted"
            aria-hidden
          />
          <input
            type="search"
            value={filter}
            disabled={disabled || loading}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files by path…"
            className="w-full rounded-md border border-gate-border bg-gate-panel py-1.5 pl-8 pr-3 text-xs text-gate-text outline-none placeholder:text-gate-muted focus:border-gate-accent disabled:opacity-50"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error}
        </div>
      )}

      {truncated && (
        <p className="text-[11px] text-gate-warn">
          This repository is large — GitHub returned a partial file tree.
        </p>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-gate-border bg-gate-panel shadow-card">
        {loading ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">reading repository…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gate-muted">
            {files.length === 0
              ? "No .js/.ts source files found on this branch."
              : `No files match “${filter.trim()}”.`}
          </p>
        ) : (
          <ul className="divide-y divide-gate-border">
            {visible.map((f) => {
              const checked = selected.includes(f.path);
              return (
                <li key={f.path}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-gate-accent/5 ${
                      !checked && atLimit ? "opacity-40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || (!checked && atLimit)}
                      onChange={() => toggle(f.path)}
                      className="h-3.5 w-3.5 accent-gate-accent"
                    />
                    <span className="flex-1 truncate font-mono text-xs text-gate-text">
                      {f.path}
                    </span>
                    <span className="shrink-0 text-[11px] text-gate-muted">{f.size} B</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button
          type="button"
          disabled={disabled || loading || visible.length === 0}
          onClick={() => onSelectedChange(visible.slice(0, MAX_FILES).map((f) => f.path))}
          className="text-gate-accent hover:underline disabled:opacity-50"
        >
          select first {Math.min(MAX_FILES, visible.length) || MAX_FILES}
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelectedChange([])}
            className="text-gate-muted hover:text-gate-fail disabled:opacity-50"
          >
            clear selection
          </button>
        )}
        <span className={`ml-auto ${atLimit ? "text-gate-warn" : "text-gate-muted"}`}>
          {selected.length} / {MAX_FILES} selected
        </span>
      </div>
    </section>
  );
}
