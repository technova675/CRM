import {TenantQuotaError} from "./domain/tenant.ts";
// Server-only Supabase Data API access. Never import into client components.
import { AuthenticationRequiredError, AuthenticationUnavailableError, WorkspaceAccessError } from "./auth/identity.ts";
import { ReportStorageError } from "./reportR2.ts";
import { resilientFetch } from "./auth/resilientFetch.ts";
export class DbNotConfiguredError extends Error {
  constructor() {
    super("Configure SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY on the server.");
  }
}

export class SupabaseDbError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number) {
    super(`Supabase request failed (${code})`);
    this.code = code;
    this.status = status;
  }
}

export const dbConfigured = () => !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));

type RequestOptions = { query?: Record<string, string>; method?: "GET" | "POST" | "DELETE"; body?: unknown; prefer?: string; timeoutMs?: number };

export async function supabaseRequest<T>(resource: string, options: RequestOptions = {}): Promise<T> {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new DbNotConfiguredError();
  if (!/^[a-z_][a-z0-9_]*(?:\/[a-z_][a-z0-9_]*)?$/.test(resource)) throw new Error("Invalid database resource");
  let url: URL;
  try {
    url = new URL(`/rest/v1/${resource}`, base);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error();
  } catch {
    throw new SupabaseDbError("invalid_configuration", 503);
  }
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);
  const headers: Record<string, string> = { apikey: key, Accept: "application/json", "Accept-Profile": "public", "Content-Profile": "public" };
  // Legacy service_role keys are JWTs; newer sb_secret_ keys use only the apikey header.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;
  let response: Response;
  try {
    response = await resilientFetch(url, {
      method: options.method ?? "GET", headers, cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new SupabaseDbError("connection_failed", 503);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new SupabaseDbError(typeof error.code === "string" ? error.code : `http_${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function dbError(error: unknown) {
  if(error instanceof WorkspaceAccessError)return Response.json({error:error.message,code:"workspace_access_denied"},{status:403,headers:{"Cache-Control":"private, no-store"}});
  if(error instanceof TenantQuotaError)return Response.json({error:error.message,code:"tenant_quota",resource:error.key,limit:error.limit,plan:error.plan},{status:429,headers:{"Cache-Control":"private, no-store"}});
  if (error instanceof ReportStorageError) return Response.json({ error: error.message, code: "storage_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: error.message, code: "auth_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof AuthenticationUnavailableError) return Response.json({ error: error.message, code: "auth_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof DbNotConfiguredError) return Response.json({ error: error.message, code: "no_db" }, { status: 503 });
  if (error instanceof SupabaseDbError) {
    console.error("[db] Supabase", { code: error.code, status: error.status });
    if (error.code === "22023") return Response.json({ error: "The upload is incomplete, expired or contains invalid chunk data. Please retry the upload.", code: "upload_invalid" }, { status: 400 });
    if (error.code === "42501") return Response.json({ error: "These reports or upload sessions are not available to this account.", code: "access_denied" }, { status: 403 });
    if (["PGRST205", "PGRST202", "42P01", "42883", "PGRST200"].includes(error.code)) {
      return Response.json({ error: "Supabase application schema is not ready. Apply the SQL files in supabase/migrations in order in the Supabase SQL Editor, then refresh.", code: "schema_missing" }, { status: 503 });
    }
    if (error.status === 401 || error.status === 403) return Response.json({ error: "Supabase denied server access. Check the server service key and apply the reporting migration.", code: "db_auth" }, { status: 503 });
    if (error.status === 503) return Response.json({ error: "Could not reach Supabase. Check the project URL, project status and network connection.", code: "db_unavailable" }, { status: 503 });
  } else console.error("[db] Unexpected database failure");
  return Response.json({ error: "Supabase could not complete this request. Please try again.", code: "db_error" }, { status: 500 });
}
