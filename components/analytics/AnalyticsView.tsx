"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { LineChart } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { detectAnomalies } from "@/lib/ai/analytics";
import { PageHeader, Readonly, Select, Tabs } from "@/components/ui";
import { Explorer } from "./Explorer";
import { Insights } from "./Insights";
import { MonthCompare } from "./MonthCompare";
import { Sources } from "./Sources";

type Tab = "explore" | "insights" | "compare";

export function AnalyticsView() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const ads = useCRM((s) => s.ads);
  const isClient = me.role === "client";
  const writable = can(me.role, "analytics", "write") && !isClient;
  const clientId = isClient ? me.clientId ?? "none" : params.get("client") ?? "All";
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "insights" || tabParam === "compare" ? tabParam : "explore";

  const nav = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "All" || (k === "tab" && v === "explore")) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/analytics?${qs}` : "/analytics", { scroll: false });
  };

  const anomalyCount = useMemo(
    () => detectAnomalies(campaigns, ads, clients).filter((a) => a.tone === "worse" && (clientId === "All" || a.clientId === clientId)).length,
    [campaigns, ads, clients, clientId],
  );
  const visibleClients = isClient ? clients.filter((c) => c.id === me.clientId) : clients;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<LineChart className="size-5 text-accent-text" />}
        title="Analytics & AI Insights"
        description="One marketing data layer across platforms — and an AI analyst that explains what happened, why, what to do next and what to test."
        actions={
          !isClient && (
            <Select value={clientId} onChange={(e) => nav({ client: e.target.value })} className="w-52">
              <option value="All">All clients</option>
              {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )
        }
      />
      {!writable && <Readonly>Read-only access — you can explore data and investigations but not create recommendations or tasks.</Readonly>}
      <Sources hideCrm={isClient} />
      <Tabs
        value={tab}
        onChange={(t) => nav({ tab: t })}
        tabs={[
          { value: "explore", label: "Explore" },
          { value: "insights", label: "AI Insights", count: anomalyCount },
          { value: "compare", label: "This month vs last month" },
        ]}
      />
      {tab === "explore" && <Explorer clientId={clientId} />}
      {tab === "insights" && <Insights clientId={clientId} writable={writable} />}
      {tab === "compare" && <MonthCompare clientId={clientId} onInvestigate={(id) => nav({ client: id, tab: "insights" })} />}
    </div>
  );
}
