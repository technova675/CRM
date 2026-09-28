"use client";

import { useMemo, useState } from "react";
import { BarChart3, Sparkles } from "lucide-react";
import type { SocialPost } from "@/lib/types";
import { aggregateBy, bestPostingTimes, performanceInsights } from "@/lib/ai/social";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { compact, fmtShort } from "@/lib/utils";
import { Bars } from "@/components/charts";
import { AgentChip, Button, Card, CardHeader, EmptyState, InsightLegend, InsightList, Segmented, Table, Td, Th } from "@/components/ui";
import { AGENTS } from "@/lib/ai/agents";
import type { InsightItem } from "@/lib/types";
import { PlatformChip } from "./shared";

type Dim = "pillar" | "format" | "platform";

export function SocialAnalyze({ posts, clientName, onOpen, scopeLabel, clientId }: { posts: SocialPost[]; clientName: (id: string) => string; onOpen: (p: SocialPost) => void; scopeLabel: string; clientId?: string }) {
  const published = useMemo(() => posts.filter((p) => p.stage === "Published" && p.metrics), [posts]);
  const [dim, setDim] = useState<Dim>("format");
  const [extra, setExtra] = useState<InsightItem[]>([]);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => aggregateBy(published, (p) => (dim === "pillar" ? p.pillar : dim === "format" ? p.format : p.platform)).map((r) => ({ name: r.key, er: r.er, avgReach: r.avgReach, saves: Math.round(r.saves / r.posts), shares: Math.round(r.shares / r.posts), posts: r.posts })), [published, dim]);
  const times = useMemo(() => bestPostingTimes(published), [published]);
  const insights = useMemo(() => performanceInsights(published, scopeLabel), [published, scopeLabel]);
  const top = useMemo(() => [...published].sort((a, b) => b.metrics!.er - a.metrics!.er).slice(0, 8), [published]);
  const totals = useMemo(() => {
    const t = published.reduce((a, p) => ({ reach: a.reach + p.metrics!.reach, saves: a.saves + p.metrics!.saves, shares: a.shares + p.metrics!.shares, er: a.er + p.metrics!.er }), { reach: 0, saves: 0, shares: 0, er: 0 });
    return { ...t, er: published.length ? t.er / published.length : 0 };
  }, [published]);

  const deepDive = async () => {
    setBusy(true);
    const out = await runAgentJob({
      agent: "social",
      title: `Performance analysis · ${scopeLabel}`,
      clientId,
      local: async () => {
        const llm = await callAgent("social", "Analyse these social post results by pillar, format, platform and posting time. Tag each line as data, assumption or recommendation.", { rows, times, top: top.map((p) => ({ pillar: p.pillar, format: p.format, platform: p.platform, er: p.metrics!.er, reach: p.metrics!.reach })) }, { format: "insights", clientId });
        return llm?.insights?.length ? llm.insights : [{ kind: "assumption" as const, text: "LLM not configured — showing the local engine's analysis above (deterministic, from post metrics)." }];
      },
    });
    setBusy(false);
    if (out) setExtra(out);
  };

  if (!published.length) return <Card><EmptyState icon={<BarChart3 className="size-5" />} title="No published posts with metrics" description="Publish posts (or sync platform insights) to analyse performance." /></Card>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {([["Published posts", published.length.toString()], ["Total reach", compact(totals.reach)], ["Avg ER", `${totals.er.toFixed(2)}%`], ["Saves", compact(totals.saves)], ["Shares", compact(totals.shares)]] as const).map(([l, v], i) => (
          <Card key={l} className={i === 4 ? "p-3 col-span-2 lg:col-span-1" : "p-3"}><p className="text-xs text-fg-3">{l}</p><p className="text-xl font-semibold tabular-nums mt-1">{v}</p></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Performance breakdown" subtitle={`Avg per post · ${scopeLabel}`} action={<Segmented value={dim} onChange={setDim} options={[{ value: "format", label: "Format" }, { value: "pillar", label: "Pillar" }, { value: "platform", label: "Platform" }]} />} />
          <div className="px-2 pb-3 grid sm:grid-cols-2 gap-2">
            <div><p className="px-2 text-[11px] text-fg-3">Engagement rate %</p><Bars data={rows} x="name" series={[{ key: "er", label: "ER %" }]} height={200} fmt={(v) => `${v}%`} horizontal={dim === "pillar"} /></div>
            <div><p className="px-2 text-[11px] text-fg-3">Avg reach · saves · shares</p><Bars data={rows} x="name" series={[{ key: "avgReach", label: "Avg reach" }]} height={200} horizontal={dim === "pillar"} /></div>
          </div>
          <Table>
            <thead><tr><Th>{dim}</Th><Th>Posts</Th><Th>Avg reach</Th><Th>ER</Th><Th>Saves/post</Th><Th>Shares/post</Th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name}><Td className="font-medium">{r.name}</Td><Td className="tabular-nums">{r.posts}</Td><Td className="tabular-nums">{compact(r.avgReach)}</Td><Td className="tabular-nums">{r.er}%</Td><Td className="tabular-nums">{r.saves}</Td><Td className="tabular-nums">{r.shares}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Best posting times" subtitle="Avg ER by time band and weekday (published posts)" />
          <div className="px-2 pb-2">
            <Bars data={times.slots.map((s) => ({ name: s.key.split(" (")[0]!, er: s.er }))} x="name" series={[{ key: "er", label: "ER %", color: "var(--chart-2)" }]} height={160} fmt={(v) => `${v}%`} />
            <Bars data={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ name: d, er: times.days.find((x) => x.key === d)?.er ?? 0 }))} x="name" series={[{ key: "er", label: "ER %", color: "var(--chart-3)" }]} height={140} fmt={(v) => `${v}%`} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2">AI performance insights <AgentChip name={AGENTS.social.name} color={AGENTS.social.color} /></span>} action={<Button size="xs" variant="ai" loading={busy} icon={<Sparkles className="size-3" />} onClick={deepDive}>Deep dive</Button>} />
          <div className="px-4 pb-4 space-y-3">
            <InsightList items={[...insights, ...extra]} compact />
            <InsightLegend />
          </div>
        </Card>
        <Card>
          <CardHeader title="Top posts" subtitle="By engagement rate" />
          <Table>
            <thead><tr><Th>Post</Th><Th>Date</Th><Th>Reach</Th><Th>ER</Th><Th>Saves</Th></tr></thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => onOpen(p)}>
                  <Td><div className="flex items-center gap-1.5 min-w-0"><PlatformChip platform={p.platform} /><div className="min-w-0"><p className="truncate max-w-56 text-[13px]">{p.hook}</p><p className="text-[11px] text-fg-3">{clientName(p.clientId)} · {p.format} · {p.pillar}</p></div></div></Td>
                  <Td className="text-xs text-fg-3 whitespace-nowrap">{fmtShort(p.publishedAt)}</Td>
                  <Td className="tabular-nums">{compact(p.metrics!.reach)}</Td>
                  <Td className="tabular-nums font-medium">{p.metrics!.er}%</Td>
                  <Td className="tabular-nums">{compact(p.metrics!.saves)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
