"use client";

import { useMemo, useState } from "react";
import { Activity, Globe, Link2, MousePointerClick, Plug, Sparkles, TriangleAlert } from "lucide-react";
import type { Client, ClientKnowledge, InsightItem, Integration, SeoProject } from "@/lib/types";
import { seoRecommendations } from "@/lib/ai/seo";
import { runAgentJob } from "@/lib/ai/client";
import { AGENTS } from "@/lib/ai/agents";
import { compact, fmtShort, relTime, sum } from "@/lib/utils";
import { AreaTrend, Bars, Lines } from "@/components/charts";
import { AgentChip, Badge, Button, Card, CardHeader, EmptyState, InsightLegend, InsightList, Segmented, Stat, Table, Tabs, Td, Th } from "@/components/ui";
import { Movement, SeoKeywords } from "./SeoKeywords";
import { SeoIssues } from "./SeoIssues";
import { SeoContent } from "./SeoContent";

type Tab = "overview" | "audit" | "keywords" | "content" | "links";

export function DataSourceBadge({ live, gsc }: { live: boolean; gsc?: Integration }) {
  return live ? (
    <Badge tone="info" dot>
      Data from Search Console{gsc?.lastSyncAt ? ` · synced ${relTime(gsc.lastSyncAt)}` : ""}
    </Badge>
  ) : (
    <Badge tone="warning" dot>
      Estimate / sample data — Search Console not linked
    </Badge>
  );
}

function pctDelta(a: number, b: number) {
  return b ? ((a - b) / b) * 100 : undefined;
}

export function SeoWorkspace({ project, client, knowledge, gsc, writable }: { project: SeoProject; client?: Client; knowledge?: ClientKnowledge; gsc?: Integration; writable: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
  const [aiOut, setAiOut] = useState<InsightItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const live = gsc?.status === "connected" && project.gscConnected;

  const k = useMemo(() => {
    const t = project.traffic;
    const cur = t.slice(-28);
    const prev = t.slice(-56, -28);
    const clicks = sum(cur.map((d) => d.clicks));
    const prevClicks = sum(prev.map((d) => d.clicks));
    const impressions = sum(cur.map((d) => d.impressions));
    const tracked = project.keywords.filter((x) => x.tracked && x.position != null);
    const avgPos = tracked.length ? sum(tracked.map((x) => x.position!)) / tracked.length : 0;
    const h = project.healthHistory;
    const h30 = h.length > 30 ? h[h.length - 31]!.score : h[0]?.score;
    const openIssues = project.issues.filter((i) => i.status !== "Fixed");
    return { clicks, prevClicks, impressions, avgPos, tracked: tracked.length, h30, open: openIssues.length, crit: openIssues.filter((i) => i.severity === "Critical").length };
  }, [project]);

  const recs = useMemo(() => seoRecommendations(project, !!live), [project, live]);
  const movers = useMemo(
    () =>
      [...project.keywords]
        .filter((x) => x.tracked && x.position != null && x.prevPosition != null && x.position !== x.prevPosition)
        .sort((a, b) => Math.abs(b.prevPosition! - b.position!) - Math.abs(a.prevPosition! - a.position!))
        .slice(0, 6),
    [project.keywords],
  );

  const analyze = async () => {
    setBusy(true);
    const out = await runAgentJob({ agent: "seo", title: `SEO recommendations — ${client?.company ?? project.domain}`, clientId: project.clientId, local: () => seoRecommendations(project, !!live).insights });
    setBusy(false);
    if (out) setAiOut(out);
  };

  const audited = project.healthHistory.length > 0;
  const src = live ? "Search Console" : "sample / estimate";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="SEO health" value={audited ? `${project.healthScore}/100` : "—"} delta={audited && k.h30 ? project.healthScore - k.h30 : undefined} hint={audited ? "vs 30 days ago (pts)" : "not audited yet"} icon={<Activity className="size-3.5" />} tone={project.healthScore >= 75 ? "success" : project.healthScore >= 55 ? "warning" : "danger"} />
        <Stat label="Organic clicks (28d)" value={compact(k.clicks)} delta={pctDelta(k.clicks, k.prevClicks)} hint={src} icon={<MousePointerClick className="size-3.5" />} />
        <Stat label="Impressions (28d)" value={compact(k.impressions)} hint={src} icon={<Globe className="size-3.5" />} />
        <Stat label="Avg. position" value={k.avgPos ? k.avgPos.toFixed(1) : "—"} hint={`${k.tracked} ranking keywords`} icon={<Sparkles className="size-3.5" />} />
        <Stat label="Open issues" value={k.open} hint={`${k.crit} critical`} icon={<TriangleAlert className="size-3.5" />} tone={k.crit ? "danger" : "warning"} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "audit", label: "Audit & technical", count: k.open },
          { value: "keywords", label: "Keywords & rankings", count: project.keywords.length },
          { value: "content", label: "Content gaps & briefs", count: project.briefs.length },
          { value: "links", label: "Backlinks & competitors" },
        ]}
      />

      <div className="animate-in" key={tab}>
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="SEO health over time" subtitle="Issue-weighted score, last 90 days" />
                <div className="px-2 pb-3">
                  {audited ? (
                    <Lines data={project.healthHistory.map((h) => ({ date: fmtShort(h.date), score: h.score }))} x="date" series={[{ key: "score", label: "Health" }]} height={200} />
                  ) : (
                    <EmptyState title="No audit history yet" description="Import a crawl or run an audit to start the health trend." />
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader
                  title="Organic traffic"
                  subtitle={live ? "Google Search Console · last 90 days" : "Sample / estimate — link Search Console for real data"}
                  action={<Segmented value={metric} onChange={setMetric} options={[{ value: "clicks", label: "Clicks" }, { value: "impressions", label: "Impressions" }]} />}
                />
                <div className="px-2 pb-3">
                  {project.traffic.length ? (
                    <AreaTrend data={project.traffic.map((d) => ({ date: fmtShort(d.date), [metric]: d[metric] }))} x="date" series={[{ key: metric, label: metric === "clicks" ? "Clicks" : "Impressions" }]} height={200} />
                  ) : (
                    <EmptyState icon={<Plug className="size-5" />} title="No traffic data" description="Connect Google Search Console in Integrations to import clicks and impressions." />
                  )}
                </div>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="AI content recommendations"
                  subtitle="Quick wins, drops, open technical issues and content gaps"
                  action={
                    <div className="flex items-center gap-2">
                      <AgentChip name={AGENTS.seo.name} color={AGENTS.seo.color} className="hidden sm:inline-flex" />
                      <Button size="xs" variant="ai" loading={busy} onClick={analyze} icon={<Sparkles className="size-3" />}>
                        Run analysis
                      </Button>
                    </div>
                  }
                />
                <div className="space-y-3 px-4 pb-4">
                  {(aiOut ?? recs.insights).length ? <InsightList items={aiOut ?? recs.insights} /> : <p className="text-xs text-fg-3">No recommendations yet — add tracked keywords and issues first.</p>}
                  <InsightLegend />
                </div>
              </Card>
              <Card>
                <CardHeader title="Biggest movers" subtitle="Tracked keywords, position change" />
                {movers.length === 0 ? (
                  <p className="px-4 pb-4 text-xs text-fg-3">No ranking changes yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {movers.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">{m.keyword}</span>
                        <span className="text-xs tabular-nums text-fg-3">#{m.position}</span>
                        <Movement k={m} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
        {tab === "audit" && <SeoIssues project={project} writable={writable} />}
        {tab === "keywords" && <SeoKeywords project={project} client={client} writable={writable} live={!!live} />}
        {tab === "content" && <SeoContent project={project} knowledge={knowledge} writable={writable} />}
        {tab === "links" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                ["Backlinks", compact(project.backlinks.total)],
                ["Referring domains", compact(project.backlinks.referringDomains)],
                ["New (30d)", `+${project.backlinks.newLast30}`],
                ["Lost (30d)", `−${project.backlinks.lostLast30}`],
                ["Toxic", project.backlinks.toxic],
              ].map(([l, v]) => (
                <Card key={l} className="p-3">
                  <p className="text-xs text-fg-3">{l}</p>
                  <p className="text-lg font-semibold tabular-nums">{v}</p>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Referring domains over time" subtitle="Weekly · backlink index (sample until a backlink provider is connected)" action={<Link2 className="size-4 text-fg-3" />} />
                <div className="px-2 pb-3">
                  {project.backlinks.history.length ? (
                    <Bars data={project.backlinks.history.map((h) => ({ date: fmtShort(h.date), domains: h.domains }))} x="date" series={[{ key: "domains", label: "Referring domains" }]} height={200} />
                  ) : (
                    <EmptyState title="No backlink history" />
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Competitors" subtitle="Organic keyword overlap (estimates)" />
                {project.competitors.length === 0 ? (
                  <EmptyState title="No competitors added" />
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Domain</Th>
                        <Th className="text-right">Overlap</Th>
                        <Th className="text-right">Est. traffic</Th>
                        <Th className="text-right">Keywords</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.competitors.map((c) => (
                        <tr key={c.domain}>
                          <Td className="font-medium">{c.domain}</Td>
                          <Td className="text-right tabular-nums">{c.overlap}%</Td>
                          <Td className="text-right tabular-nums">{compact(c.traffic)}</Td>
                          <Td className="text-right tabular-nums">{compact(c.keywords)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
