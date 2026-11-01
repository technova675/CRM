import { supabaseRequest, SupabaseDbError } from "./db.ts";
import { r2Prefix, writeR2Part, removeR2Prefix } from "./reportR2.ts";
import type { Cell } from "./domain/reportFiles.ts";

type Sheet = { rowParts: number; rawParts: number };
type Session = { id: string; storage_backend: string; upload: { size: number; tables: Sheet[] }; completed_file_id: string | null; expires_at: string };
export async function transferSession(workspace: string, owner: string, id: string) {
  const [session] = await supabaseRequest<Session[]>("report_transfer_sessions", { query: {
    select: "id,storage_backend,upload,completed_file_id,expires_at", id: `eq.${id}`, workspace_id: `eq.${workspace}`, owner_id: `eq.${owner}`, limit: "1",
  } });
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) throw new SupabaseDbError("22023", 400);
  return session;
}

export async function putR2TransferPart(workspace: string, owner: string, session: Session,
  part: { kind: "original" | "rows" | "raw"; tableIndex: number; partIndex: number; payload: string | Cell[][] }) {
  const invalid = () => { throw new SupabaseDbError("22023", 400); };
  if (session.completed_file_id) invalid();
  let bytes: Buffer; let rowCount = 0; let expected: number;
  if (part.kind === "original") {
    if (typeof part.payload !== "string" || part.tableIndex !== -1 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.payload)) return invalid();
    bytes = Buffer.from(part.payload, "base64");
    expected = Math.ceil(session.upload.size / 750_000);
    if (bytes.length !== Math.min(750_000, session.upload.size - part.partIndex * 750_000)) invalid();
  } else {
    const sheet = session.upload.tables[part.tableIndex];
    if (!sheet || !Array.isArray(part.payload) || !part.payload.length) return invalid();
    expected = part.kind === "rows" ? sheet.rowParts : sheet.rawParts;
    rowCount = part.payload.length;
    bytes = Buffer.from(JSON.stringify(part.payload));
    if (bytes.length > 750_000) invalid();
  }
  if (part.partIndex < 0 || part.partIndex >= expected) invalid();
  const object = await writeR2Part(session.id, part.kind, part.tableIndex, part.partIndex, bytes);
  // Only a small receipt goes into Postgres; original bytes and all cell data stay in R2.
  await supabaseRequest("rpc/put_r2_report_part", { method: "POST", body: {
    p_workspace: workspace, p_owner: owner, p_session: session.id,
    p_part: { kind: part.kind, tableIndex: part.tableIndex, partIndex: part.partIndex, ...object, rowCount },
  } });
}

export async function cleanR2Jobs(prefix?: string) {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const jobs = await supabaseRequest<{ prefix: string; created_at: string }[]>("report_r2_cleanup", { query: {
    select: "prefix,created_at", limit: "10", order: "created_at.asc", ...(prefix ? { prefix: `eq.${prefix}` } : { created_at: `lt.${cutoff}` }),
  } });
  for (const job of jobs) {
    await removeR2Prefix(job.prefix);
    // A cancelled request can still be finishing its R2 write. Keep a durable
    // second sweep beyond the maximum request lifetime, including account deletion.
    if (job.created_at < cutoff) await supabaseRequest("report_r2_cleanup", { method: "DELETE", query: { prefix: `eq.${job.prefix}` } });
  }
}
export const sessionPrefix = r2Prefix;
