"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Activity, FileSpreadsheet, Hash, TrendingUp } from "lucide-react";
import { AreaTrend, Bars, Donut } from "@/components/charts";
import { Card, CardHeader, Select, Stat, Table, Tabs, Td, Th } from "@/components/ui";
import { ReportDataTables } from "./ReportDataTables";
import { MarketingOverview } from "./MarketingOverview";
import { overviewModel } from "@/lib/domain/marketingOverview";
import { dashboardDistribution, dashboardSeries, dashboardSheet, type DashboardMetric, type DashboardSheet } from "@/lib/domain/workbookDashboard";
import { reportShares } from "@/lib/domain/reportView";
import type { ReportFileDetail } from "@/lib/domain/reportFiles";
import { cn, compact, fmtShort } from "@/lib/utils";

const format = (value: number, unit = "") => `${unit === "%" ? "" : unit}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${unit === "%" ? "%" : ""}`;
const short = (value: number, unit = "") => `${unit === "%" ? "" : unit}${compact(value)}${unit === "%" ? "%" : ""}`;
const modeLabel = (metric: DashboardMetric) => (metric.mode === "average" ? "Average" : metric.mode === "sum" ? "Total" : metric.mode === "min" ? "Minimum" : "Maximum");
const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function MetricStat({ metric, source }: { metric: DashboardMetric; source: string }) {
  const full = format(metric.value, metric.unit);
  return <Stat label={metric.label} value={<span title={full}>{full.length > 10 ? short(metric.value, metric.unit) : full}</span>} icon={metric.mode === "average" ? <Activity className="size-3.5" /> : <TrendingUp className="size-3.5" />} hint={`${modeLabel(metric)} · ${source}`} />;
}

function ChartValues({ data, metric, dimension }: { data: { x: string; v: number }[]; metric: string; dimension: string }) {
  return <details className="mt-3 border-t border-border pt-1 text-xs"><summary className="cursor-pointer py-2 text-fg-3 hover:text-fg-2">View chart values · {data.length.toLocaleString()} groups</summary>
    <div className="max-h-60 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{metric} by {dimension}</caption><thead><tr><th scope="col" className="py-1.5 font-medium text-fg-3">{dimension}</th><th scope="col" className="py-1.5 text-right font-medium text-fg-3">{metric}</th></tr></thead>
      <tbody>{data.map((item) => <tr key={item.x} className="border-t border-border"><td className="py-1.5 pr-3 break-words">{item.x}</td><td className="py-1.5 text-right tabular-nums">{format(item.v)}</td></tr>)}</tbody></table></div></details>;
}

function SheetPanel({ sheet, index }: { sheet: DashboardSheet; index: number }) {
  const [metricColumn, setMetricColumn] = useState(sheet.metrics[0]?.column ?? -1);
  const [dimension, setDimension] = useState(sheet.date >= 0 ? sheet.date : sheet.category);
  const metric = sheet.metrics.find((item) => item.column === metricColumn) ?? sheet.metrics[0];
  const series = useMemo(() => metric && dimension >= 0 ? dashboardSeries(sheet, metric, dimension) : [], [sheet, metric, dimension]);
  const distribution = useMemo(() => metric ? dashboardDistribution(sheet, metric) : [], [sheet, metric]);
  const isDate = sheet.types[dimension] === "date";
  const plotted = useMemo(() => isDate ? series.map((item) => ({ ...item, x: fmtShort(item.x) })) : series.slice(0, 8), [series, isDate]);
  const shareAllowed = !isDate && series.length > 1 && metric?.mode === "sum" && series.every((item) => item.v >= 0) && series.some((item) => item.v > 0);
  const shares = shareAllowed ? reportShares(series) : [];
  const shareTotal = shares.reduce((sum, item) => sum + item.v, 0);
  const color = palette[index % palette.length];

  if (!metric) return <Card><div className="flex items-start gap-3 p-5"><span className="rounded-md bg-surface-2 p-1.5 text-fg-3"><FileSpreadsheet className="size-4" aria-hidden="true" /></span><div><p className="text-sm font-medium">{sheet.rows.length ? "Text and identifiers only" : "No populated data rows"}</p><p className="mt-1 max-w-xl text-xs leading-5 text-fg-3">{sheet.rows.length ? `“${sheet.name}” has no numeric columns to chart. Its full contents are in Source data.` : `“${sheet.name}” has no chartable values. Check its source data or header selection.`}</p></div></div></Card>;

  const title = dimension < 0 ? `${metric.label} distribution` : `${metric.label} ${isDate ? "over time" : "by " + sheet.columns[dimension]}`;
  const subtitle = dimension < 0 ? "Rows in each value range" : `${modeLabel(metric)}${metric.mode === "average" ? " (unweighted)" : ""} · ${!isDate && series.length > 8 ? `top 8 of ${series.length} groups` : `${series.length} groups`}`;
  const tick = (value: number) => short(value, metric.unit);
  const full = (value: number) => format(value, metric.unit);

  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-wrap [&>div:first-child]:min-w-48 [&>div:first-child]:flex-1" title={title} subtitle={subtitle} action={<div className="flex flex-wrap justify-end gap-2 print:hidden">
          <div className="w-36"><Select aria-label="Metric" value={metric.column} onChange={(event) => setMetricColumn(Number(event.target.value))}>{sheet.metrics.map((item) => <option key={item.column} value={item.column}>{item.label}</option>)}</Select></div>
          <div className="w-36"><Select aria-label="Group by" value={dimension} onChange={(event) => setDimension(Number(event.target.value))}><option value={-1}>Value distribution</option>{sheet.types.flatMap((type, i) => type !== "number" ? [<option key={i} value={i}>{sheet.columns[i]}</option>] : [])}</Select></div>
        </div>} />
        <div className="px-3 pb-4">
          {dimension < 0 ? <Bars data={distribution} x="x" series={[{ key: "v", label: "Rows", color }]} height={260} />
            : !series.length ? <p className="grid min-h-48 place-items-center px-6 text-center text-xs leading-5 text-fg-3">No values match this grouping. Choose another group or view the source rows.</p>
            : isDate ? <AreaTrend data={plotted} x="x" series={[{ key: "v", label: metric.label, color }]} fmt={full} tickFmt={tick} height={260} />
            : <Bars data={plotted} x="x" series={[{ key: "v", label: metric.label, color }]} horizontal fmt={full} tickFmt={tick} height={Math.max(240, plotted.length * 34 + 30)} />}
          <ChartValues data={dimension < 0 ? distribution : series} metric={dimension < 0 ? "Rows" : `${metric.label}${metric.unit ? ` (${metric.unit})` : ""}`} dimension={dimension < 0 ? "Value range" : sheet.columns[dimension]} />
        </div>
      </Card>
      <Card>
        <CardHeader title={shareAllowed ? "Where the total comes from" : "Behind the numbers"} subtitle={shareAllowed ? `${metric.label} · share by ${sheet.columns[dimension]}` : `${metric.label} · range and spread`} />
        <div className="px-4 pb-4">
          {shareAllowed ? <>
            <Donut height={180} data={shares.map((item) => ({ name: item.x, value: item.v }))} fmt={full} center={<div><p className="text-[11px] text-fg-3">Total</p><p className="max-w-28 break-words text-lg font-semibold tabular-nums">{short(shareTotal, metric.unit)}</p></div>} />
            <ul className="mt-3 space-y-1.5">{shares.map((item, i) => <li key={item.x} className="flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-sm" style={{ background: `var(--chart-${(i % 6) + 1})` }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-fg-2" title={item.x}>{item.x}</span>
              <span className="shrink-0 font-medium tabular-nums">{full(item.v)}<span className="text-fg-3"> · {format(item.v / shareTotal * 100)}%</span></span>
            </li>)}</ul></>
            : <><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-border p-3"><p className="text-[11px] text-fg-3">Minimum</p><p className="mt-1 break-words text-lg font-semibold tabular-nums">{full(metric.min)}</p></div><div className="rounded-lg border border-border p-3"><p className="text-[11px] text-fg-3">Maximum</p><p className="mt-1 break-words text-lg font-semibold tabular-nums">{full(metric.max)}</p></div></div>
              <div className="mt-3"><Bars data={distribution} x="x" series={[{ key: "v", label: "Rows", color: "var(--chart-3)" }]} height={190} /></div></>}
        </div>
      </Card>
    </div>
    <Card>
      <CardHeader title="Metric summary" subtitle={`${sheet.rows.length.toLocaleString()} data rows · ${sheet.metrics.length} numeric ${sheet.metrics.length === 1 ? "column" : "columns"}${sheet.totalRows ? ` · ${sheet.totalRows} total ${sheet.totalRows === 1 ? "row" : "rows"} excluded` : ""}`} />
      <Table className="max-h-80 overflow-y-auto print:max-h-none">
        <thead><tr><Th>Metric</Th><Th className="text-right">Value</Th><Th className="text-right">Minimum</Th><Th className="text-right">Maximum</Th><Th className="text-right">Values</Th></tr></thead>
        <tbody className="tabular-nums">{sheet.metrics.map((item) => <tr key={item.column}>
          <Td className="font-medium">{item.label}</Td>
          <Td className="text-right">{format(item.value, item.unit)} <span className="text-xs text-fg-3">{item.mode === "sum" ? "total" : item.mode === "average" ? "avg" : item.mode}</span></Td>
          <Td className="text-right text-fg-2">{format(item.min, item.unit)}</Td><Td className="text-right text-fg-2">{format(item.max, item.unit)}</Td><Td className="text-right text-fg-2">{item.count.toLocaleString()}</Td>
        </tr>)}</tbody>
      </Table>
    </Card>
  </div>;
}

export function WorkbookDashboard({ file }: { file: ReportFileDetail }) {
  const sheets = useMemo(() => file.tables.map(dashboardSheet), [file]);
  const [tab, setTab] = useState(() => String(Math.max(0, sheets.findIndex((sheet) => sheet.metrics.length))));
  const [printing, setPrinting] = useState(false);
  const models = useMemo(() => file.tables.map(overviewModel), [file]);
  const hasOverview = models.some(Boolean);
  const [view, setView] = useState<"overview" | "analysis">(hasOverview ? "overview" : "analysis");
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  const featured = useMemo(() => {
    const result: { metric: DashboardMetric; source: string }[] = [];
    const max = Math.max(0, ...sheets.map((sheet) => sheet.metrics.length));
    for (let column = 0; column < max && result.length < 6; column++) for (const sheet of sheets) {
      if (sheet.metrics[column] && result.length < 6) result.push({ metric: sheet.metrics[column], source: sheet.name });
    }
    return result;
  }, [sheets]);
  const kind = file.kind === "pptx" ? "slide" : file.kind === "pdf" ? "page" : "sheet";
  const tabs = file.tables.map((table, i) => ({ value: String(i), label: table.name.length > 30 ? `${table.name.slice(0, 29)}…` : table.name, count: sheets[i].rows.length }));
  const current = tabs.some((item) => item.value === tab) ? tab : tabs[0].value;
  const sections = printing ? sheets.map((_, i) => String(i)) : [current];
  const data = <ReportDataTables file={file} showAll={printing} />;

  return <div className="space-y-5">
    {hasOverview && <div className="flex justify-end print:hidden"><div role="group" aria-label="Report view" className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-[13px] font-medium">{(["overview", "analysis"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-7 rounded-md px-3 transition", view === v ? "bg-accent text-white" : "text-fg-3 hover:text-fg")}>{v === "overview" ? "Overview" : "Analysis"}</button>)}</div></div>}
    {hasOverview && view === "overview" ? <MarketingOverview file={file} models={models}>{data}</MarketingOverview> : <>
    {featured.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Report highlights">{featured.map(({ metric, source }, i) => <MetricStat key={`${i}-${source}-${metric.column}`} metric={metric} source={source} />)}</div>}
    <div className="print:hidden"><Tabs value={current} onChange={setTab} tabs={tabs} /></div>
    {sections.map((section) => <section key={section} aria-label={file.tables[Number(section)]?.name} className={cn(printing && "break-inside-avoid-page")}>
      {printing && <h2 className="mb-2 mt-4 text-sm font-semibold">{file.tables[Number(section)]?.name}</h2>}
      <SheetPanel key={file.tables[Number(section)].id} sheet={sheets[Number(section)]} index={Number(section)} />
    </section>)}
    <p className="flex items-start gap-2 text-[11px] leading-5 text-fg-3"><Hash className="mt-0.5 size-3 shrink-0" aria-hidden="true" />Calculated from your file. Total rows and missing values are excluded, zeros are kept, figures from different {kind}s are never added together, and rates use unweighted averages.</p>
    <div className="border-t border-border pt-5">{data}</div>
    </>}
  </div>;
}
