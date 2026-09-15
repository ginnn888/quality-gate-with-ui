// Root layout — wraps every route in the app (both /signin and everything
// under (app)/). Only global concerns live here: the <html>/<body> shell,
// the global stylesheet, and page metadata. Auth gating and the sidebar are
// NOT here — they're one level down, in (app)/layout.tsx — because /signin
// must render with neither.

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quality Gate Console",
  description:
    "Install the Automated Quality Gate onto your GitHub repositories and read the results from every pull request.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden font-sans text-gate-text antialiased">
        {children}
      </body>
    </html>
  );
}
