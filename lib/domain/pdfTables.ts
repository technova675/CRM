import { gridToTable, type ReportTable } from "./reportFiles.ts";

// Turns positioned PDF text into report tables. Pure (no DOM, no pdf.js) so it runs in the browser
// parser and in tests. A PDF has no real table objects, so tables are recovered from layout: lines of
// text whose pieces are separated by wide gaps and line up in columns across several lines.

export type PdfTextItem = { str: string; x: number; y: number; w: number; h: number };
export type PdfPage = { number: number; items: PdfTextItem[] };

type Cell = { text: string; x0: number; x1: number };
type Line = { y: number; h: number; cells: Cell[] };

const GAP_FACTOR = 0.75; // a gap wider than this many text heights starts a new cell
const LINE_FACTOR = 2.2; // lines further apart than this many text heights are not one table

function pageLines(items: PdfTextItem[]): Line[] {
  const words = items.filter((item) => item.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of words) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, (row ? Math.max(...row.map((r) => r.h)) : item.h) * 0.5);
    if (row && Math.abs(row[0].y - item.y) <= tolerance) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const h = Math.max(1, ...row.map((item) => item.h));
    const cells: Cell[] = [];
    for (const item of row) {
      const last = cells[cells.length - 1];
      const text = item.str.trim();
      if (last && item.x - last.x1 < h * GAP_FACTOR) {
        last.text += (item.x - last.x1 > h * 0.1 ? " " : "") + text;
        last.x1 = Math.max(last.x1, item.x + item.w);
      } else cells.push({ text, x0: item.x, x1: item.x + item.w });
    }
    return { y: row[0].y, h, cells };
  });
}

// Groups consecutive multi-cell lines (allowing a short single-cell line between two of them).
function tableBlocks(lines: Line[]) {
  const blocks: { from: number; to: number }[] = [];
  let start = -1;
  const close = (end: number) => {
    while (end >= start && lines[end].cells.length < 2) end--;
    if (start >= 0 && end > start) blocks.push({ from: start, to: end });
    start = -1;
  };
  lines.forEach((line, i) => {
    const prev = lines[i - 1];
    const near = prev && prev.y - line.y <= Math.max(prev.h, line.h) * LINE_FACTOR;
    if (start >= 0 && !near) close(i - 1);
    if (line.cells.length >= 2) { if (start < 0) start = i; return; }
    const sparse = start >= 0 && line.cells[0].text.length <= 40 && lines[i + 1]?.cells.length >= 2;
    if (start >= 0 && !sparse) close(i - 1);
  });
  if (start >= 0) close(lines.length - 1);
  return blocks;
}

function blockGrid(lines: Line[]): string[][] {
  const spans = lines.flatMap((line) => line.cells.map((cell) => [cell.x0, cell.x1] as [number, number])).sort((a, b) => a[0] - b[0]);
  const columns: [number, number][] = [];
  for (const [x0, x1] of spans) {
    const last = columns[columns.length - 1];
    if (last && x0 <= last[1]) last[1] = Math.max(last[1], x1);
    else columns.push([x0, x1]);
  }
  return lines.map((line) => {
    const row = Array<string>(columns.length).fill("");
    for (const cell of line.cells) {
      const index = columns.findIndex(([x0, x1]) => cell.x0 <= x1 && cell.x1 >= x0);
      if (index >= 0) row[index] = row[index] ? `${row[index]} ${cell.text}` : cell.text;
    }
    return row;
  });
}

function paragraphs(lines: Line[]) {
  const out: string[] = [];
  let current = "";
  let previous: Line | undefined;
  for (const line of lines) {
    const text = line.cells.map((cell) => cell.text).join(" ");
    if (previous && previous.y - line.y > Math.max(previous.h, line.h) * 1.8 && current) { out.push(current); current = ""; }
    current = current ? `${current} ${text}` : text;
    previous = line;
  }
  if (current) out.push(current);
  return out;
}

type Found = { page: number; grid: string[][] };

export function pdfToTables(pages: PdfPage[]): ReportTable[] {
  const found: Found[] = [];
  const text: unknown[][] = [["Page", "Text"]];
  for (const page of pages) {
    const lines = pageLines(page.items);
    const blocks = tableBlocks(lines);
    const used = new Set<number>();
    for (const block of blocks) {
      for (let i = block.from; i <= block.to; i++) used.add(i);
      found.push({ page: page.number, grid: blockGrid(lines.slice(block.from, block.to + 1)) });
    }
    for (const paragraph of paragraphs(lines.filter((_, i) => !used.has(i)))) text.push([page.number, paragraph]);
  }
  // A table that carries on to the next page (same columns, optionally repeating its header) stays one table.
  const merged: { first: number; last: number; grid: string[][] }[] = [];
  for (const table of found) {
    const prev = merged[merged.length - 1];
    if (prev && prev.last === table.page - 1 && prev.grid[0].length === table.grid[0].length && found.filter((f) => f.page === table.page)[0] === table) {
      const repeated = table.grid[0].every((cell, i) => cell === prev.grid[0][i]);
      prev.grid.push(...(repeated ? table.grid.slice(1) : table.grid));
      prev.last = table.page;
    } else merged.push({ first: table.page, last: table.page, grid: table.grid });
  }
  const perPage = new Map<number, number>();
  for (const table of merged) perPage.set(table.first, (perPage.get(table.first) ?? 0) + 1);
  const seen = new Map<number, number>();
  const tables = merged.flatMap((table) => {
    const n = (seen.get(table.first) ?? 0) + 1;
    seen.set(table.first, n);
    const pageLabel = table.first === table.last ? `Page ${table.first}` : `Pages ${table.first}–${table.last}`;
    const made = gridToTable(perPage.get(table.first)! > 1 ? `${pageLabel} · Table ${n}` : `${pageLabel} · Table`, table.grid);
    return made ? [made] : [];
  });
  if (tables.length) return tables;
  const fallback = text.length > 1 ? gridToTable("PDF text", text) : null;
  return fallback ? [fallback] : [];
}
