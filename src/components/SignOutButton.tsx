"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="inline-flex items-center gap-1.5 rounded-md border border-gate-border px-2.5 py-1 text-xs text-gate-muted transition hover:border-gate-fail/50 hover:text-gate-fail"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      Sign out
    </button>
  );
}
