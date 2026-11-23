import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/auth/server";
import { safeReturnPath } from "@/lib/auth/identity";
import { requestOrigin } from "@/lib/auth/origin";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const next = safeReturnPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  try {
    const client = await authClient(req);
    // ?code= links work only in the browser that asked for them; token_hash links also work when the email is opened on another device.
    const { error } = code
      ? await client.auth.exchangeCodeForSession(code)
      : tokenHash && type && OTP_TYPES.has(type)
        ? await client.auth.verifyOtp({ type, token_hash: tokenHash })
        : { error: new Error("missing") };
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } catch { /* Show an actionable sign-in message instead of exposing provider details. */ }
  const reason = next === "/reset-password" || type === "recovery" ? "reset=expired" : "confirmation=retry";
  return NextResponse.redirect(new URL(`/login?${reason}`, origin));
}
