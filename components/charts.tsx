"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

type Row = Record<string, string | number>;
type Fmt = (v: number) => string;

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt?: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-2 shadow-pop text-xs">
      {label && <p className="mb-1 font-medium text-fg">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-fg-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium tabular-nums text-fg">{fmt ? fmt(p.value) : p.value.toLocaleString("en-IN")}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { tickLine: false, axisLine: false, fontSize: 11 } as const;

export function AreaTrend({ data, x, series, height = 220, fmt, stacked }: { data: Row[]; x: string; series: { key: string; label: string; color?: string }[]; height?: number; fmt?: Fmt; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color ?? CHART_COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} {...axis} minTickGap={24} />
        <YAxis {...axis} tickFormatter={(v) => (fmt ? fmt(v) : Intl.NumberFormat("en", { notation: "compact" }).format(v))} width={52} />
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: "var(--border-strong)" }} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId={stacked ? "1" : undefined} stroke={s.color ?? CHART_COLORS[i]} strokeWidth={2} fill={`url(#g-${s.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, series, height = 220, fmt, horizontal, stacked }: { data: Row[]; x: string; series: { key: string; label: string; color?: string }[]; height?: number; fmt?: Fmt; horizontal?: boolean; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} tickFormatter={(v) => (fmt ? fmt(v) : Intl.NumberFormat("en", { notation: "compact" }).format(v))} />
            <YAxis type="category" dataKey={x} {...axis} width={96} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} tickFormatter={(v) => (fmt ? fmt(v) : Intl.NumberFormat("en", { notation: "compact" }).format(v))} width={52} />
          </>
        )}
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: "var(--surface-2)" }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? "1" : undefined} fill={s.color ?? CHART_COLORS[i]} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, height = 220, fmt }: { data: Row[]; x: string; series: { key: string; label: string; color?: string }[]; height?: number; fmt?: Fmt }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} {...axis} minTickGap={24} />
        <YAxis {...axis} tickFormatter={(v) => (fmt ? fmt(v) : Intl.NumberFormat("en", { notation: "compact" }).format(v))} width={52} />
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: "var(--border-strong)" }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 200, fmt, center }: { data: { name: string; value: number }[]; height?: number; fmt?: Fmt; center?: ReactNode }) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<Tip fmt={fmt} />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; value?: ReactNode }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={it.label} className="flex items-center gap-2 text-xs">
          <span className="size-2 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
          <span className="flex-1 text-fg-2 truncate">{it.label}</span>
          {it.value !== undefined && <span className="font-medium tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Sparkline({ data, color = "var(--chart-1)", height = 32 }: { data: number[]; color?: string; height?: number }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sp-${color})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Aggregates campaign daily metrics across campaigns into one series.
export function aggregateMetrics(metrics: { date: string; spend: number; impressions: number; reach: number; clicks: number; leads: number; conversions: number; revenue: number }[]) {
  const map = new Map<string, { date: string; spend: number; impressions: number; reach: number; clicks: number; leads: number; conversions: number; revenue: number }>();
  for (const m of metrics) {
    const cur = map.get(m.date) ?? { date: m.date, spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, conversions: 0, revenue: 0 };
    cur.spend += m.spend;
    cur.impressions += m.impressions;
    cur.reach += m.reach;
    cur.clicks += m.clicks;
    cur.leads += m.leads;
    cur.conversions += m.conversions;
    cur.revenue += m.revenue;
    map.set(m.date, cur);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function totals(rows: ReturnType<typeof aggregateMetrics>) {
  const t = rows.reduce(
    (a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, reach: a.reach + r.reach, clicks: a.clicks + r.clicks, leads: a.leads + r.leads, conversions: a.conversions + r.conversions, revenue: a.revenue + r.revenue }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, conversions: 0, revenue: 0 },
  );
  return {
    ...t,
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
    cpc: t.clicks ? t.spend / t.clicks : 0,
    cpa: t.conversions ? t.spend / t.conversions : 0,
    roas: t.spend ? t.revenue / t.spend : 0,
  };
}
