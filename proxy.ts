import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/auth/origin";
import { resilientFetch } from "@/lib/auth/resilientFetch";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/auth/") || path === "/api/auth" || path === "/api/outreach/webhook") return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Supabase authentication is not configured.", { status: 503 });
  let response = NextResponse.next({ request: req });
  const client = createServerClient(url, key, {
    global: { fetch: resilientFetch },
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: requestOrigin(req).startsWith("https:") },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    const { data, error } = await client.auth.getClaims();
    if (error?.name === "AuthRetryableFetchError") return NextResponse.json({ error: "Authentication is temporarily unavailable. Please retry." }, { status: 503 });
    if (error || !data?.claims?.sub || data.claims.role !== "authenticated") {
      const denied = path.startsWith("/api/")
        ? NextResponse.json({ error: "Sign in to continue.", code: "auth_required" }, { status: 401 })
        : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path + req.nextUrl.search)}`, requestOrigin(req)));
      response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
      denied.headers.set("Cache-Control", "private, no-store");
      return denied;
    }
  } catch { return NextResponse.json({ error: "Could not verify your session. Please retry." }, { status: 503 }); }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)"] };
