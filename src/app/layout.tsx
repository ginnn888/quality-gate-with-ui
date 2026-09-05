import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quality Gate Console",
  description:
    "Sign in with GitHub, pick a repository, run the Automated Quality Gate and read the report.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden font-sans text-gate-text antialiased">
        <header className="sticky top-0 z-10 border-b border-gate-border bg-gate-panel/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
            <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-gate-text">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-gate-accent to-gate-blue text-white shadow-card">
                <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
              </span>
              Quality Gate Console
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
