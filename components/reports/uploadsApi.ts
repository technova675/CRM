"use client";

import type { Cell, ReportFileDetail, ReportFileKind, ReportFileSummary, ReportTable } from "@/lib/domain/reportFiles";

// Browser calls to /api/reports/uploads. Errors carry the server's message; `noDb` marks missing Supabase server configuration.
export class UploadsApiError extends Error {
  constructor(message: string, readonly noDb = false) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new UploadsApiError("Could not reach the server.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; issues?: string[] };
  if (!res.ok) throw new UploadsApiError([json.error ?? `HTTP ${res.status}`, ...(json.issues ?? [])].join(" · "), json.code === "no_db");
  return json;
}

export const listUploads = (clientId?: string) => call<{ files: ReportFileSummary[] }>(`/api/reports/uploads${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`, { cache: "no-store" }).then((r) => r.files);

export async function getUpload(id: string, onProgress?: (done: number, total: number) => void): Promise<ReportFileDetail> {
  const { file } = await call<{ file: ReportFileDetail }>(`/api/reports/uploads/${encodeURIComponent(id)}`);
  const jobs: (() => Promise<void>)[] = [];
  const parts = file.tables.map(() => ({ rows: [] as Cell[][][], raw: [] as Cell[][][] }));
  file.tables.forEach((table, tableIndex) => {
    if (!table.chunked) return;
    for (const kind of ["rows", "raw"] as const) {
      const count = kind === "rows" ? table.rowParts ?? 0 : table.rawParts ?? 0;
      for (let index = 0; index < count; index++) jobs.push(async () => {
        const query = new URLSearchParams({ table: table.id, kind, index: String(index) });
        const result = await call<{ rows: Cell[][] }>(`/api/reports/uploads/${encodeURIComponent(id)}/parts?${query}`);
        parts[tableIndex][kind][index] = result.rows;
        onProgress?.(++finished, jobs.length);
      });
    }
  });
  let next = 0;
  let finished = 0;
  if (jobs.length) onProgress?.(0, jobs.length);
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]();
  }));
  file.tables.forEach((table, index) => {
    if (!table.chunked) return;
    table.rows = parts[index].rows.flat();
    table.rawRows = parts[index].raw.flat();
  });
  return file;
}

export const deleteUpload = (id: string) => call<{ ok: true }>(`/api/reports/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });

export const uploadPayload = (u: { companyName: string; originalBase64?: string; name: string; kind: ReportFileKind; size: number; uploadedBy: string; tables: ReportTable[] }) => JSON.stringify(u);

export const saveUpload = (body: string) => call<{ id: string }>("/api/reports/uploads", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.id);
