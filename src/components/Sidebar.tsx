"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderGit2, Menu, PackageCheck, ShieldCheck, X } from "lucide-react";

const NAV: { href: string; label: string; Icon: typeof FolderGit2; exact: boolean }[] = [
  { href: "/", label: "Installed", Icon: PackageCheck, exact: true },
  { href: "/repos", label: "Repositories", Icon: FolderGit2, exact: false },
];

/**
 * Left navigation rail. `userMenu` is the server-rendered identity chip passed
 * down from the (app) layout. On small screens the rail collapses to a top bar
 * with a slide-over drawer.
 */
export function Sidebar({ userMenu }: { userMenu: React.ReactNode }) {
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
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-gate-accent via-gate-blue to-gate-green text-white shadow-glow">
        <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
      </span>
      Quality Gate
    </Link>
  );

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? "border-gate-accent bg-gate-accentSoft text-gate-accent"
                : "border-transparent text-gate-muted hover:bg-gate-accent/5 hover:text-gate-text"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gate-border bg-gate-panel/80 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="rounded-md border border-gate-border p-1.5 text-gate-muted"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
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
