import { z } from "zod";
import { authClient, reportIdentity, sameOrigin } from "@/lib/auth/server";
import { AuthenticationRequiredError } from "@/lib/auth/identity";
import { dbError } from "@/lib/db";
import { requestOrigin } from "@/lib/auth/origin";

export async function GET(req: Request) {
  try {
    const user = await reportIdentity(req);
    return Response.json({ user: { id: user.userId, email: user.email } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return Response.json({ user: null }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    return dbError(error);
  }
}

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signin"), email: z.string().email().max(254), password: z.string().min(1).max(128) }),
  z.object({ action: z.literal("signup"), email: z.string().email().max(254), password: z.string().min(8).max(128) }),
  z.object({ action: z.literal("signout") }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ error: "Missing request body" }, { status: 400 });
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return Response.json({ error: "Request too large" }, { status: 413 }); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = input.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: "Enter a valid email and a password of 8–128 characters." }, { status: 400 });
    const client = await authClient(req);
    const data = parsed.data;
    if (data.action === "signout") {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) return Response.json({ error: "Could not sign out. Please retry." }, { status: 503 });
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (data.action === "signin") {
      const { error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });
      if (error) {
        if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) return Response.json({ error: "Could not reach the sign-in service. Please try again in a moment." }, { status: 503 });
        if (error.code === "email_not_confirmed") return Response.json({ error: "Confirm your email first, then sign in." }, { status: 401 });
        if (error.status === 429) return Response.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429 });
        if (error.code === "invalid_credentials") return Response.json({ error: "Incorrect email or password. If you haven't created an account yet, choose Create an account." }, { status: 401 });
        return Response.json({ error: "Could not sign in. Please try again." }, { status: 401 });
      }
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const origin = req.headers.get("origin") || requestOrigin(req);
    const { data: result, error } = await client.auth.signUp({ email: data.email, password: data.password, options: { emailRedirectTo: `${origin}/auth/callback` } });
    if (error) return Response.json({ error: error.code === "email_address_not_authorized" ? "Supabase email delivery is restricted for this address. Configure custom SMTP in your Supabase project, then try again." : error.code === "over_email_send_rate_limit" ? "Email delivery is temporarily rate limited. Wait before trying again." : "Could not create the account. Check the password requirements and Supabase email delivery settings." }, { status: error.status === 429 ? 429 : 400 });
    return Response.json({ ok: true, confirmationRequired: !result.session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request" }, { status: 400 });
    return dbError(error);
  }
}
