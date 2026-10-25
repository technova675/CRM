import { db, dbError } from "@/lib/db";
import { reportWorkspace } from "@/lib/reportWorkspace";
import { fileRowToMeta, type Cell, type ReportFileDetail, type ReportFileRow } from "@/lib/domain/reportFiles";

// GET /api/reports/uploads/:id → one uploaded file with all of its tables.
export async function GET(_req: Request, ctx: RouteContext<"/api/reports/uploads/[id]">) {
  const workspace = reportWorkspace(_req);
  if (!workspace) return Response.json({ error: "Report not found" }, { status: 404 });
  const { id } = await ctx.params;
  try {
    const sql = await db();
    const [file] = (await sql`SELECT f.id, f.client_id, f.name, f.kind, f.size, f.uploaded_by, f.created_at, c.name AS company_name
      FROM report_files f LEFT JOIN report_companies c ON c.id = f.client_id WHERE f.id = ${id} AND f.workspace_id = ${workspace}`) as ReportFileRow[];
    if (!file) return Response.json({ error: "Report not found" }, { status: 404 });
    const tables = (await sql`SELECT id, name, columns, rows, raw_rows AS "rawRows", header_row AS "headerRow" FROM report_tables WHERE file_id = ${id} ORDER BY position`) as { id: string; name: string; columns: string[]; rows: Cell[][] }[];
    const out: ReportFileDetail = { ...fileRowToMeta(file), tables };
    return Response.json({ file: out });
  } catch (e) {
    return dbError(e);
  }
}

// DELETE /api/reports/uploads/:id → removes the file and (by cascade) its tables.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reports/uploads/[id]">) {
  const workspace = reportWorkspace(_req);
  if (!workspace) return Response.json({ error: "Report not found" }, { status: 404 });
  const { id } = await ctx.params;
  try {
    const sql = await db();
    const gone = await sql`DELETE FROM report_files WHERE id = ${id} AND workspace_id = ${workspace} RETURNING id`;
    if (!gone.length) return Response.json({ error: "Report not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
