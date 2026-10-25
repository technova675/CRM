import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon Postgres over HTTP (works in serverless functions without a connection pool).
// Server-only: never import this from a client component.

export class DbNotConfiguredError extends Error {
  constructor() {
    super("Database not configured: set DATABASE_URL in .env.local");
  }
}

export const dbConfigured = () => !!process.env.DATABASE_URL;

let client: NeonQueryFunction<false, false> | null = null;
let schema: Promise<unknown> | null = null;

// Creates the report tables on first use, so a fresh Neon database needs no manual setup.
function ensureSchema(sql: NeonQueryFunction<false, false>) {
  return sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS report_companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS report_files (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS report_files_client_idx ON report_files (client_id, created_at DESC)`,
    sql`CREATE TABLE IF NOT EXISTS report_tables (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES report_files(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      columns JSONB NOT NULL,
      rows JSONB NOT NULL,
      row_count INTEGER NOT NULL,
      column_count INTEGER NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS report_tables_file_idx ON report_tables (file_id, position)`,
    sql`ALTER TABLE report_files ADD COLUMN IF NOT EXISTS original_base64 TEXT`,
    sql`ALTER TABLE report_files ADD COLUMN IF NOT EXISTS workspace_id TEXT`,
    sql`CREATE INDEX IF NOT EXISTS report_files_workspace_idx ON report_files (workspace_id, created_at DESC)`,
    sql`ALTER TABLE report_tables ADD COLUMN IF NOT EXISTS raw_rows JSONB`,
    sql`ALTER TABLE report_tables ADD COLUMN IF NOT EXISTS header_row INTEGER`,
  ]);
}

export async function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbNotConfiguredError();
  client ??= neon(url);
  // Retry schema creation on the next request if it failed (e.g. the database was asleep or unreachable).
  schema ??= ensureSchema(client).catch((e) => {
    schema = null;
    throw e;
  });
  await schema;
  return client;
}

// JSON error response for a failed DB call; hides connection details from the browser.
export function dbError(e: unknown) {
  if (e instanceof DbNotConfiguredError) return Response.json({ error: e.message, code: "no_db" }, { status: 503 });
  console.error("[db]", e);
  return Response.json({ error: "Database error. Check DATABASE_URL and that the Neon project is running." }, { status: 500 });
}
