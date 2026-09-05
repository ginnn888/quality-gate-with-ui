"use client";

import { useState } from "react";
import { FolderGit2, Loader2, Upload } from "lucide-react";
import { Dropzone, type UploadFile } from "@/components/Dropzone";
import { ConfigPanel } from "@/components/ConfigPanel";
import { ReportView } from "@/components/ReportView";
import { RepoPicker } from "@/components/RepoPicker";
import { RepoFilePicker } from "@/components/RepoFilePicker";
import type { GitHubRepo } from "@/lib/github";
import type { RunConfig, RunRecord } from "@/lib/types";

type Phase = "idle" | "running" | "done" | "error";
type Mode = "repo" | "upload";

const DEFAULT_CONFIG: RunConfig = {
  globalCoverage: 80,
  perFileCoverage: {},
  enableSonar: true,
  enableAiReview: true,
};

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("repo");

  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [gitRef, setGitRef] = useState<string | null>(null);
  const [repoFiles, setRepoFiles] = useState<string[]>([]);

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [config, setConfig] = useState<RunConfig>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "running";
  const count = mode === "repo" ? repoFiles.length : files.length;
  const ready = count > 0 && (mode === "upload" || !!repo);

  function pickRepo(next: GitHubRepo | null) {
    setRepo(next);
    setGitRef(next?.defaultBranch ?? null);
    setRepoFiles([]);
  }

  async function submit() {
    if (!ready) return;
    setPhase("running");
    setError(null);
    setRun(null);

    try {
      // The gate itself is untouched — only the way the files reach it differs.
      const res =
        mode === "repo"
          ? await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                owner: repo!.owner,
                repo: repo!.name,
                ref: gitRef ?? repo!.defaultBranch,
                files: repoFiles,
                config,
              }),
            })
          : await fetch("/api/analyze", { method: "POST", body: uploadForm(files, config) });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setRun(data as RunRecord);
      setPhase("done");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setPhase("error");
    }
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-3xl">
        <div className="min-w-0 space-y-6">
          <section>
            <h1 className="text-xl font-bold text-gate-text">Run the Quality Gate on your code</h1>
            <p className="mt-1 text-sm text-gate-muted">
              A one-off run: pick a repository and files (or upload files), and the gate runs npm
              audit, an AI code review, a coverage gate and the SonarCloud check. To run the gate
              automatically on every push and pull request,{" "}
              <a href="/repos" className="text-gate-accent hover:underline">
                install it onto a repository
              </a>{" "}
              instead.
            </p>
          </section>

          <div className="flex gap-1 rounded-xl border border-gate-border bg-gate-panel p-1 text-xs shadow-card">
            {(
              [
                ["repo", "GitHub repository", FolderGit2],
                ["upload", "Upload files", Upload],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                disabled={busy}
                onClick={() => setMode(value)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition disabled:opacity-50 ${
                  mode === value
                    ? "bg-gate-accentSoft text-gate-accent"
                    : "text-gate-muted hover:text-gate-text"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {mode === "repo" ? (
            <>
              <Step n={1} title="Choose a repository">
                <RepoPicker selected={repo} onSelect={pickRepo} disabled={busy} />
              </Step>

              <Step n={2} title="Choose the files to check">
                {repo ? (
                  <RepoFilePicker
                    repo={repo}
                    gitRef={gitRef}
                    onRefChange={setGitRef}
                    selected={repoFiles}
                    onSelectedChange={setRepoFiles}
                    disabled={busy}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-gate-border bg-gate-panel px-4 py-6 text-center text-xs text-gate-muted">
                    Select a repository first.
                  </p>
                )}
              </Step>
            </>
          ) : (
            <Step n={1} title="Upload the files to check">
              <Dropzone files={files} onChange={setFiles} disabled={busy} />
            </Step>
          )}

          <Step n={mode === "repo" ? 3 : 2} title="Quality gate settings">
            <ConfigPanel config={config} onChange={setConfig} disabled={busy} />
          </Step>

          <button
            onClick={submit}
            disabled={busy || !ready}
            className="w-full rounded-xl bg-gradient-to-r from-gate-accent to-gate-blue px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "Running quality gate…"
              : `Run Quality Gate${count ? ` (${count} file${count > 1 ? "s" : ""})` : ""}`}
          </button>

          {error && (
            <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
              {error}
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 rounded-lg border border-gate-border bg-gate-panel p-4 text-sm text-gate-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gate-accent" aria-hidden />
              Executing pipeline steps…
            </div>
          )}
        </div>
      </div>

      {run && phase === "done" && (
        <div className="min-w-0">
          <ReportView run={run} />
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gate-accent/15 text-[11px] text-gate-accent">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function uploadForm(files: UploadFile[], config: RunConfig): FormData {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", new Blob([f.content], { type: "text/plain" }), f.name);
  }
  fd.append("config", JSON.stringify(config));
  return fd;
}
