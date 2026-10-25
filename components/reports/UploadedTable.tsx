"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { aggregateValues, defaultAggregation, isIdentifier, columnType, columnUnit, isTotalLabel, tableToCSV, toNumber, type Aggregation, type Cell, type ReportTable } from "@/lib/domain/reportFiles";
import { AreaTrend, Bars } from "@/components/charts";
import { Button, Card, CardHeader, SearchInput, Select, Table, Td, Th } from "@/components/ui";
import { cn, downloadFile, fmtDate } from "@/lib/utils";

const PAGE = 50;
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const withUnit = (n: number, unit: string) => (unit === "%" ? `${num(n)}%` : `${unit}${num(n)}`);

// One uploaded table: summary figures, a chart built from its own columns, and a searchable, sortable table.
export function UploadedTable({ table, fileName }: { table: ReportTable; fileName: string }) {
  const [raw, setRaw] = useState(false);
  const source = raw && table.rawRows ? { name: `${table.name} · Original cells`, columns: Array.from({ length: table.rawRows.reduce((n, r) => Math.max(n, r.length), 0) }, (_, i) => `Column ${i + 1}`), rows: table.rawRows } : table;
  return <div className="space-y-3">
    {table.rawRows && table.rawRows.length > 0 && <div className="no-print flex items-center gap-3"><Button size="xs" onClick={() => setRaw(!raw)}>{raw ? "Show interpreted report" : "View original worksheet cells"}</Button><span className="text-xs text-fg-3">{raw ? "All source rows, including preambles and headers." : table.headerRow == null ? "No header row selected" : `Headers from worksheet row ${table.headerRow + 1}`}</span></div>}
    <UploadedTableView key={String(raw)} table={source} fileName={fileName} raw={raw} />
  </div>;
}

function UploadedTableView({ table, fileName, raw }: { table: ReportTable; fileName: string; raw: boolean }) {
  const { columns, rows } = table;
  const types = useMemo(() => columns.map((c, i) => raw || isIdentifier(c) ? "text" : columnType(rows, i)), [columns, rows, raw]);
  const units = useMemo(() => columns.map((_, i) => (types[i] === "number" ? columnUnit(rows, i) : "")), [columns, rows, types]);
  const numeric = types.flatMap((t, i) => (t === "number" ? [i] : []));
  const labels = types.flatMap((t, i) => (t !== "number" ? [i] : []));

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [xCol, setXCol] = useState(() => types.indexOf("date") >= 0 ? types.indexOf("date") : (labels[0] ?? -1));
  const [yCol, setYCol] = useState(numeric[0] ?? -1);
  const [aggregation, setAggregation] = useState<Aggregation | "auto">("auto");
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  const modes = useMemo(() => columns.map((c, i) => aggregation === "auto" ? defaultAggregation(c, units[i]) : aggregation), [columns, units, aggregation]);

  // Rows the app sums and charts: a "Total" row in the file would otherwise be counted twice.
  const dataRows = useMemo(() => rows.filter((r) => !r.some(isTotalLabel)), [rows]);
  const agg = (rs: Cell[][], i: number) => {
    const vals = rs.map((r) => toNumber(r[i] ?? null)).filter((v): v is number => v !== null);
    return aggregateValues(vals, modes[i]);
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q ? rows.filter((r) => r.some((v) => v != null && String(v).toLowerCase().includes(q))) : rows;
    if (sort) {
      const { col, dir } = sort;
      const key = (v: Cell) => (types[col] === "number" ? toNumber(v) : v);
      out = [...out].sort((a, b) => {
        const x = key(a[col] ?? null);
        const y = key(b[col] ?? null);
        if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // blanks last
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
      });
    }
    return out;
  }, [rows, search, sort, types]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);

  const chart = useMemo(() => {
    if (yCol < 0) return null;
    const byX = new Map<string, number[]>();
    for (const [rowIndex, r] of dataRows.entries()) {
      const x = xCol < 0 ? `Row ${rowIndex + 1}` : r[xCol];
      const y = toNumber(r[yCol] ?? null);
      if (x == null || y === null) continue;
      const k = String(x);
      const values = byX.get(k) ?? [];
      values.push(y);
      byX.set(k, values);
    }
    let data = [...byX].map(([x, values]) => ({ x, v: aggregateValues(values, modes[yCol]) ?? 0 }));
    if (!data.length) return null;
    const isDate = types[xCol] === "date";
    if (isDate) data = data.sort((a, b) => a.x.localeCompare(b.x)).map((d) => ({ ...d, x: fmtDate(d.x) }));
    else data = data.sort((a, b) => b.v - a.v).slice(0, 15);
    return { data, isDate, more: !isDate && byX.size > 15 ? byX.size : 0 };
  }, [dataRows, xCol, yCol, types, modes]);

  const summary = numeric;
  const fmtCell = (v: Cell, i: number) => (v == null ? "" : typeof v === "number" ? (units[i] ? withUnit(v, units[i]!) : num(v)) : types[i] === "date" ? fmtDate(v) : v);
  const clickSort = (col: number) => {
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: types[col] === "number" ? -1 : 1 }));
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-3"><p className="text-[11px] text-fg-3">Rows</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{rows.length.toLocaleString()}</p></Card>
        <Card className="p-3"><p className="text-[11px] text-fg-3">Columns</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{columns.length}</p></Card>
        {summary.map((i) => (
          <Card key={i} className="p-3">
            <p className="truncate text-[11px] text-fg-3" title={columns[i]}>{modes[i]} · {columns[i]}</p>
            <p className="mt-0.5 truncate text-lg font-semibold tabular-nums">{agg(dataRows, i) == null ? "—" : withUnit(agg(dataRows, i)!, units[i]!)}</p>
          </Card>
        ))}
      </div>
      {numeric.length > 0 && <div className="no-print flex flex-wrap items-center gap-3 text-xs text-fg-3"><span>Aggregation</span><Select aria-label="Aggregation" value={aggregation} onChange={(e) => setAggregation(e.target.value as Aggregation | "auto")}><option value="auto">Suggested by column name</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></Select><span>Rates and unit costs use unweighted averages by default. Total rows are excluded. Review aggregation for your data.</span></div>}

      {numeric.length > 0 && (
        <Card>
          <CardHeader
            title="Chart"
            subtitle={chart?.more ? `Top 15 of ${chart.more} by ${columns[yCol]}` : undefined}
            action={
              <div className="no-print flex flex-wrap items-center gap-2 text-xs text-fg-3">
                <Select value={yCol} onChange={(e) => setYCol(Number(e.target.value))} className="w-40" aria-label="Value">
                  {numeric.map((i) => <option key={i} value={i}>{columns[i]}</option>)}
                </Select>
                by
                <Select value={xCol} onChange={(e) => setXCol(Number(e.target.value))} className="w-40" aria-label="Group by">
                  <option value={-1}>Row number</option>
                  {labels.map((i) => <option key={i} value={i}>{columns[i]}</option>)}
                </Select>
              </div>
            }
          />
          <div className="px-2 pb-3">
            {!chart ? <p className="px-2 py-10 text-center text-xs text-fg-3">No values to chart for these columns.</p>
              : chart.isDate ? <AreaTrend data={chart.data} x="x" series={[{ key: "v", label: columns[yCol]! }]} fmt={(v) => withUnit(v, units[yCol]!)} height={240} />
              : <Bars data={chart.data} x="x" series={[{ key: "v", label: columns[yCol]! }]} fmt={(v) => withUnit(v, units[yCol]!)} height={240} />}
          </div>
        </Card>
      )}

      {numeric.length > 1 && xCol >= 0 && <div className="grid gap-4 xl:grid-cols-2">{numeric.filter((i) => i !== yCol).slice(0, 2).map((i) => {
        const groups = new Map<string, number[]>();
        for (const r of dataRows) {
          const value = toNumber(r[i] ?? null);
          if (r[xCol] == null || value == null) continue;
          const key = String(r[xCol]);
          const values = groups.get(key) ?? [];
          values.push(value);
          groups.set(key, values);
        }
        const isDate = types[xCol] === "date";
        const data = [...groups].map(([x, values]) => ({ x, v: aggregateValues(values, modes[i]) ?? 0 })).sort((a, b) => isDate ? a.x.localeCompare(b.x) : b.v - a.v).slice(0, isDate ? groups.size : 15);
        return data.length ? <Card key={i}><CardHeader title={`${columns[i]} by ${columns[xCol]}`} subtitle={`${modes[i]}${!isDate && groups.size > 15 ? " · top 15 groups" : ""}`} /><div className="px-2 pb-3">{isDate ? <AreaTrend data={data} x="x" series={[{ key: "v", label: columns[i] }]} fmt={(v) => withUnit(v, units[i])} /> : <Bars data={data} x="x" series={[{ key: "v", label: columns[i] }]} fmt={(v) => withUnit(v, units[i])} />}</div></Card> : null;
      })}</div>}

      {!raw && <Card className="p-4"><p className="text-sm font-semibold">About this data</p><p className="mt-1 text-xs text-fg-2">{dataRows.filter((r) => r.some((v) => v != null)).length.toLocaleString()} populated rows excluding totals · {numeric.length} numeric columns · {rows.reduce((n, r) => n + columns.filter((_, i) => r[i] == null).length, 0).toLocaleString()} blank cells. {rows.length - dataRows.length} total rows excluded from calculations.</p><p className="mt-2 text-xs text-fg-3">Source: {fileName} / {table.name}. Blank values are excluded from calculations. Review header selection and aggregation for complex layouts; no historical comparisons or targets are inferred.</p></Card>}

      <Card>
        <CardHeader
          title={table.name}
          subtitle={search ? `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} rows match` : `${rows.length.toLocaleString()} rows`}
          action={
            <div className="no-print flex items-center gap-2">
              <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search rows…" className="w-48" />
              <Button size="xs" icon={<Download className="size-3" />} onClick={() => downloadFile(`${fileName.replace(/\.[^.]+$/, "")}-${table.name}.csv`.replace(/[\\/:*?"<>|\s]+/g, "-"), tableToCSV({ ...table, rows: visible }), "text/csv")}>CSV</Button>
            </div>
          }
        />
        <Table className="max-h-[560px] overflow-y-auto print:max-h-none">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <Th key={i} onClick={() => clickSort(i)} className={cn(types[i] === "number" && "text-right")}>
                  <span className="inline-flex items-center gap-1">{c}{sort?.col === i && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}</span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(printing ? visible : visible.slice(current * PAGE, (current + 1) * PAGE)).map((r, ri) => (
              <tr key={ri} className={cn(r.some(isTotalLabel) && "font-semibold")}>
                {columns.map((_, i) => <Td key={i} className={cn("max-w-72 truncate whitespace-nowrap", types[i] === "number" && "text-right")}><span title={String(r[i] ?? "")}>{fmtCell(r[i] ?? null, i)}</span></Td>)}
              </tr>
            ))}
            {!visible.length && <tr><Td colSpan={columns.length} className="text-center text-xs text-fg-3">{rows.length ? "No rows match your search." : "This table has headers but no rows."}</Td></tr>}
          </tbody>
          {numeric.length > 0 && visible.length > 1 && (
            <tfoot>
              <tr className="font-semibold">
                {columns.map((_, i) => (
                  <Td key={i} className={cn("whitespace-nowrap bg-surface-2/60", types[i] === "number" && "text-right")}>
                    {types[i] === "number" ? (() => { const v = agg(visible.filter((r) => !r.some(isTotalLabel)), i); return v == null ? "—" : `${withUnit(v, units[i]!)} (${modes[i]})`; })() : i === 0 ? (search ? "Summary (matching)" : "Summary") : ""}
                  </Td>
                ))}
              </tr>
            </tfoot>
          )}
        </Table>
        {pages > 1 && (
          <div className="no-print flex items-center justify-end gap-2 px-4 py-2 text-xs text-fg-3">
            Rows {(current * PAGE + 1).toLocaleString()}–{Math.min(visible.length, (current + 1) * PAGE).toLocaleString()} of {visible.length.toLocaleString()}
            <Button size="xs" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button size="xs" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
