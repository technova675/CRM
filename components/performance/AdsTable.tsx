"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import type { Campaign, Client } from "@/lib/types";
import { PLATFORM_INTEGRATION, PLATFORM_LABEL, type AdAnalysis, type AdSignal } from "@/lib/ai/media";
import { compact, money, pct } from "@/lib/utils";
import { Sparkline } from "@/components/charts";
import { Badge, EmptyState, Segmented, Table, Td, Th } from "@/components/ui";
import { DeltaText, SignalBadges } from "./shared";

type SortKey = "name" | "spend" | "impressions" | "reach" | "ctr" | "cpc" | "cpm" | "leads" | "conversions" | "cpa" | "roas" | "revenue" | "frequency" | "dcpa";
const COLS: { key: SortKey; label: string; lowerBetter?: boolean }[] = [
  { key: "spend", label: "Spend" },
  { key: "impressions", label: "Impr." },
  { key: "reach", label: "Reach (est.)" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC", lowerBetter: true },
  { key: "cpm", label: "CPM", lowerBetter: true },
  { key: "leads", label: "Leads" },
  { key: "conversions", label: "Conv." },
  { key: "cpa", label: "CPA", lowerBetter: true },
  { key: "dcpa", label: "CPA WoW", lowerBetter: true },
  { key: "roas", label: "ROAS" },
  { key: "revenue", label: "Revenue" },
  { key: "frequency", label: "Freq." },
];

const val = (a: AdAnalysis, k: SortKey): number | string => {
  if (k === "name") return a.ad.name;
  if (k === "frequency") return a.ad.frequency;
  if (k === "dcpa") return Number.isFinite(a.d.cpa) ? a.d.cpa : 9999;
  return a.curr[k];
};

const fmt = (a: AdAnalysis, k: SortKey) => {
  const m = a.curr;
  switch (k) {
    case "spend": case "cpc": case "cpm": case "revenue": return money(m[k]);
    case "cpa": return m.conversions ? money(m.cpa) : "—";
    case "ctr": return pct(m.ctr, 2);
    case "roas": return `${m.roas.toFixed(2)}x`;
    case "frequency": return a.ad.frequency.toFixed(1);
    case "impressions": case "reach": case "leads": case "conversions": return compact(m[k]);
    default: return "";
  }
};

export function AdsTable({ analyses, campaigns, clients, connected }: { analyses: AdAnalysis[]; campaigns: Campaign[]; clients: Client[]; connected: string[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const [signal, setSignal] = useState<AdSignal | "All">("All");
  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.company])), [clients]);

  const rows = useMemo(() => {
    const list = signal === "All" ? analyses : analyses.filter((a) => a.signals.includes(signal));
    return [...list].sort((a, b) => {
      const x = val(a, sort.key);
      const y = val(b, sort.key);
      return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir;
    });
  }, [analyses, signal, sort]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    analyses.forEach((a) => a.signals.forEach((s) => (m[s] = (m[s] ?? 0) + 1)));
    return m;
  }, [analyses]);

  const head = (key: SortKey, label: string, className?: string) => (
    <Th className={className} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </span>
    </Th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
        <Segmented
          value={signal}
          onChange={setSignal}
          options={(["All", "Winner", "Scaling", "Loser", "Fatigue", "Rising CPA"] as const).map((s) => ({ value: s, label: s === "All" ? `All ${analyses.length}` : `${s} ${counts[s] ?? 0}` }))}
          className="overflow-x-auto max-w-full"
        />
        <span className="ml-auto text-[11px] text-fg-3">This week (7d) · deltas vs last week · click a column to sort</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<BarChart3 className="size-5" />} title="No ads match these filters" />
      ) : (
        <Table className="max-h-[560px]">
          <thead>
            <tr>
              {head("name", "Ad")}
              <Th>Status</Th>
              {COLS.map((c) => head(c.key, c.label, "text-right"))}
              <Th className="w-28">Campaign trend 14d</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const c = campaignById.get(a.ad.campaignId);
              const sample = !connected.includes(PLATFORM_INTEGRATION[a.ad.platform]);
              return (
                <tr key={a.ad.id} className="hover:bg-surface-2/60">
                  <Td className="min-w-56">
                    <p className="font-medium truncate max-w-72" title={a.ad.name}>{a.ad.name}</p>
                    <p className="text-[11px] text-fg-3 truncate max-w-72">
                      {clientName.get(a.ad.clientId)} · {PLATFORM_LABEL[a.ad.platform]} · {a.ad.format} · {a.ad.audience}
                    </p>
                    <div className="mt-0.5 flex gap-1">
                      {a.ad.status === "Paused" && <Badge tone="warning">Paused</Badge>}
                      {sample && <Badge tone="neutral">Sample</Badge>}
                    </div>
                  </Td>
                  <Td><SignalBadges signals={a.signals} /></Td>
                  {COLS.map((col) => (
                    <Td key={col.key} className="text-right tabular-nums whitespace-nowrap">
                      {col.key === "dcpa" ? <DeltaText value={a.d.cpa} lowerBetter /> : (
                        <>
                          <span>{fmt(a, col.key)}</span>
                          {(col.key === "ctr" || col.key === "roas" || col.key === "spend") && (
                            <span className="block text-[10px]"><DeltaText value={a.d[col.key]} lowerBetter={col.lowerBetter} /></span>
                          )}
                        </>
                      )}
                    </Td>
                  ))}
                  <Td>{c?.metrics.length ? <Sparkline data={c.metrics.slice(-14).map((m) => m.conversions)} height={28} /> : <span className="text-xs text-fg-3">—</span>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
