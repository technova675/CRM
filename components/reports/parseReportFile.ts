"use client";

import Papa from "papaparse";
import readExcelFile from "read-excel-file/browser";
import { strFromU8, unzipSync } from "fflate";
import { fileKind, gridToTable, MAX_TABLES, type ReportFileKind, type ReportTable } from "@/lib/domain/reportFiles";

// Reads an uploaded file in the browser into tables: every Excel sheet, the CSV, or every table and
// chart in a PowerPoint deck. Throws an Error whose message can be shown to the user as-is.

export class UnsupportedFileError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
  }
}

export async function parseReportFile(file: File): Promise<{ kind: ReportFileKind; tables: ReportTable[] }> {
  const k = fileKind(file.name);
  if ("error" in k) throw new UnsupportedFileError(k.error, k.hint);
  const base = file.name.replace(/\.[^.]+$/, "");
  let tables: ReportTable[];
  if (k.kind === "excel") tables = await parseExcel(file);
  else if (k.kind === "csv") tables = await parseCsv(file, base);
  else tables = await parsePptx(file);
  if (!tables.length) throw new UnsupportedFileError("No data found in this file", "The file contains no readable cells, tables or text.");
  if (tables.length > MAX_TABLES) throw new Error(`This file has more than ${MAX_TABLES} tables. Split it before uploading; no tables have been discarded.`);
  return { kind: k.kind, tables };
}

async function parseExcel(file: File) {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = (await readExcelFile(file)) as unknown as { sheet: string; data: unknown[][] }[];
  } catch {
    throw new UnsupportedFileError("Could not read this Excel file", "It may be damaged or password-protected. Re-save it as .xlsx and try again.");
  }
  return sheets.map((s) => gridToTable(s.sheet, s.data) ?? { name: s.sheet, columns: ["Column 1"], rows: [], rawRows: [], headerRow: null });
}

function parseCsv(file: File, name: string) {
  return new Promise<ReportTable[]>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: false,
      complete: (res) => {
        const t = gridToTable(name, res.data);
        resolve(t ? [t] : []);
      },
      error: () => reject(new UnsupportedFileError("Could not read this CSV file", "Check that it is a plain comma-separated text file.")),
    });
  });
}

// ---------- PowerPoint (.pptx = a zip of XML parts) ----------
const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
};

const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const all = (el: Document | Element, ns: string, tag: string) => Array.from(el.getElementsByTagNameNS(ns, tag));
const first = (el: Document | Element, ns: string, tag: string) => el.getElementsByTagNameNS(ns, tag)[0];
// Text of a shape/cell: runs joined, paragraphs separated by a space.
const text = (el: Element) => all(el, NS.a, "p").map((p) => all(p, NS.a, "t").map((t) => t.textContent ?? "").join("")).filter(Boolean).join(" ").trim();

// "../charts/chart1.xml" relative to "ppt/slides/slide1.xml" → "ppt/charts/chart1.xml".
function resolvePath(from: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function rels(files: Record<string, Uint8Array>, part: string): Record<string, string> {
  const relPath = part.replace(/([^/]+)$/, "_rels/$1.rels");
  const raw = files[relPath];
  if (!raw) return {};
  return Object.fromEntries(all(xml(strFromU8(raw)), NS.rel, "Relationship").map((r) => [r.getAttribute("Id") ?? "", resolvePath(part, r.getAttribute("Target") ?? "")]));
}

// Slides in presentation order (presentation.xml), falling back to file-name order.
function slideOrder(files: Record<string, Uint8Array>) {
  const pres = files["ppt/presentation.xml"];
  if (pres) {
    const map = rels(files, "ppt/presentation.xml");
    const ordered = all(xml(strFromU8(pres)), NS.p, "sldId").map((s) => map[s.getAttributeNS(NS.r, "id") ?? ""]).filter((p): p is string => !!p && !!files[p]);
    if (ordered.length) return ordered;
  }
  const num = (p: string) => Number(p.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
  return Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
}

// A chart's cached data → Category | Series 1 | Series 2 …
function chartTable(doc: Document, name: string): ReportTable | null {
  const series = all(doc, NS.c, "ser");
  if (!series.length) return null;
  const points = (el: Element | undefined) => {
    const out = new Map<number, string>();
    if (el) for (const pt of all(el, NS.c, "pt")) out.set(Number(pt.getAttribute("idx") ?? 0), first(pt, NS.c, "v")?.textContent ?? "");
    return out;
  };
  const cats = points(first(series[0]!, NS.c, "cat") ?? first(series[0]!, NS.c, "xVal"));
  const vals = series.map((s) => points(first(s, NS.c, "val") ?? first(s, NS.c, "yVal")));
  const count = Math.max(cats.size, ...vals.map((v) => v.size), 0);
  if (!count) return null;
  const names = series.map((s, i) => {
    const tx = first(s, NS.c, "tx");
    return (tx && (first(tx, NS.c, "v")?.textContent ?? text(tx))) || `Series ${i + 1}`;
  });
  const grid: unknown[][] = [["Category", ...names]];
  for (let i = 0; i < count; i++) grid.push([cats.get(i) ?? `${i + 1}`, ...vals.map((v) => (v.has(i) && v.get(i) !== "" ? Number(v.get(i)) : null))]);
  return gridToTable(name, grid);
}

async function parsePptx(file: File): Promise<ReportTable[]> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /^ppt\/(presentation\.xml|_rels\/|slides\/|charts\/chart\d+\.xml$)/.test(f.name) });
  } catch {
    throw new UnsupportedFileError("Could not read this PowerPoint file", "It may be damaged or password-protected. Re-save it as .pptx and try again.");
  }
  const tables: ReportTable[] = [];
  const slideText: unknown[][] = [["Slide", "Title", "Text"]];
  slideOrder(files).forEach((path, si) => {
    const doc = xml(strFromU8(files[path]!));
    const n = si + 1;
    const shapes = all(doc, NS.p, "sp");
    const titleShape = shapes.find((sp) => ["title", "ctrTitle"].includes(first(sp, NS.p, "ph")?.getAttribute("type") ?? ""));
    const title = titleShape ? text(titleShape) : "";
    const label = (what: string, i: number, total: number) => `Slide ${n}${title ? ` · ${title.slice(0, 60)}` : ""}${total > 1 ? ` · ${what} ${i + 1}` : ""}`;

    const tbls = all(doc, NS.a, "tbl");
    tbls.forEach((tbl, i) => {
      const grid = all(tbl, NS.a, "tr").map((tr) => all(tr, NS.a, "tc").map((tc) => text(tc)));
      const t = gridToTable(label("Table", i, tbls.length), grid);
      if (t) tables.push(t);
    });

    const slideRels = rels(files, path);
    const charts = all(doc, NS.c, "chart");
    charts.forEach((ch, i) => {
      const target = slideRels[ch.getAttributeNS(NS.r, "id") ?? ""];
      const raw = target && files[target];
      if (!raw) return;
      const t = chartTable(xml(strFromU8(raw)), `${label("Chart", i, charts.length)}${charts.length > 1 ? "" : " · Chart"}`);
      if (t) tables.push(t);
    });

    const body = shapes.filter((sp) => sp !== titleShape).map(text).filter(Boolean).join(" · ");
    if (title || body) slideText.push([n, title, body]);
  });
  // A deck with no tables or charts still has its slide text, so show that rather than nothing.
  if (!tables.length) {
    const t = gridToTable("Slide text", slideText);
    if (t && t.rows.length) tables.push(t);
  }
  return tables;
}
