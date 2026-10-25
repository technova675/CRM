import { z } from "zod";
import { db, dbError } from "@/lib/db";
import { reportWorkspace, workspaceCookie } from "@/lib/reportWorkspace";
import { fileRowToMeta, gridToTable, MAX_PAYLOAD_BYTES, MAX_COLUMNS, MAX_ROWS, MAX_TABLES, type ReportFileRow, type ReportFileSummary } from "@/lib/domain/reportFiles";

const cell = z.union([z.string().max(100_000), z.number().finite(), z.null()]);
const uploadSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  originalBase64: z.string().max(MAX_PAYLOAD_BYTES).optional(),
  name: z.string().min(1).max(300),
  kind: z.enum(["excel", "csv", "pptx"]),
  size: z.number().int().min(0),
  uploadedBy: z.string().max(200).default(""),
  tables: z.array(z.object({
    name: z.string().min(1).max(300),
    columns: z.array(z.string().max(100_000)).min(1).max(MAX_COLUMNS),
    rows: z.array(z.array(cell).max(MAX_COLUMNS)).max(MAX_ROWS),
    rawRows: z.array(z.array(cell).max(MAX_COLUMNS)).max(MAX_ROWS).optional(),
    headerRow: z.number().int().min(0).max(MAX_ROWS - 1).nullable().optional(),
  })).min(1).max(MAX_TABLES),
});

// GET /api/reports/uploads?clientId=… → a client's uploaded files (newest first) with their table names and sizes.
export async function GET(req: Request) {
  const existing = reportWorkspace(req);
  const workspace = existing ?? crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const clientId = new URL(req.url).searchParams.get("clientId");
  try {
    const sql = await db();
    const files = (await sql`SELECT f.id, f.client_id, f.name, f.kind, f.size, f.uploaded_by, f.created_at, c.name AS company_name
      FROM report_files f LEFT JOIN report_companies c ON c.id = f.client_id
      WHERE f.workspace_id = ${workspace} AND (${clientId}::text IS NULL OR f.client_id = ${clientId}) ORDER BY f.created_at DESC`) as ReportFileRow[];
    const ids = files.map((f) => f.id);
    const tables = ids.length
      ? ((await sql`SELECT id, file_id, name, row_count, column_count FROM report_tables WHERE file_id = ANY(${ids}) ORDER BY position`) as { id: string; file_id: string; name: string; row_count: number; column_count: number }[])
      : [];
    const out: ReportFileSummary[] = files.map((f) => ({
      ...fileRowToMeta(f),
      tables: tables.filter((t) => t.file_id === f.id).map((t) => ({ id: t.id, name: t.name, rowCount: t.row_count, columnCount: t.column_count })),
    }));
    return Response.json({ files: out }, { headers: { "Cache-Control": "no-store", ...(!existing ? { "Set-Cookie": workspaceCookie(workspace, req) } : {}) } });
  } catch (e) {
    return dbError(e);
  }
}

// POST /api/reports/uploads → saves a parsed file (every sheet / slide table) in one transaction.
export async function POST(req: Request) {
  const workspace = reportWorkspace(req);
  if (!workspace) return Response.json({ error: "Open Reports first to initialize your upload workspace." }, { status: 401 });
  const body = await req.text();
  if (new TextEncoder().encode(body).length > MAX_PAYLOAD_BYTES) return Response.json({ error: "Upload exceeds the 4 MB request limit. Split the workbook; no data was saved." }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = uploadSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid upload", issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
  const u = parsed.data;
  const id = `rf_${crypto.randomUUID()}`;
  for (const t of u.tables) {
    if (t.rawRows) {
      if (t.headerRow != null && t.headerRow >= t.rawRows.length) return Response.json({ error: "Header row is outside the worksheet" }, { status: 400 });
      const mapped = gridToTable(t.name, t.rawRows, t.headerRow ?? null);
      if (mapped) { t.columns = mapped.columns; t.rows = mapped.rows; }
    }
  }
  try {
    const sql = await db();
    await sql.transaction([
      sql`WITH company AS (
        INSERT INTO report_companies (id, name, name_key) VALUES (${`rc_${crypto.randomUUID()}`}, ${u.companyName}, ${`${workspace}:${u.companyName.toLowerCase()}`})
        ON CONFLICT (name_key) DO UPDATE SET name = report_companies.name RETURNING id
      ) INSERT INTO report_files (id, client_id, name, kind, size, uploaded_by, original_base64, workspace_id)
        SELECT ${id}, company.id, ${u.name}, ${u.kind}, ${u.size}, ${u.uploadedBy}, ${u.originalBase64 ?? null}, ${workspace} FROM company`,
      ...u.tables.map((t, i) => sql`INSERT INTO report_tables (id, file_id, position, name, columns, rows, row_count, column_count, raw_rows, header_row)
        VALUES (${`rt_${crypto.randomUUID()}`}, ${id}, ${i}, ${t.name}, ${JSON.stringify(t.columns)}::jsonb, ${JSON.stringify(t.rows)}::jsonb, ${t.rows.length}, ${t.columns.length}, ${JSON.stringify(t.rawRows ?? null)}::jsonb, ${t.headerRow ?? null})`),
    ]);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}
