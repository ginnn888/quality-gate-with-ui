"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderGit2,
  Menu,
  PlayCircle,
  ShieldCheck,
  PackageCheck,
  History,
  X,
} from "lucide-react";

const NAV: { href: string; label: string; Icon: typeof PlayCircle; exact: boolean }[] = [
  { href: "/", label: "Run gate", Icon: PlayCircle, exact: true },
  { href: "/repos", label: "Repositories", Icon: FolderGit2, exact: false },
  { href: "/installed", label: "Installed", Icon: PackageCheck, exact: false },
  { href: "/history", label: "Run history", Icon: History, exact: false },
];

/**
 * Left navigation rail. `userMenu` is the server-rendered identity chip passed
 * down from the layout. On small screens the rail collapses to a top bar with a
 * slide-over drawer.
 */
export function Sidebar({ userMenu, authed }: { userMenu: React.ReactNode; authed: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const brand = (
    <Link
      href="/"
      className="flex items-center gap-2.5 text-sm font-semibold text-gate-text"
      onClick={() => setOpen(false)}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-gate-accent to-gate-blue text-white shadow-card">
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
      </span>
      Quality Gate
    </Link>
  );

  const nav = authed ? (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-gate-accentSoft text-gate-accent"
                : "text-gate-muted hover:bg-gate-accent/5 hover:text-gate-text"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  ) : null;

  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gate-border bg-gate-panel/80 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        {authed && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
            className="rounded-md border border-gate-border p-1.5 text-gate-muted"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-gate-text/20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col gap-6 border-r border-gate-border bg-gate-panel p-4 shadow-card">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gate-border p-1.5 text-gate-muted"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {nav}
            <div className="mt-auto border-t border-gate-border pt-4">{userMenu}</div>
          </div>
        </div>
      )}

      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-gate-border bg-gate-panel/60 p-4 lg:flex">
        {brand}
        {nav}
        <div className="mt-auto border-t border-gate-border pt-4">{userMenu}</div>
      </aside>
    </>
  );
}
