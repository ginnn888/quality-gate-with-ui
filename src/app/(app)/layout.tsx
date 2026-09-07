import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

// Every page under (app) is behind the GitHub sign-in and gets the nav rail.
// The sign-in page lives outside this group, so it renders with no sidebar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.login) redirect("/signin");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar userMenu={<UserMenu />} />
      <main className="min-w-0 flex-1 px-5 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
