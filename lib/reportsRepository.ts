import { supabaseRequest } from "./db.ts";
import { cleanR2Jobs } from "./reportR2Transfers.ts";
import { fileRowToMeta, type ReportFileDetail, type ReportFileKind, type ReportFileRow, type ReportFileSummary, type ReportTable } from "./domain/reportFiles.ts";

type StoredTable = { id: string; name: string; row_count: number; column_count: number };
type StoredFile = ReportFileRow & { company: { name: string } | null; tables: StoredTable[] };
const FILE_COLUMNS = "id,client_id,name,kind,size,uploaded_by,created_at,company:report_companies(name)";

function workspaceFilter(workspace: string) {
  if (!/^[a-f0-9]{64}$/.test(workspace)) throw new Error("Invalid report workspace");
  return `eq.${workspace}`;
}

export async function listReportFiles(workspace: string, clientId?: string | null): Promise<ReportFileSummary[]> {
  const files: StoredFile[] = [];
  // Paginate so Supabase's response row limit never silently truncates an established library.
  for (let offset = 0; ; offset += 500) {
    const page = await supabaseRequest<StoredFile[]>("report_files", { query: {
      select: `${FILE_COLUMNS},tables:report_tables(id,name,row_count,column_count)`,
      workspace_id: workspaceFilter(workspace), order: "created_at.desc,id.desc", "tables.order": "position.asc",
      limit: "500", offset: String(offset), ...(clientId ? { client_id: `eq.${clientId}` } : {}),
    } });
    files.push(...page);
    if (page.length < 500) break;
  }
  return files.map((file) => ({
    ...fileRowToMeta({ ...file, company_name: file.company?.name }),
    tables: file.tables.map((table) => ({ id: table.id, name: table.name, rowCount: table.row_count, columnCount: table.column_count })),
  }));
}

export async function getReportFile(workspace: string, id: string): Promise<ReportFileDetail | null> {
  type Detail = Omit<StoredFile, "tables"> & { tables: (ReportTable & { id: string })[] };
  const [file] = await supabaseRequest<Detail[]>("report_files", { query: {
    select: `${FILE_COLUMNS},tables:report_tables(id,name,columns,rows,rawRows:raw_rows,headerRow:header_row,chunked,rowParts:row_parts,rawParts:raw_parts)`,
    workspace_id: workspaceFilter(workspace), id: `eq.${id}`, "tables.order": "position.asc", limit: "1",
  } });
  return file ? { ...fileRowToMeta({ ...file, company_name: file.company?.name }), tables: file.tables } : null;
}

export type ReportUpload = { companyName: string; name: string; kind: ReportFileKind; size: number; uploadedBy: string; originalBase64?: string; tables: ReportTable[] };

export async function saveReportFile(workspace: string, id: string, upload: ReportUpload, ownerId?: string): Promise<string> {
  workspaceFilter(workspace);
  // A database function commits the company, file, original bytes and worksheets atomically.
  return supabaseRequest<string>("rpc/save_report_upload", { method: "POST", body: { p_workspace: workspace, p_file_id: id, p_upload: upload, ...(ownerId ? { p_owner: ownerId } : {}) } });
}

export async function deleteReportFile(workspace: string, id: string): Promise<boolean> {
  const deleted = await supabaseRequest<{ id: string; object_prefix?: string | null }[]>("report_files", {
    method: "DELETE", prefer: "return=representation", query: { select: "id,object_prefix", workspace_id: workspaceFilter(workspace), id: `eq.${id}` },
  });
  if (deleted[0]?.object_prefix) await cleanR2Jobs(deleted[0].object_prefix).catch(() => console.error("[storage] Cleanup queued for retry"));
  return deleted.length > 0;
}
