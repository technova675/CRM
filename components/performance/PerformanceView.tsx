"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Gauge, ListChecks, Sparkles, Target } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Recommendation } from "@/lib/types";
import { runAgentJob } from "@/lib/ai/client";
import { AD_PLATFORMS, PLATFORM_LABEL, SERVICE_PLATFORM, analyzeAds, analyzeMedia, change, derive, sumStats, type AdPlatform } from "@/lib/ai/media";
import { compact, compactMoney, money, pct, uid } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, CardHeader, Drawer, EmptyState, InsightLegend, PageHeader, Readonly, Select, Tabs } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { AdsTable } from "./AdsTable";
import { BudgetPacing } from "./BudgetPacing";
import { MetricTile, ModePanel, PlatformStatusGrid, RecommendationCard, useConnectedKeys } from "./shared";

type QueueTab = "New" | "Awaiting Approval" | "Executed" | "Dismissed";
const RANK = { High: 0, Medium: 1, Low: 2 } as const;
const MEDIA_AGENTS = new Set(["media", "analytics"]);

export function PerformanceView() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const ads = useCRM((s) => s.ads);
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const recommendations = useCRM((s) => s.recommendations);
  const addRecommendations = useCRM((s) => s.addRecommendations);
  const connected = useConnectedKeys();
  const writable = can(me.role, "performance", "write") && me.role !== "client";

  const isClient = me.role === "client";
  const clientId = isClient ? me.clientId ?? "none" : params.get("client") ?? "All";
  const platform = (params.get("platform") ?? "All") as AdPlatform | "All";
  const campaignId = params.get("campaign") ?? "All";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v === "All") next.delete(k);
    else next.set(k, v);
    if (k === "client") next.delete("campaign");
    const qs = next.toString();
    router.replace(qs ? `/performance?${qs}` : "/performance", { scroll: false });
  };

  const [tab, setTab] = useState<QueueTab>("New");
  const [running, setRunning] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.company])), [clients]);
  const visibleClients = useMemo(() => (isClient ? clients.filter((c) => c.id === me.clientId) : clients), [clients, isClient, me.clientId]);

  // Analyse all ads (campaign averages need every ad in the campaign), then filter.
  const allAnalyses = useMemo(() => analyzeAds(ads), [ads]);
  const analyses = useMemo(
    () =>
      allAnalyses.filter(
        ({ ad }) => (clientId === "All" || ad.clientId === clientId) && (platform === "All" || ad.platform === platform) && (campaignId === "All" || ad.campaignId === campaignId),
      ),
    [allAnalyses, clientId, platform, campaignId],
  );
  const scopeAds = useMemo(() => analyses.map((a) => a.ad), [analyses]);

  const kpi = useMemo(() => {
    const prev = derive(sumStats(scopeAds.map((a) => a.prev)));
    const curr = derive(sumStats(scopeAds.map((a) => a.curr)));
    const reach = scopeAds.reduce((s, a) => s + (a.frequency ? a.curr.impressions / a.frequency : 0), 0);
    return { prev, curr, reach };
  }, [scopeAds]);

  const campaignOptions = useMemo(() => {
    const ids = new Set(ads.filter((a) => (clientId === "All" || a.clientId === clientId) && (platform === "All" || a.platform === platform)).map((a) => a.campaignId));
    return campaigns.filter((c) => ids.has(c.id));
  }, [ads, campaigns, clientId, platform]);

  const scopedCampaigns = useMemo(
    () =>
      campaigns.filter((c) => {
        if (clientId !== "All" && c.clientId !== clientId) return false;
        if (campaignId !== "All" && c.id !== campaignId) return false;
        const p = SERVICE_PLATFORM[c.service];
        if (platform !== "All" && p !== platform) return false;
        return !!p; // paid-media campaigns only
      }),
    [campaigns, clientId, campaignId, platform],
  );

  const recs = useMemo(() => {
    return recommendations.filter((r) => {
      if (!MEDIA_AGENTS.has(r.agent)) return false;
      if (clientId !== "All" && r.clientId !== clientId) return false;
      if (campaignId !== "All" && r.campaignId !== campaignId) return false;
      if (platform !== "All") {
        const c = r.campaignId ? campaignById.get(r.campaignId) : undefined;
        const p = r.adId ? ads.find((a) => a.id === r.adId)?.platform : c ? SERVICE_PLATFORM[c.service] : undefined;
        if (p !== platform) return false;
      }
      return true;
    });
  }, [recommendations, clientId, campaignId, platform, campaignById, ads]);

  const byTab = useMemo(() => {
    const m: Record<QueueTab, Recommendation[]> = { New: [], "Awaiting Approval": [], Executed: [], Dismissed: [] };
    for (const r of recs) {
      if (r.status === "New") m.New.push(r);
      else if (r.status === "Awaiting Approval") m["Awaiting Approval"].push(r);
      else if (r.status === "Dismissed") m.Dismissed.push(r);
      else m.Executed.push(r);
    }
    m.New.sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.createdAt.localeCompare(a.createdAt));
    m.Executed.sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
    m.Dismissed.sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
    return m;
  }, [recs]);
  const today = byTab.New.slice(0, 6);
  const focused = recommendations.find((r) => r.id === focus);

  const adCounts = useMemo(() => {
    const m: Partial<Record<AdPlatform, number>> = {};
    ads.forEach((a) => {
      if (clientId === "All" || a.clientId === clientId) m[a.platform] = (m[a.platform] ?? 0) + 1;
    });
    return m;
  }, [ads, clientId]);

  const runAudit = async () => {
    setRunning(true);
    const before = useCRM.getState().recommendations.length;
    const out = await runAgentJob({
      agent: "media",
      title: `Media audit — ${scopeAds.length} ads${clientId !== "All" ? ` · ${clientName.get(clientId)}` : ""}`,
      clientId: clientId !== "All" ? clientId : undefined,
      local: () => analyzeMedia(scopeAds, campaigns, clients, { idPrefix: `${uid("rec")}_`, connectedPlatforms: connected }),
    });
    setRunning(false);
    if (!out) return;
    addRecommendations(out);
    const fresh = useCRM.getState().recommendations.length - before;
    toast("Media audit complete", `${out.length} findings · ${fresh} new recommendation${fresh === 1 ? "" : "s"} (duplicates of open items skipped). Nothing was changed on the ad platforms.`, "success");
    setTab("New");
  };

  const { prev, curr } = kpi;
  const d = (k: keyof typeof curr) => change(prev[k], curr[k]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Gauge className="size-5 text-accent-text" />}
        title="Performance Marketing"
        description="AI media buyer: finds winners, losers, fatigue and wasted budget across every ad platform — you approve, then it executes."
        actions={
          <>
            <Button href="/automations?tab=approvals" icon={<ListChecks className="size-3.5" />}>Approvals</Button>
            {writable && (
              <Button variant="ai" loading={running} icon={<Sparkles className="size-3.5" />} onClick={runAudit} disabled={!scopeAds.length}>
                Run media audit
              </Button>
            )}
          </>
        }
      />
      {!writable && <Readonly>You have read-only access to Performance Marketing — recommendations can be reviewed but not approved.</Readonly>}

      <PlatformStatusGrid adCounts={adCounts} />

      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          {!isClient && (
            <Select value={clientId} onChange={(e) => setParam("client", e.target.value)} className="w-full sm:w-48">
              <option value="All">All clients</option>
              {visibleClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )}
          <Select value={platform} onChange={(e) => setParam("platform", e.target.value)} className="w-full sm:w-52">
            <option value="All">All platforms</option>
            {AD_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </Select>
          <Select value={campaignId} onChange={(e) => setParam("campaign", e.target.value)} className="w-full sm:w-64">
            <option value="All">All campaigns</option>
            {campaignOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <span className="ml-auto text-xs text-fg-3">{scopeAds.length} ads · this week vs last week</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-11 gap-px bg-border rounded-b-xl overflow-hidden">
          <MetricTile label="Spend" value={compactMoney(curr.spend)} delta={d("spend")} />
          <MetricTile label="Impressions" value={compact(curr.impressions)} delta={d("impressions")} />
          <MetricTile label="Reach (est.)" value={compact(kpi.reach)} hint="Impressions ÷ frequency per ad (platform-reported frequency)" />
          <MetricTile label="CTR" value={pct(curr.ctr, 2)} delta={d("ctr")} />
          <MetricTile label="CPC" value={money(curr.cpc)} delta={d("cpc")} lowerBetter />
          <MetricTile label="CPM" value={money(curr.cpm)} delta={d("cpm")} lowerBetter />
          <MetricTile label="Leads" value={compact(curr.leads)} delta={d("leads")} />
          <MetricTile label="Conversions" value={compact(curr.conversions)} delta={d("conversions")} />
          <MetricTile label="CPA" value={curr.conversions ? money(curr.cpa) : "—"} delta={d("cpa")} lowerBetter />
          <MetricTile label="ROAS" value={`${curr.roas.toFixed(2)}x`} delta={d("roas")} />
          <MetricTile label="Revenue" value={compactMoney(curr.revenue)} delta={d("revenue")} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><Target className="size-4 text-accent-text" /> What should the media team optimise today?</span>}
            subtitle="Open recommendations ranked by priority and spend at stake"
            action={<AIBadge>Media agent</AIBadge>}
          />
          {today.length === 0 ? (
            <EmptyState title="Nothing urgent" description={writable ? "Run a media audit to check the latest data." : "No open recommendations for this selection."} />
          ) : (
            <ol className="px-4 pb-4 space-y-1.5">
              {today.map((r, i) => (
                <li key={r.id}>
                  <button onClick={() => setFocus(r.id)} className="w-full flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-2/60 transition">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug">{r.title}</span>
                      <span className="block text-[11px] text-fg-3 truncate">{clientName.get(r.clientId ?? "")} · {r.action?.label ?? r.recommendation}</span>
                    </span>
                    <Badge tone={r.priority === "High" ? "danger" : r.priority === "Medium" ? "warning" : "neutral"}>{r.priority}</Badge>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <ModePanel />
      </div>

      <Card>
        <CardHeader title="Ads" subtitle="Every ad from the connected platforms with AI status" />
        <AdsTable analyses={analyses} campaigns={campaigns} clients={clients} connected={connected} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recommendations queue" subtitle="Finding → Evidence → Recommendation → Priority" action={<InsightLegend />} className="flex-col sm:flex-row" />
          <div className="px-4">
            <Tabs value={tab} onChange={setTab} tabs={(Object.keys(byTab) as QueueTab[]).map((t) => ({ value: t, label: t, count: byTab[t].length }))} />
          </div>
          <div className="p-4 grid gap-3 xl:grid-cols-2">
            {byTab[tab].length === 0 && <div className="xl:col-span-2"><EmptyState title={`No ${tab.toLowerCase()} recommendations`} /></div>}
            {byTab[tab].slice(0, 30).map((r) => (
              <RecommendationCard key={r.id} rec={r} writable={writable} clientName={clientName.get(r.clientId ?? "")} campaignName={r.campaignId ? campaignById.get(r.campaignId)?.service : undefined} />
            ))}
          </div>
        </Card>
        <BudgetPacing campaigns={scopedCampaigns} clients={clients} />
      </div>

      {focused && (
        <Drawer open onClose={() => setFocus(null)} width={640} title="Recommendation" subtitle={clientName.get(focused.clientId ?? "")}>
          <RecommendationCard rec={focused} writable={writable} defaultOpen clientName={clientName.get(focused.clientId ?? "")} campaignName={focused.campaignId ? campaignById.get(focused.campaignId)?.name : undefined} />
        </Drawer>
      )}
    </div>
  );
}
