"use client";

import type { ReportFileDetail, ReportFileKind, ReportFileSummary, ReportTable } from "@/lib/domain/reportFiles";

// Browser calls to /api/reports/uploads. Errors carry the server's message; `noDb` marks a missing DATABASE_URL.
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

export const getUpload = (id: string) => call<{ file: ReportFileDetail }>(`/api/reports/uploads/${encodeURIComponent(id)}`).then((r) => r.file);

export const deleteUpload = (id: string) => call<{ ok: true }>(`/api/reports/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });

export const uploadPayload = (u: { companyName: string; originalBase64?: string; name: string; kind: ReportFileKind; size: number; uploadedBy: string; tables: ReportTable[] }) => JSON.stringify(u);

export const saveUpload = (body: string) => call<{ id: string }>("/api/reports/uploads", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.id);
