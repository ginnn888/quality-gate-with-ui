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
