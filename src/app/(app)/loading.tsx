import { Loader2 } from "lucide-react";

// Shown while a server component under (app) is fetching (GitHub reads on first
// paint / navigation). Route-level, so it covers every page in the group.
export default function AppLoading() {
  return (
    <p className="flex items-center gap-2 text-sm text-gate-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      loading…
    </p>
  );
}
