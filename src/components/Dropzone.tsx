"use client";

import { useCallback, useRef, useState } from "react";
import { FileCode2, UploadCloud, X } from "lucide-react";
import { SAMPLES } from "@/lib/samples";

export interface UploadFile {
  name: string;
  content: string;
  size: number;
}

const ALLOWED = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;

export function Dropzone({
  files,
  onChange,
  disabled,
}: {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const incoming: UploadFile[] = [];
      for (const f of Array.from(list)) {
        if (!ALLOWED.test(f.name)) continue;
        const content = await f.text();
        incoming.push({ name: f.name.split(/[\\/]/).pop() || f.name, content, size: f.size });
      }
      const merged = [...files];
      for (const nf of incoming) {
        const idx = merged.findIndex((m) => m.name === nf.name);
        if (idx >= 0) merged[idx] = nf;
        else merged.push(nf);
      }
      onChange(merged);
    },
    [files, onChange],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-gate-accent bg-gate-accent/10"
            : "border-gate-border bg-gate-panel hover:border-gate-muted"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="flex justify-center text-gate-accent">
          <UploadCloud className="h-8 w-8" aria-hidden />
        </div>
        <p className="mt-2 text-sm text-gate-text">
          Drop source files here, or <span className="text-gate-accent">browse</span>
        </p>
        <p className="mt-1 text-xs text-gate-muted">
          .js .jsx .ts .tsx .mjs .cjs · up to 25 files · 512 KB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".js,.jsx,.ts,.tsx,.mjs,.cjs"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange(SAMPLES.map((s) => ({ name: s.name, content: s.content, size: s.content.length })))
          }
          className="text-gate-accent hover:underline disabled:opacity-50"
        >
          load sample files
        </button>
        {files.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-gate-muted hover:text-gate-fail disabled:opacity-50"
          >
            clear all
          </button>
        )}
      </div>

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-gate-border rounded-lg border border-gate-border bg-gate-panel">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileCode2 className="h-4 w-4 shrink-0 text-gate-muted" aria-hidden />
              <span className="flex-1 font-mono text-xs text-gate-text">src/{f.name}</span>
              <span className="text-xs text-gate-muted">{f.size} B</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((x) => x.name !== f.name))}
                className="text-gate-muted hover:text-gate-fail disabled:opacity-50"
                aria-label={`remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
