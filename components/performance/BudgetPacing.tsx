"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Campaign, Client } from "@/lib/types";
import { campaignPacing } from "@/lib/ai/media";
import { compactMoney } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, Progress } from "@/components/ui";

export function BudgetPacing({ campaigns, clients }: { campaigns: Campaign[]; clients: Client[] }) {
  const rows = useMemo(
    () =>
      campaigns
        .filter((c) => c.status === "Active" && c.metrics.length)
        .map((c) => ({ c, p: campaignPacing(c) }))
        .sort((a, b) => Math.abs(b.p.pct - 100) - Math.abs(a.p.pct - 100)),
    [campaigns],
  );
  const name = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  return (
    <Card>
      <CardHeader title="Budget pacing" subtitle={rows[0] ? `Month to date (day ${rows[0].p.day} of ${rows[0].p.daysInMonth}) · spend vs monthly budget` : "Spend vs monthly budget"} />
      {rows.length === 0 ? (
        <EmptyState title="No active campaigns with spend data" />
      ) : (
        <div className="px-4 pb-4 space-y-3 max-h-[420px] overflow-y-auto">
          {rows.map(({ c, p }) => {
            const tone = p.state === "Over" ? "danger" : p.state === "Under" ? "warning" : "success";
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <Link href={`/campaigns?c=${c.id}`} className="min-w-0 truncate hover:underline">
                    <span className="font-medium">{c.service}</span> <span className="text-fg-3 text-xs">· {name(c.clientId)}</span>
                  </Link>
                  <Badge tone={tone}>{p.state}</Badge>
                </div>
                <div className="relative mt-1.5">
                  <Progress value={(p.mtdSpend / Math.max(1, c.budget)) * 100} tone={tone} />
                  {/* expected-by-today marker */}
                  <span className="absolute -top-0.5 h-2.5 w-px bg-fg-2" style={{ left: `${Math.min(100, (p.expectedMtd / Math.max(1, c.budget)) * 100)}%` }} title="Expected by today" />
                </div>
                <p className="mt-1 text-[11px] text-fg-3 tabular-nums">
                  {compactMoney(p.mtdSpend)} of {compactMoney(c.budget)} · expected {compactMoney(p.expectedMtd)} · projected {compactMoney(p.projected)} ({p.pct.toFixed(0)}%)
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
