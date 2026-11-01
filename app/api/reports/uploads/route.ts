import { z } from "zod";
import { dbError } from "@/lib/db";
import { listReportFiles, saveReportFile } from "@/lib/reportsRepository";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/domain/reportTransfer";
import { gridToTable, MAX_PAYLOAD_BYTES, MAX_COLUMNS, MAX_ROWS, MAX_TABLES } from "@/lib/domain/reportFiles";
import { r2UploadsEnabled } from "@/lib/reportR2";

const cell = z.union([z.string().max(100_000), z.number().finite(), z.null()]);
const uploadSchema = z.object({
  companyName: z.string().trim().min(1).max(300),
  originalBase64: z.string().max(MAX_PAYLOAD_BYTES).optional(),
  name: z.string().min(1).max(300),
  kind: z.enum(["excel", "csv", "pptx", "pdf"]),
  size: z.number().int().min(0).max(MAX_UPLOAD_FILE_BYTES),
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
  try {
    const { workspace } = await reportIdentity(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    const out = await listReportFiles(workspace, clientId);
    return Response.json({ files: out }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return dbError(e);
  }
}

// POST /api/reports/uploads → saves a parsed file (every sheet / slide table) in one transaction.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const identity = await reportIdentity(req);
    if (r2UploadsEnabled()) return Response.json({ error: "Please use Upload file in Reports to save this file to R2.", code: "use_chunked_upload" }, { status: 409 });
    const workspace = identity.workspace;
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
    u.uploadedBy = identity.email.slice(0, 200);
    await saveReportFile(workspace, id, u, identity.userId);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return dbError(e);
  }
}
