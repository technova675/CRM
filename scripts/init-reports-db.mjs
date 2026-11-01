import { supabaseRequest, SupabaseDbError } from "../lib/db.ts";

try {
  const keys = { report_companies: "id", report_files: "id", report_tables: "id", report_original_parts: "file_id", report_table_parts: "table_id", report_transfer_sessions: "id", report_transfer_parts: "session_id", report_legacy_claims: "workspace_id", report_r2_parts: "session_id", report_r2_objects: "file_id", report_r2_cleanup: "prefix", crm_libraries: "owner_id" };
  for (const [table, key] of Object.entries(keys)) {
    await supabaseRequest(table, { query: { select: key, limit: "0" } });
    console.log(`${table}: ready`);
  }
  console.log("Supabase report schema is reachable. Run npm run test:reports:integration for an upload/reload/delete verification.");
} catch (error) {
  console.error("Supabase report schema check failed:", error instanceof SupabaseDbError ? error.code : error.name);
  console.error("Apply all SQL files in supabase/migrations/ in filename order in your Supabase SQL Editor, then run this command again.");
  process.exitCode = 1;
}
