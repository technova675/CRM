import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { accountWorkspace, AuthenticationRequiredError, AuthenticationUnavailableError, WorkspaceAccessError } from "./identity";
import { staffOwner } from "./staffIdentity";
import { portalOwner } from "./portalIdentity";
import { requestOrigin } from "./origin";
import { resilientFetch } from "./resilientFetch";

export async function authClient(req: Request) {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new AuthenticationUnavailableError();
  return createServerClient(url, key, {
    global: { fetch: resilientFetch },
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: requestOrigin(req).startsWith("https:") },
    cookies: { getAll: () => store.getAll(), setAll: (items) => { items.forEach(({ name, value, options }) => store.set(name, value, options)); } },
  });
}

export async function sessionIdentity(req: Request) {
  const client = await authClient(req);
  // getClaims verifies the signature and expiry; never authorize from getSession().user or client headers.
  const { data, error } = await client.auth.getClaims();
  if (error) {
    if (error.name === "AuthRetryableFetchError") throw new AuthenticationUnavailableError();
    throw new AuthenticationRequiredError();
  }
  const claims = data?.claims;
  if (!claims?.sub || claims.role !== "authenticated") throw new AuthenticationRequiredError();
  return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : "", workspace: accountWorkspace(claims.sub), portalOwner: portalOwner(claims.app_metadata), staffOwner: staffOwner(claims.app_metadata) };
}

export async function reportIdentity(req: Request) {
  const identity = await sessionIdentity(req);
  if (identity.portalOwner || identity.staffOwner) throw new WorkspaceAccessError();
  return identity;
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).host;
    return [new URL(req.url).host, req.headers.get("host"), req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()].includes(host);
  } catch { return false; }
}
