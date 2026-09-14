"use client";

// The client island for one installed repo. `initial` comes from this route's
// server-component page.tsx (a single getInstallationDetail() read). Every
// mutation below (save / secrets / protection / clear runs / uninstall) hits
// an API route, then calls router.refresh() — the server component re-fetches
// and hands down a fresh `initial`, which the effect below re-syncs into local
// state. There is no separate client-side GET; the server read is the only one.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { CoverageConfigForm } from "@/components/CoverageConfigForm";
import { PrGateResults } from "@/components/PrGateResults";
import type { InstallationDetail as InstallationDetailData } from "@/lib/installations";
import type { CoverageConfig, WorkflowTriggers } from "@/lib/types";

const GEMINI_KEYS_URL = "https://aistudio.google.com/app/apikey";
const SONAR_URL = "https://sonarcloud.io";
const SONAR_TOKEN_URL = "https://sonarcloud.io/account/security";
const SONAR_AUTO_ANALYSIS_DOC =
  "https://docs.sonarsource.com/sonarqube-cloud/enriching/automatic-analysis/";

export function InstallationDetail({
  owner,
  repo,
  initial,
}: {
  owner: string;
  repo: string;
  initial: InstallationDetailData;
}) {
  const router = useRouter();
  const base = `/api/installations/${owner}/${repo}`;

  const [data, setData] = useState(initial);
  const [coverage, setCoverage] = useState<CoverageConfig>(initial.record.coverage);
  const [triggers, setTriggers] = useState<WorkflowTriggers>(initial.record.triggers);
  const [geminiKey, setGeminiKey] = useState("");
  const [sonarToken, setSonarToken] = useState("");

  const [busy, setBusy] = useState<
    null | "save" | "secrets" | "protection" | "clear-runs" | "uninstall"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // A successful mutation calls router.refresh(); the server component re-runs
  // and hands down a fresh `initial`. Re-sync local state from it.
  useEffect(() => {
    setData(initial);
    setCoverage(initial.record.coverage);
    setTriggers(initial.record.triggers);
  }, [initial]);

  async function saveConfig() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverage, triggers }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Save failed (${res.status})`);
      setNotice(d.warnings?.length ? d.warnings.join(" ") : "Saved — committed to the repository.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveSecrets() {
    if (!geminiKey.trim() && !sonarToken.trim()) return;
    setBusy("secrets");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: geminiKey.trim() || undefined,
          sonarToken: sonarToken.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Save failed (${res.status})`);
      setGeminiKey("");
      setSonarToken("");
      setNotice(d.warnings?.length ? d.warnings.join(" ") : "Secrets updated.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function clearRuns() {
    setBusy("clear-runs");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${base}/runs`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Clear failed (${res.status})`);
      const parts = [`Deleted ${d.deleted} run${d.deleted === 1 ? "" : "s"}`];
      if (d.skipped) parts.push(`${d.skipped} still running, kept`);
      if (d.failed) parts.push(`${d.failed} could not be deleted`);
      setNotice(parts.join(" · ") + ".");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear run history");
    } finally {
      setBusy(null);
      setConfirmClear(false);
    }
  }

  async function toggleProtection(enable: boolean) {
    setBusy("protection");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${base}/protection`, { method: enable ? "PUT" : "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
      setNotice(
        enable
          ? `The "${d.context}" check is now required on ${record.defaultBranch}.`
          : `The "${d.context}" check is no longer required.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change branch protection");
    } finally {
      setBusy(null);
    }
  }

  async function uninstall() {
    setBusy("uninstall");
    setError(null);
    try {
      const res = await fetch(base, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Uninstall failed (${res.status})`);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uninstall failed");
      setBusy(null);
      setConfirmUninstall(false);
    }
  }

  const { record, runs, pulls, protection } = data;

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        installed
      </Link>

      <section className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-gate-text">
          <span className="font-mono">{owner}/{repo}</span>
        </h1>
        {record.htmlUrl && (
          <a
            href={record.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
          >
            open on GitHub <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </section>

      {!record.hasConfig && (
        <div className="flex items-center gap-3 rounded-lg border border-gate-warn/40 bg-gate-warn/10 p-3 text-sm text-gate-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="font-mono">config_cov.json</span> is missing on{" "}
            <span className="font-mono">{record.defaultBranch}</span>. Click{" "}
            <strong>Save changes</strong> to re-commit it.
          </span>
        </div>
      )}

      {/* config */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gate-text">Configuration</h2>
        <CoverageConfigForm
          coverage={coverage}
          triggers={triggers}
          onCoverageChange={(c) => {
            setCoverage(c);
            setNotice(null);
          }}
          onTriggersChange={(t) => {
            setTriggers(t);
            setNotice(null);
          }}
          branchOptions={triggers.branches}
          disabled={busy !== null}
        />
        <button
          onClick={saveConfig}
          disabled={busy !== null || triggers.branches.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gate-accent to-gate-blue px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:brightness-105 disabled:opacity-40"
        >
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save changes
        </button>
        <p className="text-[11px] text-gate-muted">
          Saving re-commits <span className="font-mono">config_cov.json</span> and{" "}
          <span className="font-mono">.github/workflows/quality-gate.yml</span> — use it to pull
          in console updates too. The gate itself is always fetched fresh from{" "}
          <span className="font-mono">NonnaritRammaneekultawat-6609650459/test-github-marketplace</span> at
          run time.
        </p>
      </div>

      {/* secrets */}
      <div className="space-y-3 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <KeyRound className="h-4 w-4 text-gate-muted" aria-hidden />
          Repository secrets
        </h2>

        {record.secrets.readable ? (
          <ul className="space-y-1 text-xs">
            <SecretRow name="GEMINI_API_KEY" present={record.secrets.geminiApiKey} required />
            <SecretRow name="SONAR_TOKEN" present={record.secrets.sonarToken} />
          </ul>
        ) : (
          <p className="text-[11px] text-gate-muted">
            Can&apos;t read this repo&apos;s secret list (needs admin). You can still set new
            values below.
          </p>
        )}

        {/* how to get each token */}
        <div className="space-y-2 rounded-lg bg-gate-accentSoft/30 p-3 text-[11px] text-gate-muted">
          <p
            className={
              record.secrets.readable && !record.secrets.geminiApiKey ? "text-gate-fail" : undefined
            }
          >
            <span className="font-mono text-gate-text">GEMINI_API_KEY</span> — required. Create a
            free key at{" "}
            <a
              href={GEMINI_KEYS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
            >
              Google AI Studio <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            , paste it below, then <span className="text-gate-text">Update secrets</span>.
          </p>

          <details className="group">
            <summary className="cursor-pointer select-none text-gate-text hover:text-gate-accent">
              How to get a <span className="font-mono">SONAR_TOKEN</span> (optional)
            </summary>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                Sign in at{" "}
                <a
                  href={SONAR_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                >
                  sonarcloud.io <ExternalLink className="h-3 w-3" aria-hidden />
                </a>{" "}
                with GitHub and create an <strong>organization</strong>.
              </li>
              <li>
                Add a <strong>project</strong> for <span className="font-mono">{repo}</span>, then
                turn <strong>off Automatic Analysis</strong> for it (Administration → Analysis
                Method —{" "}
                <a
                  href={SONAR_AUTO_ANALYSIS_DOC}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                >
                  docs <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                ) so it doesn&apos;t clash with the CI scan.
              </li>
              <li>
                Generate a <strong>token</strong> at{" "}
                <a
                  href={SONAR_TOKEN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-gate-accent hover:underline"
                >
                  Account → Security <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                , paste it below.
              </li>
              <li>
                If <span className="font-mono">sonar-project.properties</span> isn&apos;t in the
                repo yet, the token alone won&apos;t enable SonarCloud — reinstall from{" "}
                <span className="font-mono">/repos</span> with the SonarCloud organization filled
                in.
              </li>
            </ol>
          </details>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            autoComplete="off"
            value={geminiKey}
            disabled={busy !== null}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="New GEMINI_API_KEY"
            className="rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
          />
          <input
            type="password"
            autoComplete="off"
            value={sonarToken}
            disabled={busy !== null}
            onChange={(e) => setSonarToken(e.target.value)}
            placeholder="New SONAR_TOKEN (optional)"
            className="rounded-lg border border-gate-border bg-gate-panel px-3 py-2 text-sm text-gate-text outline-none focus:border-gate-accent"
          />
        </div>
        <button
          onClick={saveSecrets}
          disabled={busy !== null || (!geminiKey.trim() && !sonarToken.trim())}
          className="inline-flex items-center gap-2 rounded-lg border border-gate-border px-3 py-1.5 text-xs font-medium text-gate-muted transition hover:text-gate-accent disabled:opacity-40"
        >
          {busy === "secrets" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
          )}
          Update secrets
        </button>
      </div>

      {notice && (
        <div className="rounded-lg border border-gate-border bg-gate-accentSoft/40 p-3 text-xs text-gate-muted">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3 text-sm text-gate-fail">
          {error}
        </div>
      )}

      {/* pull request results */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gate-text">Pull requests</h2>
        <PrGateResults pulls={pulls} />
      </div>

      {/* recent runs */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-semibold text-gate-text">Recent gate runs</h2>
          {runs.length > 0 &&
            (confirmClear ? (
              <span className="flex items-center gap-2 text-xs text-gate-fail">
                Delete these {runs.length} run{runs.length === 1 ? "" : "s"} and their logs?
                <button
                  onClick={clearRuns}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded bg-gate-fail px-2 py-1 font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                >
                  {busy === "clear-runs" ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-3 w-3" aria-hidden />
                  )}
                  Yes, clear
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  disabled={busy !== null}
                  className="text-gate-muted hover:text-gate-text disabled:opacity-50"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded border border-gate-border px-2 py-1 text-[11px] font-medium text-gate-muted transition hover:text-gate-fail disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
                Clear history
              </button>
            ))}
        </div>
        <p className="text-[11px] text-gate-muted">
          Runs live on GitHub — clearing deletes the workflow runs and their logs there. Runs still
          in progress are kept.
        </p>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gate-border bg-gate-panel px-4 py-6 text-center text-xs text-gate-muted">
            No workflow runs yet — push a commit or open a pull request on a watched branch.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gate-border bg-gate-panel shadow-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gate-border text-gate-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Run</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gate-border">
                {runs.map((r) => {
                  const c = r.conclusion ?? r.status;
                  const cls =
                    c === "success"
                      ? "text-gate-pass"
                      : c === "failure"
                        ? "text-gate-fail"
                        : "text-gate-muted";
                  return (
                    <tr key={r.id} className="hover:bg-gate-accent/5">
                      <td className="px-3 py-2">
                        <a
                          href={r.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-gate-accent hover:underline"
                        >
                          #{r.runNumber}
                        </a>
                      </td>
                      <td className={`px-3 py-2 font-medium ${cls}`}>{c}</td>
                      <td className="px-3 py-2 text-gate-muted">{r.event}</td>
                      <td className="px-3 py-2 font-mono text-gate-muted">
                        {r.headBranch ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gate-muted">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* branch protection */}
      <div className="space-y-2 rounded-xl border border-gate-border bg-gate-panel p-4 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          {protection.required ? (
            <Lock className="h-4 w-4 text-gate-pass" aria-hidden />
          ) : (
            <LockOpen className="h-4 w-4 text-gate-muted" aria-hidden />
          )}
          Merge protection
        </h2>

        {!protection.readable ? (
          <p className="text-[11px] text-gate-muted">
            Can&apos;t read branch protection for{" "}
            <span className="font-mono">{record.defaultBranch}</span> (needs admin on the repo).
            Add a rule requiring the{" "}
            <span className="font-mono">{protection.context}</span> check under Settings → Branches
            on GitHub.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-gate-muted">
              {protection.required ? (
                <>
                  <span className="font-mono">{protection.context}</span> must pass before a PR can
                  merge into <span className="font-mono">{record.defaultBranch}</span>.
                </>
              ) : (
                <>
                  Merges into <span className="font-mono">{record.defaultBranch}</span> are{" "}
                  <strong>not</strong> blocked when the gate is red.
                </>
              )}
            </p>
            <button
              onClick={() => toggleProtection(!protection.required)}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-gate-border px-3 py-1.5 text-xs font-medium text-gate-muted transition hover:text-gate-accent disabled:opacity-40"
            >
              {busy === "protection" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : protection.required ? (
                <LockOpen className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Lock className="h-3.5 w-3.5" aria-hidden />
              )}
              {protection.required ? "Stop requiring the check" : "Require the check before merge"}
            </button>
          </>
        )}
      </div>

      <div className="border-t border-gate-border pt-4">
        {confirmUninstall ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gate-fail/40 bg-gate-fail/10 p-3">
            <span className="text-sm text-gate-fail">
              Remove <span className="font-mono">quality-gate.yml</span> and{" "}
              <span className="font-mono">config_cov.json</span> from{" "}
              <span className="font-mono">{owner}/{repo}</span>?
            </span>
            <button
              onClick={uninstall}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-gate-fail px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              {busy === "uninstall" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Yes, uninstall
            </button>
            <button
              onClick={() => setConfirmUninstall(false)}
              disabled={busy !== null}
              className="text-xs text-gate-muted hover:text-gate-text disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmUninstall(true)}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-gate-fail/40 px-4 py-2 text-sm font-medium text-gate-fail transition hover:bg-gate-fail/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Uninstall from this repository
          </button>
        )}
      </div>
    </div>
  );
}

function SecretRow({
  name,
  present,
  required,
}: {
  name: string;
  present: boolean;
  required?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      {present ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-gate-pass" aria-hidden />
      ) : (
        <XCircle className={`h-3.5 w-3.5 ${required ? "text-gate-fail" : "text-gate-muted"}`} aria-hidden />
      )}
      <span className="font-mono text-gate-text">{name}</span>
      <span className="text-gate-muted">
        {present ? "set" : required ? "missing — the gate cannot run" : "not set"}
      </span>
    </li>
  );
}
