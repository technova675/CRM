"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Database, ExternalLink } from "lucide-react";
import { useCRM } from "@/lib/store";
import { crmMetrics } from "@/lib/ai/analytics";
import { cn, compactMoney, relTime } from "@/lib/utils";
import { Card, CardHeader, StatusBadge } from "@/components/ui";

const SOURCES: { label: string; keys: string[]; what: string }[] = [
  { label: "Meta Ads", keys: ["meta"], what: "Spend, reach, ads" },
  { label: "Google Ads", keys: ["google_ads"], what: "Search, PMax, YouTube" },
  { label: "Google Analytics", keys: ["ga4"], what: "Sessions, conversions" },
  { label: "Search Console", keys: ["gsc"], what: "Queries, clicks" },
  { label: "LinkedIn Ads", keys: ["linkedin_ads"], what: "B2B campaigns" },
  { label: "Ecommerce", keys: ["shopify", "woocommerce"], what: "Orders, revenue" },
  { label: "Retail media", keys: ["amazon_ads"], what: "Sponsored products" },
  { label: "Quick commerce", keys: ["blinkit"], what: "Blinkit / Zepto ads" },
  { label: "Website analytics", keys: ["ga4"], what: "Landing-page CVR" },
];

export function Sources({ hideCrm }: { hideCrm?: boolean }) {
  const integrations = useCRM((s) => s.integrations);
  const leads = useCRM((s) => s.leads);
  const deals = useCRM((s) => s.deals);
  const crm = useMemo(() => crmMetrics(leads, deals, 30), [leads, deals]);
  return (
    <Card>
      <CardHeader title="Data sources" subtitle="Unified metrics layer — every source normalised to one row shape" action={<Link href="/integrations" className="text-xs text-accent-text hover:underline inline-flex items-center gap-1">Integrations <ExternalLink className="size-3" /></Link>} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border border-t border-border rounded-b-xl overflow-hidden">
        {SOURCES.map((s) => {
          const its = integrations.filter((i) => s.keys.includes(i.key));
          const conn = its.filter((i) => i.status === "connected");
          const status = conn.length ? "connected" : its.some((i) => i.status === "error") ? "error" : "available";
          const sync = conn.map((i) => i.lastSyncAt ?? i.connectedAt).filter(Boolean).sort().pop();
          return (
            <div key={s.label} className="bg-surface p-2.5 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-medium truncate">{s.label}</p>
                <span className={cn("size-1.5 rounded-full shrink-0", status === "connected" ? "bg-success" : status === "error" ? "bg-danger" : "bg-fg-3")} />
              </div>
              <p className="text-[11px] text-fg-3 truncate">{status === "connected" ? `${conn.map((i) => i.name).join(", ")} · ${relTime(sync)}` : s.what}</p>
              {status !== "connected" && <StatusBadge status={status} className="mt-1" />}
            </div>
          );
        })}
        {!hideCrm && (
          <div className="bg-surface p-2.5 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-medium truncate inline-flex items-center gap-1"><Database className="size-3" /> CRM</p>
              <span className="size-1.5 rounded-full bg-success shrink-0" />
            </div>
            <p className="text-[11px] text-fg-3 truncate" title="Agency pipeline from Leads & Deals (built-in)">
              {crm.newLeads} leads (30d) · {compactMoney(crm.pipelineValue)} pipeline
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
