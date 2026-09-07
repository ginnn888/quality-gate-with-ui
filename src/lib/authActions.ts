"use server";

import { signOut } from "@/lib/auth";

/**
 * Server-side sign-out. The `next-auth/react` client `signOut()` depends on a
 * reachable base URL + CSRF round-trip and silently no-ops in some deploys;
 * a server action calling the Auth.js `signOut` is reliable.
 */
export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
