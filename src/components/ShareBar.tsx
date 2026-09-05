"use client";

import { useState } from "react";
import { Check, Download, ExternalLink, Link2 } from "lucide-react";
import type { RunRecord } from "@/lib/types";

export function ShareBar({ run }: { run: RunRecord }) {
  const [copied, setCopied] = useState<"link" | "json" | null>(null);

  const shareLink = async () => {
    const url = `${window.location.origin}/runs/${run.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("link");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <a
        href={`/runs/${run.id}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-gate-border px-2.5 py-1 text-gate-muted transition hover:border-gate-accent/40 hover:text-gate-accent"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        open permalink
      </a>
      <button
        onClick={shareLink}
        className="inline-flex items-center gap-1.5 rounded-md border border-gate-border px-2.5 py-1 text-gate-muted transition hover:border-gate-accent/40 hover:text-gate-accent"
      >
        {copied === "link" ? (
          <Check className="h-3.5 w-3.5 text-gate-pass" aria-hidden />
        ) : (
          <Link2 className="h-3.5 w-3.5" aria-hidden />
        )}
        {copied === "link" ? "link copied" : "copy share link"}
      </button>
      <button
        onClick={downloadJson}
        className="inline-flex items-center gap-1.5 rounded-md border border-gate-border px-2.5 py-1 text-gate-muted transition hover:border-gate-accent/40 hover:text-gate-accent"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        download JSON
      </button>
    </div>
  );
}
