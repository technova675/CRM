"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportFileDetail } from "@/lib/domain/reportFiles";
import { change, overviewData, presetRange, type Measure, type OverviewModel, type Totals } from "@/lib/domain/marketingOverview";
import { cn, compact, compactMoney, fmtShort } from "@/lib/utils";

// Marketing overview in the style of a Looker Studio report. Every number comes from the uploaded file.
const PALETTE = ["#4cc3ff", "#2f7df6", "#2dd4bf", "#8aa4ff", "#c084fc", "#7a93b3"];
const PRESETS: { value: string; label: string; days: number | null }[] = [{ value: "7", label: "Last 7 days", days: 7 }, { value: "30", label: "Last 30 days", days: 30 }, { value: "90", label: "Last 90 days", days: 90 }, { value: "all", label: "All data", days: null }, { value: "custom", label: "Custom range", days: null }];
const field = "h-8 rounded-md border border-white/20 bg-white px-2 text-[13px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 print:hidden";
const tooltipStyle = { background: "#071a35", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, fontSize: 12, color: "#eef5ff" };

type Metric = "cost" | "impressions" | "clicks" | "conversions" | "revenue" | "ctr" | "cpc" | "cpm" | "costPerConversion" | "conversionRate" | "roas";
const LABEL: Record<Metric, string> = { cost: "Cost", impressions: "Impressions", clicks: "Clicks", conversions: "Conversions", revenue: "Revenue", ctr: "CTR", cpc: "Avg. CPC", cpm: "Avg. CPM", costPerConversion: "Cost / Conv.", conversionRate: "Conv. rate", roas: "ROAS" };
const LOWER_IS_BETTER = new Set<Metric>(["cpc", "cpm", "costPerConversion"]);

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-[color:var(--mo-line)]! bg-[var(--mo-card)] p-3.5 shadow-[0_8px_24px_-16px_rgba(0,0,0,.6)] print:shadow-none", className)}>{children}</div>;
}

function Delta({ value, lowerIsBetter }: { value: number | undefined; lowerIsBetter?: boolean }) {
  if (value === undefined) return null;
  const good = lowerIsBetter ? value <= 0 : value >= 0;
  return <span className={cn("text-[11px] font-medium tabular-nums", good ? "text-emerald-400 print:text-emerald-700" : "text-rose-400 print:text-rose-700")} title="Compared with the previous period of the same length in this file">{value >= 0 ? "↑" : "↓"} {Math.abs(value).toFixed(1)}%</span>;
}

function Spark({ data, color = "#4cc3ff", label }: { data: number[]; color?: string; label: string }) {
  const id = useId();
  if (data.length < 2) return null;
  return <div role="img" aria-label={label} className="h-12 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.4} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
    <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#${id})`} isAnimationActive={false} />
  </AreaChart></ResponsiveContainer></div>;
}

function Trend({ data, name, format, kind = "area", color = "#4cc3ff" }: { data: { x: string; v: number }[]; name: string; format: (v: number) => string; kind?: "area" | "bars"; color?: string }) {
  const id = useId();
  if (data.length < 2) return <p className="grid h-36 place-items-center text-center text-xs text-[color:var(--mo-muted)]">A date column with more than one day is needed to chart {name.toLowerCase()} over time.</p>;
  const rows = data.map((d) => ({ x: fmtShort(d.x), v: d.v }));
  const axis = { fontSize: 10, fill: "var(--mo-muted)" };
  return <div role="img" aria-label={`${name} over time`} className="h-40 w-full"><ResponsiveContainer width="100%" height="100%">
    {kind === "bars"
      ? <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--mo-line)" /><XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v)} width={42} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.06)" }} formatter={(v) => [format(Number(v)), name]} /><Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} /></BarChart>
      : <AreaChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--mo-line)" /><XAxis dataKey="x" tick={axis} tickLine={false} axisLine={false} minTickGap={20} /><YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v)} width={42} /><Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(255,255,255,.3)" }} formatter={(v) => [format(Number(v)), name]} /><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} /></AreaChart>}
  </ResponsiveContainer></div>;
}

function HeatTable({ title, caption, columns, rows }: { title: string; caption: string; columns: { key: string; label: string; heat?: boolean }[]; rows: { name: string; cells: { text: string; raw: number | null }[] }[] }) {
  const max = columns.map((_, c) => Math.max(0, ...rows.map((r) => r.cells[c]?.raw ?? 0)));
  return <div>
    {title && <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[color:var(--mo-muted)]">{title}</h4>}
    <div className="overflow-x-auto rounded-lg border border-[color:var(--mo-line)]!"><table className="w-full min-w-[420px] border-collapse text-xs tabular-nums"><caption className="sr-only">{caption}</caption>
      <thead><tr className="bg-white/[.06] text-left text-[color:var(--mo-muted)] print:bg-slate-100"><th scope="col" className="w-7 px-2 py-1.5 font-medium">#</th><th scope="col" className="px-2 py-1.5 font-medium">Campaign</th>{columns.map((c) => <th key={c.key} scope="col" className="px-2 py-1.5 text-right font-medium">{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={row.name} className="border-t border-[color:var(--mo-line)]!"><td className="px-2 py-1.5 text-[color:var(--mo-muted)]">{i + 1}.</td><td className="max-w-40 truncate px-2 py-1.5" title={row.name}>{row.name}</td>
        {row.cells.map((cell, c) => { const pct = columns[c].heat && max[c] > 0 && cell.raw !== null ? Math.max(4, cell.raw / max[c] * 100) : 0; return <td key={columns[c].key} className="px-2 py-1.5 text-right" style={pct ? { background: `linear-gradient(90deg, rgba(76,195,255,.45) ${pct}%, transparent ${pct}%)` } : undefined}>{cell.text}</td>; })}</tr>)}</tbody>
    </table></div>
  </div>;
}

export function MarketingOverview({ file, models, children }: { file: ReportFileDetail; models: (OverviewModel | null)[]; children?: ReactNode }) {
  const eligible = useMemo(() => models.flatMap((model, index) => model ? [{ index, model }] : []), [models]);
  const [which, setWhich] = useState(() => eligible.reduce((best, item) => item.model.rows.length > (eligible.find((e) => e.index === best)?.model.rows.length ?? -1) ? item.index : best, eligible[0]?.index ?? 0));
  const model = models[which] ?? eligible[0]?.model;
  const bounds = model?.bounds ?? null;
  const span = bounds ? Math.round((Date.parse(bounds.max) - Date.parse(bounds.min)) / 86_400_000) + 1 : 0;
  const [preset, setPreset] = useState(span >= 60 ? "30" : "all");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [campaign, setCampaign] = useState("");
  const range = !bounds ? { from: null, to: null } : preset === "custom" && custom ? custom : presetRange(bounds, PRESETS.find((p) => p.value === preset)?.days ?? null);
  const data = useMemo(() => model ? overviewData(model, { campaigns: campaign ? [campaign] : null, ...range }) : null, [model, campaign, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!model || !data) return null;

  const { totals, previous, series } = data;
  const cur = model.currency;
  const money = (v: number) => { const a = Math.abs(v); return cur === "₹" && a >= 1e5 ? compactMoney(v) : a >= 1000 ? `${cur}${compact(v)}` : `${cur}${v.toFixed(2)}`; };
  const fmt: Record<Metric, (v: number) => string> = { cost: money, impressions: compact, clicks: compact, conversions: compact, revenue: money, ctr: (v) => `${v.toFixed(1)}%`, cpc: money, cpm: money, costPerConversion: money, conversionRate: (v) => `${v.toFixed(1)}%`, roas: (v) => v.toFixed(2) };
  const has = (m: Metric) => {
    if (m === "ctr") return model.measures.clicks !== undefined && model.measures.impressions !== undefined;
    if (m === "cpc") return model.measures.cost !== undefined && model.measures.clicks !== undefined;
    if (m === "cpm") return model.measures.cost !== undefined && model.measures.impressions !== undefined;
    if (m === "costPerConversion") return model.measures.cost !== undefined && model.measures.conversions !== undefined;
    if (m === "conversionRate") return model.measures.conversions !== undefined && model.measures.clicks !== undefined;
    if (m === "roas") return model.measures.cost !== undefined && model.measures.revenue !== undefined;
    return model.measures[m as Measure] !== undefined;
  };
  const value = (t: Totals, m: Metric) => t[m] as number | null;
  const seriesOf = (m: Metric) => series.flatMap((s) => value(s.totals, m) === null ? [] : [{ x: s.x, v: value(s.totals, m) as number }]);
  const tile = (m: Metric, big = false, wide = false) => {
    const v = value(totals, m);
    const d = change(v, previous ? value(previous, m) : undefined);
    return <Card key={m} className={cn("min-w-0", big && "flex flex-col justify-between", wide && "col-span-2")}>
      <p className="text-xs text-[color:var(--mo-muted)]">{big ? `Total ${LABEL[m]}` : LABEL[m]}</p>
      <p className={cn("mt-1 font-semibold tabular-nums tracking-tight", big ? "text-3xl" : "text-2xl")} title={v === null ? undefined : String(v)}>{v === null ? "—" : fmt[m](v)}</p>
      <div className="mt-0.5 min-h-4"><Delta value={d} lowerIsBetter={LOWER_IS_BETTER.has(m)} /></div>
      {big && <Spark data={seriesOf(m).map((s) => s.v)} label={`${LABEL[m]} by day`} />}
    </Card>;
  };
  const headline = (["clicks", "cost", "conversions", "impressions", "revenue"] as Metric[]).filter(has).slice(0, 3);
  const costGroup = (["cost", "impressions", "cpc", "cpm", "roas"] as Metric[]).filter(has);
  const clickGroup = (["clicks", "conversions", "ctr", "costPerConversion", "conversionRate"] as Metric[]).filter(has);
  const donutTotal = data.donut.reduce((n, d) => n + d.value, 0);
  const multi = data.campaignNames.length > 1;
  const top = data.campaigns.slice(0, 10);
  const byCost: { key: Metric; heat?: boolean }[] = (["cost", "costPerConversion", "roas", "conversions"] as Metric[]).filter(has).map((key) => ({ key, heat: key === "cost" || key === "conversions" }));
  const byReach: { key: Metric; heat?: boolean }[] = (["impressions", "clicks", "conversions"] as Metric[]).filter(has).map((key) => ({ key, heat: key === "impressions" }));
  const reach = [...data.campaigns].sort((a, b) => (b.impressions || b.clicks) - (a.impressions || a.clicks)).slice(0, 10);
  const rows = (list: typeof top, cols: { key: Metric }[]) => list.map((c) => ({ name: c.name, cells: cols.map(({ key }) => { const v = value(c, key); return { text: v === null ? "—" : fmt[key](v), raw: v }; }) }));
  const tableCols = (cols: { key: Metric; heat?: boolean }[]) => cols.map((c) => ({ key: c.key, label: LABEL[c.key], heat: c.heat }));
  const donutName = LABEL[data.donutMeasure];

  return <section aria-label="Marketing overview" className="print:[--mo-card:#f8fafc] print:[--mo-line:#cbd5e1] print:[--mo-muted:#475569] print:[--mo-text:#0f172a] print:bg-none print:bg-white [--mo-card:rgba(8,33,69,.72)] [--mo-line:rgba(255,255,255,.12)] [--mo-muted:#a9c2e3] [--mo-text:#eef5ff] relative overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_15%_0%,#2a6db8_0%,transparent_55%),linear-gradient(160deg,#0e3262,#081d3b)] p-4 text-[color:var(--mo-text)] sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h2 className="text-lg font-semibold tracking-tight">{file.companyName}</h2><p className="truncate text-xs text-[color:var(--mo-muted)]">{file.name} · {file.tables[which]?.name}{bounds ? ` · ${fmtShort(range.from ?? bounds.min)} – ${fmtShort(range.to ?? bounds.max)}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {eligible.length > 1 && <select aria-label="Data source" className={field} value={which} onChange={(e) => { setWhich(Number(e.target.value)); setCampaign(""); setPreset("all"); setCustom(null); }}>{eligible.map((e) => <option key={e.index} value={e.index}>{file.tables[e.index].name}</option>)}</select>}
        {multi && <select aria-label="Campaign" className={cn(field, "max-w-44")} value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">All campaigns</option>{data.campaignNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        {bounds && <>
          <select aria-label="Date range" className={field} value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value === "custom") setCustom({ from: range.from ?? bounds.min, to: range.to ?? bounds.max }); }}>{PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
          {preset === "custom" && custom && <><input aria-label="From date" type="date" className={field} min={bounds.min} max={custom.to} value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /><input aria-label="To date" type="date" className={field} min={custom.from} max={bounds.max} value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></>}
        </>}
      </div>
    </div>

    {data.campaigns.length === 0 ? <Card><p className="py-8 text-center text-sm text-[color:var(--mo-muted)]">No rows match these filters. Choose a different campaign or date range.</p></Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {headline.map((m) => <div key={m} className="lg:col-span-1">{tile(m, true)}</div>)}
        {data.donut.length > 0 && multi && <Card className="sm:col-span-2 lg:col-span-2"><div className="flex flex-wrap items-center gap-4">
          <div role="img" aria-label={`${donutName} by campaign`} className="relative h-40 w-40 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt[data.donutMeasure](Number(v)), donutName]} /><Pie data={data.donut} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="94%" paddingAngle={2} stroke="none" isAnimationActive={false}>{data.donut.map((d, i) => <Cell key={d.name} fill={d.name === "Others" ? PALETTE[5] : PALETTE[i % 5]} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[10px] leading-tight text-[color:var(--mo-muted)]">{donutName} by<br />campaign</p><p className="text-base font-semibold tabular-nums">{fmt[data.donutMeasure](donutTotal)}</p></div></div></div>
          <ul className="min-w-44 flex-1 space-y-1.5 text-xs">{data.donut.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.name === "Others" ? PALETTE[5] : PALETTE[i % 5] }} aria-hidden="true" /><span className="min-w-0 flex-1 truncate" title={d.name}>{d.name}</span><span className="tabular-nums text-[color:var(--mo-muted)]">{(d.value / donutTotal * 100).toFixed(0)}%</span></li>)}</ul>
        </div></Card>}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          {costGroup.length > 0 && <div className="min-w-0"><h3 className="text-base font-semibold">Cost &amp; Impressions</h3><p className="mb-2 text-[11px] text-[color:var(--mo-muted)]">{costGroup.map((m) => LABEL[m].toLowerCase()).join(", ")}</p>
            <div className="grid grid-cols-2 gap-2.5">{costGroup.map((m, i) => tile(m, false, i === costGroup.length - 1 && costGroup.length % 2 === 1))}</div>
            {has("impressions") && <Card className="mt-2.5"><p className="mb-1 text-[11px] text-[color:var(--mo-muted)]">Impressions</p><Trend data={seriesOf("impressions")} name="Impressions" format={fmt.impressions} /></Card>}</div>}
          {clickGroup.length > 0 && <div className="min-w-0"><h3 className="text-base font-semibold">Clicks &amp; Conversions</h3><p className="mb-2 text-[11px] text-[color:var(--mo-muted)]">{clickGroup.map((m) => LABEL[m].toLowerCase()).join(", ")}</p>
            <div className="grid grid-cols-2 gap-2.5">{clickGroup.map((m, i) => tile(m, false, i === clickGroup.length - 1 && clickGroup.length % 2 === 1))}</div>
            {(has("roas") || has("conversions")) && <Card className="mt-2.5"><p className="mb-1 text-[11px] text-[color:var(--mo-muted)]">{has("roas") ? "ROAS" : "Conversions"}</p><Trend kind={has("roas") ? "area" : "bars"} color={has("roas") ? "#2dd4bf" : "#4cc3ff"} data={seriesOf(has("roas") ? "roas" : "conversions")} name={has("roas") ? "ROAS" : "Conversions"} format={has("roas") ? fmt.roas : fmt.conversions} /></Card>}</div>}
        </div>
        {multi && <div className="min-w-0 space-y-4"><div><h3 className="text-base font-semibold">Top Campaigns</h3><p className="mb-2 text-[11px] text-[color:var(--mo-muted)]">by {byCost.map((c) => LABEL[c.key].toLowerCase()).join(", ")}</p><HeatTable title="" caption="Top campaigns by cost and conversions" columns={tableCols(byCost)} rows={rows(top, byCost)} /></div>
          <HeatTable title="by reach and engagement" caption="Campaigns by reach and engagement" columns={tableCols(byReach)} rows={rows(reach, byReach)} /></div>}
      </div>
      <p className="mt-4 text-[11px] leading-5 text-[color:var(--mo-muted)]">Calculated from your file{previous ? ", with changes against the previous period of the same length" : ". No previous period is available in this file, so no changes are shown"}. Ratios such as CTR, CPC, CPM and ROAS are computed from summed totals.</p>
    </>}
    {children && <div className="report-dark mt-6 border-t border-[color:var(--mo-line)]! pt-5">{children}</div>}
  </section>;
}
