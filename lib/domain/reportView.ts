import type { Cell, ReportTable } from "./reportFiles.ts";

export const isMissingCell = (value: Cell | undefined) => value == null || (typeof value === "string" && value.trim() === "");

export function reportShares(data: { x: string; v: number }[]) {
  const sorted = [...data].sort((a, b) => b.v - a.v);
  return sorted.length > 6 ? [...sorted.slice(0, 5), { x: "Other groups (combined)", v: sorted.slice(5).reduce((n, d) => n + d.v, 0) }] : sorted;
}

// Presentation only: retain source coordinates and never fill missing values with invented data.
export function reportView(table: ReportTable, original = false) {
  const rows = original ? table.rows : table.rows.filter((row) => row.some((value) => !isMissingCell(value)));
  const columnIndexes = table.columns.flatMap((_, i) => original || rows.some((row) => !isMissingCell(row[i])) ? [i] : []);
  return {
    ...table,
    columns: columnIndexes.map((i) => table.columns[i]),
    rows: rows.map((row) => columnIndexes.map((i) => row[i] ?? null)),
    hiddenRows: table.rows.length - rows.length,
    hiddenColumns: table.columns.length - columnIndexes.length,
    missingCells: rows.reduce((sum, row) => sum + columnIndexes.filter((i) => isMissingCell(row[i])).length, 0),
  };
}
