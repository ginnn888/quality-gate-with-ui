import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getRun, ownsRun } from "@/lib/store";
import { ReportView } from "@/components/ReportView";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.login) redirect(`/signin?callbackUrl=/runs/${id}`);

  const run = await getRun(id);
  if (!run || !ownsRun(run, session.user.login)) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-gate-muted hover:text-gate-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        back to console
      </Link>
      <ReportView run={run} />
    </div>
  );
}
