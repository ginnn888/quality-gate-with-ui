"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, FileText } from "lucide-react";

export function MarkdownReport({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-gate-border bg-gate-panel shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gate-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gate-text">
          <FileText className="h-4 w-4 text-gate-muted" aria-hidden />
          PR comment (what GitHub would post)
        </h3>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded border border-gate-border px-2 py-1 text-xs text-gate-muted hover:text-gate-accent"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-gate-pass" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "copied" : "copy markdown"}
        </button>
      </div>
      <div className="md-report px-5 py-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
    </section>
  );
}
