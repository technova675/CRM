import { db } from "../lib/db.ts";

try {
  const sql = await db();
  const tables = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('report_companies', 'report_files', 'report_tables') ORDER BY table_name");
  console.log("Report schema ready:", tables.map((t) => t.table_name).join(", "));
} catch (e) {
  console.error("Report schema initialization failed:", e.constructor.name, e.code ?? "Check the database connection.");
  process.exitCode = 1;
}
