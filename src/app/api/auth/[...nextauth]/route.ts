// Catch-all for every Auth.js endpoint — /api/auth/signin, /callback/github,
// /session, /signout, etc. Auth.js generates all of them from the single
// config in lib/auth.ts; this file just re-exports its request handlers, it
// has no logic of its own.
import { handlers } from "@/lib/auth";

export const runtime = "nodejs";

export const { GET, POST } = handlers;
