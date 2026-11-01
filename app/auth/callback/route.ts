import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth/server";
import { safeReturnPath } from "@/lib/auth/identity";
import { requestOrigin } from "@/lib/auth/origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const client = await authClient(req);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeReturnPath(url.searchParams.get("next")), origin));
    } catch { /* Show an actionable sign-in message instead of exposing provider details. */ }
  }
  return NextResponse.redirect(new URL("/login?confirmation=retry", origin));
}
