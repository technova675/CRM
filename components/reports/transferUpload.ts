"use client";

import type { ReportFileKind, ReportTable } from "@/lib/domain/reportFiles";
import { REPORT_CHUNK_BYTES, rowChunkRanges, validateUploadSize } from "@/lib/domain/reportTransfer";
import { UploadsApiError } from "./uploadsApi";

async function transfer<T>(body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/reports/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new UploadsApiError("Upload connection interrupted. Please retry the upload."); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new UploadsApiError(result.error ?? `Upload failed (HTTP ${response.status}).`);
  return result;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the original file chunk"));
    reader.readAsDataURL(blob);
  });
}

export async function transferReport(file: File, upload: { companyName: string; kind: ReportFileKind; uploadedBy: string; tables: ReportTable[] }, onProgress: (percent: number) => void): Promise<string> {
  validateUploadSize(file.size);
  const plans = upload.tables.map((table) => ({ rows: rowChunkRanges(table.rows), raw: rowChunkRanges(table.rawRows ?? []) }));
  const originalParts = Math.ceil(file.size / REPORT_CHUNK_BYTES);
  const { sessionId } = await transfer<{ sessionId: string }>({ action: "begin", upload: {
    companyName: upload.companyName, name: file.name, kind: upload.kind, size: file.size, uploadedBy: upload.uploadedBy,
    tables: upload.tables.map((table, i) => ({ name: table.name, columns: table.columns, headerRow: table.headerRow ?? null, rowCount: table.rows.length, rawRowCount: table.rawRows?.length ?? 0, rowParts: plans[i].rows.length, rawParts: plans[i].raw.length })),
  } });
  const tasks: (() => Promise<void>)[] = [];
  for (let index = 0; index < originalParts; index++) tasks.push(async () => {
    const payload = await base64(file.slice(index * REPORT_CHUNK_BYTES, Math.min(file.size, (index + 1) * REPORT_CHUNK_BYTES)));
    await sendPart({ kind: "original", tableIndex: -1, partIndex: index, payload });
  });
  plans.forEach((plan, tableIndex) => {
    for (const kind of ["rows", "raw"] as const) plan[kind].forEach(({ start, end }, partIndex) => tasks.push(async () => {
      const rows = kind === "rows" ? upload.tables[tableIndex].rows : upload.tables[tableIndex].rawRows!;
      await sendPart({ kind, tableIndex, partIndex, payload: rows.slice(start, end) });
    }));
  });
  async function sendPart(part: unknown) {
    for (let attempt = 0; ; attempt++) {
      try { await transfer({ action: "part", sessionId, part }); return; }
      catch (error) { if (attempt >= 2) throw error; await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1))); }
    }
  }
  let next = 0;
  let done = 0;
  let failure: unknown;
  const workers = Array.from({ length: 3 }, async () => {
    while (next < tasks.length && !failure) {
      const index = next++;
      try { await tasks[index](); onProgress(Math.floor(++done / tasks.length * 95)); }
      catch (error) { failure = error; }
    }
  });
  await Promise.all(workers);
  if (failure) {
    await transfer({ action: "cancel", sessionId }).catch(() => {});
    throw failure;
  }
  // Completion is idempotent: a lost response can be safely retried without duplicate reports.
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await transfer<{ id: string }>({ action: "complete", sessionId });
      onProgress(100);
      return result.id;
    } catch (error) { if (attempt >= 2) throw error; }
  }
}
