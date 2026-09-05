import { auth } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

/** Header identity chip — who you are connected as, and the way back out. */
export async function UserMenu() {
  const session = await auth();
  if (!session?.user?.login) return null;

  return (
    <div className="flex items-center gap-3">
      <a
        href={`https://github.com/${session.user.login}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-xs text-gate-muted hover:text-gate-accent"
      >
        {session.user.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full border border-gate-border"
          />
        )}
        <span className="font-medium text-gate-text">{session.user.login}</span>
      </a>
      <SignOutButton />
    </div>
  );
}
