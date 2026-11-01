import type { Cell } from "./reportFiles.ts";

export const MAX_UPLOAD_FILE_BYTES = 200_000_000;
export const REPORT_CHUNK_BYTES = 750_000;
export const MAX_TRANSFER_REQUEST_BYTES = 1_100_000;

export function validateUploadSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_FILE_BYTES) throw new Error("Upload a file between 1 byte and 200 MB.");
}

// Keep only ranges in memory; serialize and send each chunk when a worker needs it.
export function rowChunkRanges(rows: Cell[][]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const encoder = new TextEncoder();
  let start = 0;
  let bytes = 2;
  rows.forEach((row, index) => {
    const rowBytes = encoder.encode(JSON.stringify(row)).length;
    if (rowBytes + 2 > REPORT_CHUNK_BYTES) throw new Error(`Row ${index + 1} is too large to process. Split very long cell contents into smaller columns or rows.`);
    if (bytes + rowBytes + (index > start ? 1 : 0) > REPORT_CHUNK_BYTES) {
      ranges.push({ start, end: index });
      start = index;
      bytes = 2;
    }
    bytes += rowBytes + (index > start ? 1 : 0);
  });
  if (start < rows.length) ranges.push({ start, end: rows.length });
  return ranges;
}
