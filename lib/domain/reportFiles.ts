// Uploaded report files (Excel / CSV / PowerPoint) turned into plain tables.
// Shared by the browser (parsing, display) and the API routes (validation, storage). Pure: no DOM or DB access.

export type Cell = string | number | null;
export type ReportFileKind = "excel" | "csv" | "pptx";
export type ColumnType = "number" | "date" | "text";

export interface ReportTable {
  name: string; // sheet name, or "Slide 3 · Table 1" for presentations
  columns: string[];
  rows: Cell[][];
  rawRows?: Cell[][];
  headerRow?: number | null;
}

export interface ReportFileMeta {
  id: string;
  clientId: string;
  companyName: string;
  name: string;
  kind: ReportFileKind;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

export interface ReportFileSummary extends ReportFileMeta {
  tables: { id: string; name: string; rowCount: number; columnCount: number }[];
}

export interface ReportFileDetail extends ReportFileMeta {
  tables: (ReportTable & { id: string })[];
}

// A report_files row (snake_case, as stored in Postgres) → the API shape.
export type ReportFileRow = { id: string; client_id: string; company_name?: string; name: string; kind: ReportFileKind; size: number; uploaded_by: string; created_at: string | Date };
export const fileRowToMeta = (f: ReportFileRow): ReportFileMeta => ({ id: f.id, clientId: f.client_id, companyName: f.company_name ?? "Unassigned", name: f.name, kind: f.kind, size: f.size, uploadedBy: f.uploaded_by, createdAt: new Date(f.created_at).toISOString() });

// Vercel caps a request body at 4.5 MB, so the parsed tables must fit under that when sent as JSON.
export const MAX_PAYLOAD_BYTES = 4_000_000;
export const MAX_TABLES = 60;
export const MAX_COLUMNS = 200;
export const MAX_ROWS = 50_000;

const KIND_BY_EXT: Record<string, ReportFileKind> = { xlsx: "excel", csv: "csv", pptx: "pptx" };
export const ACCEPTED_EXTENSIONS = ".xlsx,.csv,.pptx";

// Which parser to use for a file name, or why it can't be read.
export function fileKind(name: string): { kind: ReportFileKind } | { error: string; hint: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const kind = KIND_BY_EXT[ext];
  if (kind) return { kind };
  if (ext === "xls") return { error: "Old Excel format (.xls) isn't supported", hint: "Open it in Excel and save it as .xlsx, then upload again." };
  if (ext === "ppt") return { error: "Old PowerPoint format (.ppt) isn't supported", hint: "Open it in PowerPoint and save it as .pptx, then upload again." };
  return { error: "Unsupported file type", hint: "Upload an Excel (.xlsx), CSV or PowerPoint (.pptx) file." };
}

const pad = (n: number) => String(n).padStart(2, "0");

// Spreadsheet values → storable cells. Dates become YYYY-MM-DD (or a full ISO time when they carry one).
export function toCell(v: unknown): Cell {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    return v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds() ? v.toISOString() : date;
  }
  const s = String(v);
  return s === "" ? null : s;
}

// A raw grid (first non-empty row = headers) → a table. Empty rows and completely empty columns are dropped;
// blank headers become "Column N" and repeated ones get a " (2)" suffix. Returns null when nothing is left.
export function gridToTable(name: string, grid: unknown[][], header?: number | null): ReportTable | null {
  const rawRows = grid.map((r) => r.map(toCell));
  const width = rawRows.reduce((n, r) => Math.max(n, r.length), 0);
  if (!width || !rawRows.some((r) => r.some((v) => v !== null))) return null;
  if (width > MAX_COLUMNS || rawRows.length > MAX_ROWS) throw new Error(`Sheet "${name}" exceeds ${MAX_ROWS} rows or ${MAX_COLUMNS} columns. Split it before uploading; no data has been saved.`);
  const headerRow = header === undefined ? detectHeader(rawRows) : header;
  const seen = new Map<string, number>();
  const used = new Set<string>();
  const columns = Array.from({ length: width }, (_, i) => {
    const base = headerRow == null || rawRows[headerRow]?.[i] == null ? `Column ${i + 1}` : String(rawRows[headerRow][i]).trim() || `Column ${i + 1}`;
    let count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    while (used.has((count > 1 ? `${base} (${count})` : base).toLowerCase())) count++;
    seen.set(base.toLowerCase(), count);
    const label = count > 1 ? `${base} (${count})` : base;
    used.add(label.toLowerCase());
    return label;
  });
  const body = rawRows.slice(headerRow == null ? 0 : headerRow + 1).map((r) => columns.map((_, i) => r[i] ?? null));
  return { name: name.trim() || "Table", columns, rows: body, rawRows, headerRow };
}

// Conservative guess only; the upload preview always lets the user choose a different row or no headers.
export function detectHeader(rows: Cell[][]): number | null {
  const candidates = rows.slice(0, 40).map((r, i) => ({ i, filled: r.filter((v) => v != null), r }));
  const width = Math.max(0, ...candidates.map((x) => x.filled.length));
  const match = candidates.find((x) => x.filled.length >= Math.max(1, width * 0.7) && x.filled.every((v) => typeof v === "string" && toNumber(v) === null && !/^\d{4}-\d{2}-\d{2}/.test(v)));
  return match?.i ?? null;
}

export function detectCompany(tables: ReportTable[]): string {
  const names = new Set<string>();
  for (const t of tables) {
    const i = t.columns.findIndex((c) => /^(company|company name|client|client name|business name|advertiser|account name)$/i.test(c.trim()));
    if (i >= 0) for (const r of t.rows) if (typeof r[i] === "string" && String(r[i]).trim()) names.add(String(r[i]).trim());
  }
  return names.size === 1 ? [...names][0] : "";
}

// "₹1,23,456.50", "$1,200", "12.5%", "(300)", "1.2e3" → number. Anything else → null.
const NUMERIC = /^\(?\s*[-+]?\s*[₹$€£¥]?\s*[-+]?(\d[\d,]*)?(\.\d+)?([eE][-+]?\d+)?\s*%?\s*\)?$/;
export function toNumber(v: Cell): number | null {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const s = v.trim();
  if (!/\d/.test(s) || !NUMERIC.test(s)) return null;
  const n = Number(s.replace(/[^0-9.eE+-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return /^\(.*\)$/.test(s) ? -Math.abs(n) : n;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

// A column is numeric/date when at least 90% of its filled cells read as one (totals rows and notes are tolerated).
export function columnType(rows: Cell[][], i: number): ColumnType {
  let filled = 0;
  let nums = 0;
  let dates = 0;
  for (const r of rows) {
    const v = r[i];
    if (v == null || r.some(isTotalLabel)) continue;
    filled++;
    if (typeof v === "string" && ISO_DATE.test(v)) dates++;
    else if (toNumber(v) !== null) nums++;
  }
  if (!filled) return "text";
  if (dates / filled >= 0.9) return "date";
  if (nums / filled >= 0.9) return "number";
  return "text";
}

// Is the column a percentage ("12.5%") or a currency amount ("₹1,200")? Returns "%", the currency symbol, or "".
// Used only for formatting totals; percentages are averaged rather than summed.
export function columnUnit(rows: Cell[][], i: number): string {
  const sample = rows.map((r) => r[i]).find((v): v is string => typeof v === "string" && /\d/.test(v));
  if (!sample) return "";
  if (/%\s*\)?$/.test(sample)) return "%";
  return sample.match(/[₹$€£¥]/)?.[0] ?? "";
}

// "Total", "Grand total", "Totals" rows are skipped when the app computes its own totals and charts.
export const isTotalLabel = (v: Cell) => typeof v === "string" && /^(?:(?:grand|sub)\s*)?totals?\s*:?$/i.test(v.trim());

export type Aggregation = "sum" | "average" | "min" | "max";
export const isIdentifier = (name: string) => /(^|[\s_])(id|phone|mobile|zip|postcode|year)([\s_]|$)/i.test(name);
export function defaultAggregation(name: string, unit: string): Aggregation {
  return unit === "%" || /\b(ctr|cpc|cpm|cpa|cpl|roas|roi|rate|ratio|average|avg|frequency|cost per|price)\b|%/i.test(name) ? "average" : "sum";
}
export function aggregateValues(values: number[], mode: Aggregation): number | null {
  if (!values.length) return null;
  if (mode === "min") return values.reduce((a, b) => Math.min(a, b));
  if (mode === "max") return values.reduce((a, b) => Math.max(a, b));
  const sum = values.reduce((a, b) => a + b, 0);
  return mode === "average" ? sum / values.length : sum;
}

// CSV text for one table (download / export).
export function tableToCSV(t: ReportTable): string {
  const esc = (v: Cell) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns.map(esc).join(","), ...t.rows.map((r) => r.map(esc).join(","))].join("\n");
}
