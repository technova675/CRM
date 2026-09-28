"use client";

import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import { useCRM } from "@/lib/store";
import { compareMonths, metricDef, type MetricKey } from "@/lib/ai/analytics";
import { change } from "@/lib/ai/media";
import { Button, Card, CardHeader, EmptyState, InsightList } from "@/components/ui";
import { DeltaText } from "@/components/performance/shared";
import { fmtVal } from "./format";

const KEYS: MetricKey[] = ["spend", "leads", "conversions", "revenue", "cpa", "roas"];

export function MonthCompare({ clientId, onInvestigate }: { clientId: string; onInvestigate: (clientId: string) => void }) {
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const rows = useMemo(() => compareMonths(campaigns, clients).filter((r) => clientId === "All" || r.clientId === clientId), [campaigns, clients, clientId]);

  if (!rows.length) return <Card><EmptyState icon={<CalendarRange className="size-5" />} title="No campaign data to compare" /></Card>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-3">Last 30 days vs the previous 30 days, per client · source: campaign daily metrics from connected platforms.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.clientId}>
            <CardHeader title={r.client} subtitle="This month vs last month" action={<Button size="xs" variant="ghost" onClick={() => onInvestigate(r.clientId)}>AI Insights →</Button>} />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-border border-y border-border">
              {KEYS.map((k) => (
                <div key={k} className="bg-surface p-2.5 min-w-0">
                  <p className="text-[11px] text-fg-3">{metricDef(k).label}</p>
                  <p className="text-[13px] font-semibold tabular-nums truncate">{fmtVal(k, r.curr[k], true)}</p>
                  <p className="text-[11px]"><DeltaText value={change(r.prev[k], r.curr[k])} lowerBetter={metricDef(k).lowerBetter} /></p>
                </div>
              ))}
            </div>
            <div className="p-4"><InsightList items={r.summary} compact /></div>
          </Card>
        ))}
      </div>
    </div>
  );
}
