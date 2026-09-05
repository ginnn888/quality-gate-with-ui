import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRun, ownsRun } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const { id } = await params;
  const run = await getRun(id);
  if (!run || !ownsRun(run, session.user.login)) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
