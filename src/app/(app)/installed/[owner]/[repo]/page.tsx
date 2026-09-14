import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getInstallationDetail } from "@/lib/installations";
import { InstallationDetail } from "./InstallationDetail";

export const dynamic = "force-dynamic";

export default async function InstallationDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/signin");

  const detail = await getInstallationDetail(session.accessToken, owner, repo);
  if (!detail) notFound();

  return <InstallationDetail owner={owner} repo={repo} initial={detail} />;
}
