import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quality Gate Console",
  description:
    "Install the Automated Quality Gate onto your GitHub repositories, or run it manually on a set of files.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const authed = !!session?.user?.login;

  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden font-sans text-gate-text antialiased">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar authed={authed} userMenu={<UserMenu />} />
          <main className="min-w-0 flex-1 px-5 py-8 lg:px-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
