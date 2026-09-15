// A plain HTML <form> posting to the signOutAction server action, not an
// onClick handler — works even before client JS has hydrated, and matches
// how Sign in is done (see GitHubSignInButton's comment for why sign-in
// itself can't use the same server-action approach).
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/authActions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-md border border-gate-border px-2.5 py-1 text-xs text-gate-muted transition hover:border-gate-fail/50 hover:text-gate-fail"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Sign out
      </button>
    </form>
  );
}
