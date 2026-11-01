import { Agent } from "undici";
import { supabaseLookup } from "./networkLookup.ts";

// The URL and TLS server name are unchanged. Only DNS address ordering changes.
const dispatcher = new Agent({ connect: { lookup: supabaseLookup, timeout: 8_000 }, autoSelectFamily: true });
const ATTEMPTS = 4;
const ATTEMPT_TIMEOUT_MS = 8_000;

export async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const isSupabase = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL].some((value) => {
    try { return !!value && new URL(value).origin === url.origin; } catch { return false; }
  });
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  // A failed response can still have committed a write. Retry reads and password
  // verification only; callers manage idempotent chunk retries themselves.
  const retryable = ["GET", "HEAD"].includes(method) || (method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password");
  const attempts = retryable ? ATTEMPTS : 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const options: RequestInit & { dispatcher?: Agent } = { ...init, signal, ...(isSupabase ? { dispatcher } : {}) };
      return await fetch(input, options);
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted) throw error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}
