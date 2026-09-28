"use client";

import { useMemo } from "react";
import { Radar, TrendingUp, Users } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { SocialPost } from "@/lib/types";
import { competitorAnalysis, contentGaps, trendSignals } from "@/lib/ai/social";
import { Badge, Button, Card, CardHeader, InsightLegend, InsightList, Select, Table, Td, Th } from "@/components/ui";

// Competitor / gap / trend panels. Nothing here is scraped: until a social listening
// integration is connected, competitor and trend data is illustrative.
export function SocialListening({ clientId, onClient, clientIds, posts }: { clientId: string; onClient: (id: string) => void; clientIds: string[]; posts: SocialPost[] }) {
  const clients = useCRM((s) => s.clients);
  const knowledge = useCRM((s) => s.knowledge);
  const strategies = useCRM((s) => s.strategies);
  const client = clients.find((c) => c.id === clientId);
  const ctx = useMemo(() => (client ? { client, knowledge: knowledge.find((k) => k.clientId === client.id), strategies } : null), [client, knowledge, strategies]);
  const comps = useMemo(() => (ctx ? competitorAnalysis(ctx) : []), [ctx]);
  const gaps = useMemo(() => (ctx ? contentGaps(ctx, posts) : []), [ctx, posts]);
  const trends = useMemo(() => (ctx ? trendSignals(ctx) : []), [ctx]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={clientId} onChange={(e) => onClient(e.target.value)} className="w-56">
          {clients.filter((c) => clientIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
        </Select>
        <div className="flex-1 min-w-64 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning flex flex-wrap items-center gap-2">
          <span className="flex-1">Sample / illustrative — competitor and trend panels are derived from the knowledge base and {client?.industry ?? "industry"} patterns, not scraped data. Connect a social listening integration for live signals.</span>
          <Button size="xs" href="/integrations">Integrations</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Users className="size-3.5" /> Competitor analysis <Badge tone="warning">Illustrative</Badge></span>} subtitle={comps[0]?.fromKnowledge ? "Competitors from the client knowledge base" : "No competitors in the knowledge base — showing category archetypes"} />
          <Table>
            <thead><tr><Th>Competitor</Th><Th>Cadence</Th><Th>Formats</Th><Th>Themes</Th><Th>Our opportunity</Th></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.name}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-xs text-fg-2 whitespace-nowrap">{c.cadence}</Td>
                  <Td className="text-xs text-fg-2">{c.formats}</Td>
                  <Td className="text-xs text-fg-2">{c.themes.join(", ")}</Td>
                  <Td className="text-xs text-fg-2 min-w-48">{c.opportunity}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-1.5"><Radar className="size-3.5" /> Content gap analysis</span>} subtitle="Our calendar (data) vs pillars & category patterns" />
          <div className="px-4 pb-4 space-y-3"><InsightList items={gaps} compact /><InsightLegend /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title={<span className="flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Trend monitoring <Badge tone="warning">Sample</Badge></span>} subtitle="Evergreen format trends for this category — live trending audio/topics need a listening integration" />
        <Table>
          <thead><tr><Th>Trend / format</Th><Th>Fit</Th><Th>How we&apos;d use it</Th></tr></thead>
          <tbody>{trends.map((t) => <tr key={t.trend}><Td className="text-[13px]">{t.trend}</Td><Td><Badge tone={t.fit === "High" ? "success" : "neutral"}>{t.fit}</Badge></Td><Td className="text-xs text-fg-2">{t.idea}</Td></tr>)}</tbody>
        </Table>
      </Card>
    </div>
  );
}
