"use client";

import { useMemo, useState } from "react";
import { Bookmark, Download, Table2, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import { AD_LEVEL_DIMS, DIMENSIONS, METRIC_DEFS, explore, metricDef, type Dimension, type MetricKey, type PivotRow } from "@/lib/ai/analytics";
import { change } from "@/lib/ai/media";
import { downloadFile, toCSV, uid } from "@/lib/utils";
import { Bars, Lines } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Segmented, Select, Table, Td, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { DeltaText } from "@/components/performance/shared";
import { fmtVal, readLocal, writeLocal } from "./format";

type Days = "7" | "30" | "60";
interface SavedExploreView {
  id: string;
  name: string;
  dimension: Dimension;
  metric: MetricKey;
  days: Days;
  compare: boolean;
}
const VIEWS_KEY = "adbibe.analytics.views.v1";
const TABLE_COLS: MetricKey[] = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "leads", "conversions", "cvr", "cpa", "revenue", "roas"];

export function Explorer({ clientId }: { clientId: string }) {
  const campaigns = useCRM((s) => s.campaigns);
  const ads = useCRM((s) => s.ads);
  const clients = useCRM((s) => s.clients);
  const [dimension, setDimension] = useState<Dimension>("Platform");
  const [metric, setMetric] = useState<MetricKey>("cpa");
  const [days, setDays] = useState<Days>("30");
  const [compare, setCompare] = useState(true);
  const [views, setViews] = useState<SavedExploreView[]>(() => readLocal<SavedExploreView[]>(VIEWS_KEY, []));
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");

  // Anchor the date range to the latest synced day rather than the wall clock.
  const asOf = useMemo(() => {
    const last = campaigns.reduce((m, c) => {
      const d = c.metrics[c.metrics.length - 1]?.date;
      return d && d > m ? d : m;
    }, "");
    return last ? `${last}T12:00:00.000Z` : "2026-01-01T12:00:00.000Z";
  }, [campaigns]);

  const adLevel = AD_LEVEL_DIMS.includes(dimension);
  const effDays = adLevel ? 7 : Number(days);
  const res = useMemo(() => explore({ campaigns, ads, clients, clientId, dimension, metric, days: effDays, asOf }), [campaigns, ads, clients, clientId, dimension, metric, effDays, asOf]);
  const showPrev = compare && res.prevAvailable;
  const def = metricDef(metric);

  const rows = useMemo(() => (dimension === "Date" ? res.rows : [...res.rows].sort((a, b) => b.curr[metric] - a.curr[metric])), [res.rows, dimension, metric]);

  const saveView = () => {
    const v: SavedExploreView = { id: uid("sv"), name: viewName.trim() || `${dimension} × ${def.label} · ${effDays}d`, dimension, metric, days, compare };
    const next = [v, ...views].slice(0, 12);
    setViews(next);
    writeLocal(VIEWS_KEY, next);
    setSaving(false);
    setViewName("");
    toast("View saved", v.name);
  };
  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    writeLocal(VIEWS_KEY, next);
  };
  const applyView = (v: SavedExploreView) => {
    setDimension(v.dimension);
    setMetric(v.metric);
    setDays(v.days);
    setCompare(v.compare);
  };

  const pivotCsv = () => {
    const toRow = (r: PivotRow) => ({
      [dimension]: r.key,
      ...Object.fromEntries(TABLE_COLS.map((k) => [k, +r.curr[k].toFixed(2)])),
      ...(showPrev ? { [`${metric}_previous`]: +r.prev[metric].toFixed(2), [`${metric}_change_pct`]: Number.isFinite(change(r.prev[metric], r.curr[metric])) ? +change(r.prev[metric], r.curr[metric]).toFixed(1) : "" } : {}),
    });
    const csv = toCSV([...rows.map(toRow), toRow({ key: "Total", curr: res.total.curr, prev: res.total.prev })]);
    downloadFile(`analytics-${dimension.toLowerCase()}-${effDays}d.csv`, csv, "text/csv");
  };
  const unifiedCsv = () => {
    const csv = toCSV(res.unified.map((r) => ({ ...r, ctr: r.impressions ? +((r.clicks / r.impressions) * 100).toFixed(2) : 0, cpa: r.conversions ? Math.round(r.spend / r.conversions) : "", roas: r.spend ? +(r.revenue / r.spend).toFixed(2) : "" })));
    downloadFile(`unified-metrics-${res.grain}.csv`, csv, "text/csv");
  };

  const series = [
    { key: "curr", label: adLevel ? "This week" : `Last ${effDays} days` },
    ...(showPrev ? [{ key: "prev", label: adLevel ? "Last week" : `Previous ${effDays} days`, color: "var(--chart-6)" }] : []),
  ];
  const chartFmt = (v: number) => fmtVal(metric, v, true);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Field label="View by" className="w-full sm:w-40">
            <Select value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}>
              {DIMENSIONS.map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Metric" className="w-full sm:w-36">
            <Select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
              {METRIC_DEFS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Date range">
            <Segmented value={adLevel ? "7" : days} onChange={(v) => !adLevel && setDays(v)} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }]} />
          </Field>
          <label className="flex items-center gap-2 h-8 text-xs text-fg-2">
            <Toggle checked={compare} onChange={setCompare} label="Compare to previous period" /> Compare to previous period
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" icon={<Bookmark className="size-3.5" />} onClick={() => setSaving(true)}>Save view</Button>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={pivotCsv}>Export CSV</Button>
            <Button size="sm" variant="ghost" icon={<Table2 className="size-3.5" />} onClick={unifiedCsv} title="Download the normalised rows behind this view">Unified rows</Button>
          </div>
        </div>
        {views.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
            <span className="text-[11px] text-fg-3 mr-1">Saved views:</span>
            {views.map((v) => (
              <span key={v.id} className="inline-flex items-center rounded-full border border-border bg-surface text-xs">
                <button onClick={() => applyView(v)} className="pl-2.5 pr-1 py-0.5 hover:text-accent-text">{v.name}</button>
                <button onClick={() => removeView(v.id)} className="pr-1.5 text-fg-3 hover:text-danger" aria-label={`Remove ${v.name}`}><X className="size-3" /></button>
              </span>
            ))}
          </div>
        )}
        {res.notes.length > 0 && (
          <div className="border-t border-border px-3 py-2 space-y-0.5">
            {res.notes.map((n) => <p key={n} className="text-[11px] text-fg-3"><Badge tone="info" className="mr-1">Note</Badge>{n}</p>)}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["spend", "conversions", "cpa", "roas"] as MetricKey[]).map((k) => (
          <Card key={k} className="p-3">
            <p className="text-xs text-fg-3">{metricDef(k).label} · {adLevel ? "7d" : `${effDays}d`}</p>
            <p className="text-xl font-semibold tabular-nums mt-1">{fmtVal(k, res.total.curr[k], true)}</p>
            {showPrev && <p className="text-xs"><DeltaText value={change(res.total.prev[k], res.total.curr[k])} lowerBetter={metricDef(k).lowerBetter} /> <span className="text-fg-3">vs previous</span></p>}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title={`${def.label} by ${dimension.toLowerCase()}`} subtitle={dimension === "Date" ? "Daily, previous period aligned by day" : "Top 12 by selected metric"} />
        <div className="px-2 pb-3">
          {res.series.length === 0 ? (
            <EmptyState title="No data for this selection" />
          ) : dimension === "Date" ? (
            <Lines data={res.series} x="label" series={series} fmt={chartFmt} height={260} />
          ) : (
            <Bars data={res.series} x="label" series={series} fmt={chartFmt} horizontal height={Math.max(200, res.series.length * 30)} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Pivot table" subtitle={`${rows.length} rows · totals and ${def.label} change vs previous period`} />
        {rows.length === 0 ? (
          <EmptyState title="No rows" />
        ) : (
          <Table className="max-h-[520px]">
            <thead>
              <tr>
                <Th>{dimension}</Th>
                {TABLE_COLS.map((k) => <Th key={k} className={k === metric ? "text-right text-fg" : "text-right"}>{metricDef(k).label}</Th>)}
                {showPrev && <Th className="text-right">{def.label} Δ</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="hover:bg-surface-2/60">
                  <Td className="max-w-64 truncate font-medium" >{r.key}</Td>
                  {TABLE_COLS.map((k) => <Td key={k} className={k === metric ? "text-right tabular-nums font-semibold" : "text-right tabular-nums text-fg-2"}>{fmtVal(k, r.curr[k], true)}</Td>)}
                  {showPrev && <Td className="text-right"><DeltaText value={change(r.prev[metric], r.curr[metric])} lowerBetter={def.lowerBetter} /></Td>}
                </tr>
              ))}
              <tr className="bg-surface-2/60 font-semibold">
                <Td>Total</Td>
                {TABLE_COLS.map((k) => <Td key={k} className="text-right tabular-nums">{fmtVal(k, res.total.curr[k], true)}</Td>)}
                {showPrev && <Td className="text-right"><DeltaText value={change(res.total.prev[metric], res.total.curr[metric])} lowerBetter={def.lowerBetter} /></Td>}
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={saving} onClose={() => setSaving(false)} title="Save view" size="sm" footer={<><Button onClick={() => setSaving(false)}>Cancel</Button><Button variant="primary" onClick={saveView}>Save</Button></>}>
        <Field label="Name" hint="Saved in this browser">
          <Input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={`${dimension} × ${def.label} · ${effDays}d`} onKeyDown={(e) => e.key === "Enter" && saveView()} />
        </Field>
      </Modal>
    </div>
  );
}
