import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { resilientFetch } from "../lib/auth/resilientFetch.ts";

export async function createTestAccount() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is required for auth verification.");
  const admin = createClient(url, key, { global: { fetch: resilientFetch }, auth: { persistSession: false, autoRefreshToken: false } });
  const email = `report-verification-${crypto.randomUUID()}@example.com`;
  const password = randomBytes(32).toString("base64url");
  // Confirmed disposable account; no email is sent and credentials are never logged or saved.
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create verification account (${error?.code ?? "unknown"}).`);
  return { id: data.user.id, email, password, async remove() {
    const result = await admin.auth.admin.deleteUser(data.user.id);
    if (result.error) throw new Error(`Could not remove verification account (${result.error.code ?? "unknown"}).`);
  } };
}

export class TestBrowser {
  constructor(base = process.env.REPORTS_TEST_URL ?? "http://localhost:3011") { this.base = base; this.cookies = new Map(); }
  async request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("cookie", [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    if (options.method && options.method !== "GET" && !headers.has("origin")) headers.set("origin", this.base);
    const response = await fetch(this.base + path, { ...options, headers, redirect: "manual", signal: AbortSignal.timeout(45_000) });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const cookie of this.lastSetCookies) {
      const pair = cookie.split(";")[0]; const equals = pair.indexOf("=");
      const name = pair.slice(0, equals); const value = pair.slice(equals + 1);
      if (!value || /max-age=0(?:;|$)/i.test(cookie)) this.cookies.delete(name); else this.cookies.set(name, value);
    }
    return response;
  }
  async signIn(account) {
    const response = await this.request("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signin", email: account.email, password: account.password }) });
    if (response.status !== 200) throw new Error(`Verification sign-in failed (HTTP ${response.status}).`);
  }
}
