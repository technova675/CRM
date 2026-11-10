"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LineChart } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, Readonly, Select, Tabs } from "@/components/ui";
import { Explorer } from "./Explorer";
import { Insights } from "./Insights";
import { AnalyticsAgent } from "./AnalyticsAgent";
import { MonthCompare } from "./MonthCompare";
import { AnalyticsSources } from "./AnalyticsSources";
import { UnifiedExplorer } from "./UnifiedExplorer";

type Tab = "explore" | "sources" | "insights" | "compare" | "legacy";

export function AnalyticsView() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const clients = useCRM((s) => s.clients);
  const isClient = me.role === "client";
  const writable = can(me.role, "analytics", "write") && !isClient;
  const clientId = isClient ? me.clientId ?? "none" : params.get("client") ?? "All";
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "insights" && !isClient || tabParam === "compare" || tabParam === "legacy" || tabParam === "sources" && !isClient ? tabParam : "explore";

  const nav = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "All" || (k === "tab" && v === "explore")) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/analytics?${qs}` : "/analytics", { scroll: false });
  };

  const visibleClients = isClient ? clients.filter((c) => c.id === me.clientId) : clients;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<LineChart className="size-5 text-accent-text" />}
        title="Analytics Engine"
        description="Explore measured marketing data by client, channel, campaign and the dimensions each source reports."
        actions={
          !isClient && (
            <Select aria-label="Filter by client" value={clientId} onChange={(e) => nav({ client: e.target.value })} className="min-h-11 w-full sm:w-52">
              <option value="All">All clients</option>
              {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )
        }
      />
      {!writable && <Readonly>Read-only access — you can explore data and investigations but not create recommendations or tasks.</Readonly>}
      <Tabs
        value={tab}
        onChange={(t) => nav({ tab: t })}
        tabs={[
          { value: "explore", label: "Explore" },
          ...(!isClient ? [{ value: "sources" as const, label: "Data sources" }] : []),
          ...(!isClient ? [{ value: "insights" as const, label: "AI Insights" }] : []),
          { value: "compare", label: "Month comparison" },
          { value: "legacy", label: "Legacy explorer" },
        ]}
      />
      {tab === "explore" && <UnifiedExplorer key={params.get("feed") ?? "default"} initialFeed={params.get("feed") ?? (isClient ? "paid" : "compare")} clientId={clientId} showCrm={!isClient} onSources={isClient ? undefined : () => nav({ tab: "sources" })} />}
      {tab === "sources" && !isClient && <AnalyticsSources writable={writable} showCrm onOpen={feed => nav({ tab: "explore", client: null, feed })} />}
      {tab === "legacy" && <><Explorer clientId={clientId} /><details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer font-medium">Legacy weekly anomaly review</summary><div className="mt-4"><Insights clientId={clientId} writable={writable} /></div></details></>}
      {tab === "insights" && !isClient && <AnalyticsAgent key={clientId} clientId={clientId} initialFeed={params.get("feed") ?? undefined} writable={writable} onSources={() => nav({ tab: "sources" })} />}
      {tab === "compare" && <MonthCompare clientId={clientId} onInvestigate={(id) => nav({ client: id, tab: isClient ? "legacy" : "insights" })} />}
    </div>
  );
}
