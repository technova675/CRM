import { z } from "zod";
import { dbError, supabaseRequest } from "@/lib/db";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { MAX_COLUMNS, MAX_ROWS, MAX_TABLES } from "@/lib/domain/reportFiles";
import { MAX_TRANSFER_REQUEST_BYTES, MAX_UPLOAD_FILE_BYTES } from "@/lib/domain/reportTransfer";
import { r2UploadsEnabled, checkR2Configuration } from "@/lib/reportR2";
import { transferSession, putR2TransferPart, cleanR2Jobs, sessionPrefix } from "@/lib/reportR2Transfers";

export const maxDuration = 180;

const cell = z.union([z.string().max(100_000), z.number().finite(), z.null()]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin"), upload: z.object({
    companyName: z.string().trim().min(1).max(300), name: z.string().min(1).max(300), kind: z.enum(["excel", "csv", "pptx", "pdf"]),
    size: z.number().int().min(1).max(MAX_UPLOAD_FILE_BYTES), uploadedBy: z.string().max(200),
    tables: z.array(z.object({ name: z.string().min(1).max(300), columns: z.array(z.string().max(100_000)).min(1).max(MAX_COLUMNS),
      headerRow: z.number().int().min(0).max(MAX_ROWS - 1).nullable(), rowCount: z.number().int().min(0).max(MAX_ROWS),
      rawRowCount: z.number().int().min(0).max(MAX_ROWS), rowParts: z.number().int().min(0).max(MAX_ROWS), rawParts: z.number().int().min(0).max(MAX_ROWS),
    })).min(1).max(MAX_TABLES),
  }) }),
  z.object({ action: z.literal("part"), sessionId: z.string().uuid(), part: z.object({
    kind: z.enum(["original", "rows", "raw"]), tableIndex: z.number().int().min(-1).max(MAX_TABLES - 1), partIndex: z.number().int().min(0).max(MAX_ROWS),
    payload: z.union([z.string().max(1_000_000), z.array(z.array(cell).max(MAX_COLUMNS)).max(MAX_ROWS)]),
  }) }),
  z.object({ action: z.literal("complete"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), sessionId: z.string().uuid() }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const identity = await reportIdentity(req);
    const workspace = identity.workspace;
    // Bound memory while reading, including requests with no Content-Length header.
    const reader = req.body?.getReader();
    if (!reader) return Response.json({ error: "Missing upload body" }, { status: 400 });
    let length = 0;
    let text = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_TRANSFER_REQUEST_BYTES) {
          await reader.cancel();
          return Response.json({ error: "Upload chunk is too large. Retry using the report uploader." }, { status: 413 });
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch { return Response.json({ error: "Upload was interrupted. Please retry." }, { status: 400 }); }
    let input: unknown;
    try { input = JSON.parse(text); } catch { return Response.json({ error: "Invalid upload JSON" }, { status: 400 }); }
    const parsed = schema.safeParse(input);
    if (!parsed.success) return Response.json({ error: "Invalid upload metadata or chunk. Files must be no larger than 200 MB and stay within the worksheet limits." }, { status: 400 });
    const data = parsed.data;
    if (data.action === "begin") {
      data.upload.uploadedBy = identity.email.slice(0, 200);
      const r2 = r2UploadsEnabled();
      if (r2) checkR2Configuration();
      const sessionId = await supabaseRequest<string>(r2 ? "rpc/begin_r2_report_transfer" : "rpc/begin_report_transfer", { method: "POST", body: { p_workspace: workspace, p_upload: data.upload, p_owner: identity.userId } });
      return Response.json({ sessionId });
    }
    const body = { p_workspace: workspace, p_session: data.sessionId, p_owner: identity.userId };
    const session = await transferSession(workspace, identity.userId, data.sessionId);
    if (data.action === "part") {
      if (session.storage_backend === "r2") await putR2TransferPart(workspace, identity.userId, session, data.part);
      else await supabaseRequest("rpc/put_report_transfer_part", { method: "POST", body: { ...body, p_part: data.part }, timeoutMs: 150_000 });
      return Response.json({ ok: true });
    }
    if (data.action === "complete") {
      const id = await supabaseRequest<string>(session.storage_backend === "r2" ? "rpc/complete_r2_report_transfer" : "rpc/complete_report_transfer", { method: "POST", body, timeoutMs: 150_000 });
      return Response.json({ id });
    }
    await supabaseRequest("rpc/cancel_report_transfer", { method: "POST", body });
    if (session.storage_backend === "r2") await cleanR2Jobs(sessionPrefix(data.sessionId)).catch(() => console.error("[storage] Cleanup queued for retry"));
    return Response.json({ ok: true });
  } catch (error) { return dbError(error); }
}
