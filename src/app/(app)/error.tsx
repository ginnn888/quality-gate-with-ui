"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

// Shared error boundary for every page under (app). Server-component data
// fetches (GitHub reads) that throw land here instead of a white screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-3 rounded-xl border border-gate-fail/40 bg-gate-fail/10 p-4 text-sm text-gate-fail">
      <p className="font-semibold">Something went wrong loading this page.</p>
      <p className="text-xs text-gate-fail/90">{error.message || "Unknown error."}</p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gate-fail/40 px-3 py-1.5 text-xs font-medium transition hover:bg-gate-fail/10"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
        Try again
      </button>
    </div>
  );
}
