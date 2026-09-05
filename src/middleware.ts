import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Everything behind the front door. An unauthenticated browser request is sent
// to /signin (with a callback back to where it was headed); an unauthenticated
// API request gets a 401 instead of an HTML redirect.
const PUBLIC = [/^\/signin(?:\/|$)/, /^\/api\/auth(?:\/|$)/];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (req.auth) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in with GitHub required" }, { status: 401 });
  }

  const url = new URL("/signin", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
