import { dbError, supabaseRequest } from "@/lib/db";
import { reportIdentity } from "@/lib/auth/server";
import type { Cell } from "@/lib/domain/reportFiles";
import { readR2Part } from "@/lib/reportR2";

export async function GET(req: Request, context: RouteContext<"/api/reports/uploads/[id]/parts">) {
  const { id } = await context.params;
  const params = new URL(req.url).searchParams;
  const tableId = params.get("table");
  const kind = params.get("kind");
  const index = Number(params.get("index"));
  if (!tableId || !["rows", "raw"].includes(kind ?? "") || !params.has("index") || !Number.isInteger(index) || index < 0) return Response.json({ error: "Invalid sheet chunk" }, { status: 400 });
  try {
    const { workspace } = await reportIdentity(req);
    const [file] = await supabaseRequest<{ storage_backend: string }[]>("report_files", { query: {
      select: "storage_backend", id: `eq.${id}`, workspace_id: `eq.${workspace}`, limit: "1",
    } });
    if (!file) return Response.json({ error: "Report not found" }, { status: 404 });
    if (file.storage_backend === "r2") {
      const [object] = await supabaseRequest<{ object_key: string; sha256: string }[]>("report_r2_objects", { query: {
        select: "object_key,sha256", file_id: `eq.${id}`, table_id: `eq.${tableId}`, kind: `eq.${kind}`, part_index: `eq.${index}`, limit: "1",
      } });
      if (!object) return Response.json({ error: "Report chunk not found" }, { status: 404 });
      const rows: unknown = JSON.parse((await readR2Part(object.object_key, object.sha256)).toString("utf8"));
      if (!Array.isArray(rows) || !rows.every(Array.isArray)) throw new Error("Invalid stored sheet");
      return Response.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [part] = await supabaseRequest<{ payload: Cell[][] }[]>("report_table_parts", { query: {
      select: "payload,file:report_files!inner(workspace_id)", file_id: `eq.${id}`, table_id: `eq.${tableId}`,
      kind: `eq.${kind}`, part_index: `eq.${index}`, "file.workspace_id": `eq.${workspace}`, limit: "1",
    } });
    if (!part) return Response.json({ error: "Report chunk not found" }, { status: 404 });
    return Response.json({ rows: part.payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dbError(error); }
}
