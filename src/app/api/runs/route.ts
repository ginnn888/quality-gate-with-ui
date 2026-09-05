import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listRuns } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.login) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }
  const runs = await listRuns(session.user.login);
  return NextResponse.json({ runs });
}
