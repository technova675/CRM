"use client";

import { useMemo, useState } from "react";
import { Flame, RefreshCw, Sparkles } from "lucide-react";
import { useCRM } from "@/lib/store";
import { analyzeCreatives, refreshBrief, type FatiguedAd } from "@/lib/ai/creative";
import { callAgent } from "@/lib/ai/client";
import type { InsightItem } from "@/lib/types";
import { compactMoney, money } from "@/lib/utils";
import { Bars } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, InsightLegend, InsightList, Modal, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { createRefreshTask } from "./actions";

export function IntelligenceTab({ writable, onGenerateFor }: { writable: boolean; onGenerateFor: (clientId: string) => void }) {
  const ads = useCRM((s) => s.ads);
  const creatives = useCRM((s) => s.creatives);
  const knowledge = useCRM((s) => s.knowledge);
  const strategies = useCRM((s) => s.strategies);
  const clients = useCRM((s) => s.clients);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const [clientId, setClientId] = useState("All");
  const [refresh, setRefresh] = useState<FatiguedAd | null>(null);
  const [ai, setAi] = useState<{ summary?: string; insights: InsightItem[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const clientNames = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients]);
  const intel = useMemo(
    () =>
      analyzeCreatives({
        ads: ads.filter((a) => clientId === "All" || a.clientId === clientId),
        creatives: creatives.filter((c) => clientId === "All" || c.clientId === clientId),
        knowledge,
        strategies,
        clientNames,
      }),
    [ads, creatives, knowledge, strategies, clientNames, clientId],
  );

  const explain = async () => {
    setAiBusy(true);
    const r = await callAgent("creative", "Explain what is winning and losing in these creatives and what to produce next. Tag each insight.", { totals: intel.totals, hooks: intel.hooks.slice(0, 8), formats: intel.formats, fatigue: intel.fatigue.slice(0, 6), weak: intel.weak.slice(0, 6), gaps: intel.gaps.slice(0, 6) }, { format: "insights", clientId: clientId === "All" ? undefined : clientId });
    setAiBusy(false);
    if (!r) return toast("AI provider unavailable", "Showing the local analysis only.", "warning");
    setAi({ summary: r.summary, insights: (r.insights ?? []).map((i) => ({ ...i, source: i.source ?? "AI provider" })) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setAi(null); }} className="w-48">
          <option value="All">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
        </Select>
        <InsightLegend />
        {aiEnabled && <Button size="sm" variant="ai" className="ml-auto" loading={aiBusy} icon={<Sparkles className="size-3.5" />} onClick={explain}>Explain with AI</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3"><p className="text-xs text-fg-3">Ads analysed</p><p className="text-xl font-semibold tabular-nums mt-1">{intel.totals.ads}</p><p className="text-[11px] text-fg-3">social / video / display</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Spend (last 7d)</p><p className="text-xl font-semibold tabular-nums mt-1">{compactMoney(intel.totals.spend)}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Average CTR</p><p className="text-xl font-semibold tabular-nums mt-1">{intel.totals.ctr.toFixed(2)}%</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Fatigued ads</p><p className="text-xl font-semibold tabular-nums mt-1 text-warning">{intel.fatigue.length}</p><p className="text-[11px] text-fg-3">freq &gt; 4 and CTR falling</p></Card>
      </div>

      {ai && (
        <Card className="p-4 space-y-2">
          <p className="text-xs font-medium text-fg-3">AI commentary</p>
          {ai.summary && <p className="text-[13px] text-fg-2">{ai.summary}</p>}
          <InsightList items={ai.insights} />
        </Card>
      )}

      {intel.totals.ads === 0 ? (
        <Card><EmptyState icon={<Flame className="size-5" />} title="No ad-level data" description="Connect Meta / Google Ads for this client to analyse creative performance." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Winning hooks" subtitle="Ranked by CTR this week" items={intel.insights.hooks}>
            <Table>
              <thead><tr><Th>Hook</Th><Th className="text-right">Ads</Th><Th className="text-right">CTR</Th><Th className="text-right">CPA</Th><Th className="text-right">ROAS</Th></tr></thead>
              <tbody>
                {intel.hooks.slice(0, 6).map((h) => (
                  <tr key={h.hook}>
                    <Td className="min-w-40">{h.hook}</Td>
                    <Td className="text-right tabular-nums">{h.ads}</Td>
                    <Td className="text-right tabular-nums">{h.ctr.toFixed(2)}%</Td>
                    <Td className="text-right tabular-nums">{h.cpa ? money(h.cpa) : "—"}</Td>
                    <Td className="text-right tabular-nums">{h.roas.toFixed(2)}x</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Section>

          <Section title="Winning formats" subtitle="Ranked by CPA" items={intel.insights.formats}>
            {intel.formats.length > 0 && <Bars data={intel.formats.map((f) => ({ format: f.format, ctr: +f.ctr.toFixed(2) }))} x="format" series={[{ key: "ctr", label: "CTR %" }]} height={160} fmt={(v) => `${v}%`} />}
          </Section>

          <Section title="Weak openings" subtitle="CTR < 60% of platform median, or hook rate < 25%" items={intel.insights.weak} />

          <Section title="Creative fatigue" subtitle="Frequency > 4 and CTR down week over week" items={intel.insights.fatigue}>
            {intel.fatigue.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {intel.fatigue.slice(0, 8).map((f) => (
                  <li key={f.adId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{f.name}</p>
                      <p className="text-fg-3">{clientNames[f.clientId]} · {f.format} · freq {f.frequency} · CTR {f.ctrPrev.toFixed(2)}% → {f.ctrCurr.toFixed(2)}%</p>
                    </div>
                    <Badge tone="danger">−{f.drop.toFixed(0)}%</Badge>
                    {writable && <Button size="xs" icon={<RefreshCw className="size-3" />} onClick={() => setRefresh(f)}>Refresh creative</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Messaging gaps" subtitle="Approved angles (knowledge base / strategy pillars) not used in live ads" items={intel.insights.gaps}>
            {writable && intel.gaps.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {[...new Set(intel.gaps.map((g) => g.clientId))].slice(0, 4).map((cid) => (
                  <Button key={cid} size="xs" variant="ai" icon={<Sparkles className="size-3" />} onClick={() => onGenerateFor(cid)}>Concepts for {clientNames[cid]}</Button>
                ))}
              </div>
            )}
          </Section>

          <Section title="Creative patterns" subtitle="What the winners have in common" items={intel.insights.patterns} />
        </div>
      )}

      {refresh && <RefreshModal ad={refresh} onClose={() => setRefresh(null)} />}
    </div>
  );
}

function Section({ title, subtitle, items, children }: { title: string; subtitle?: string; items: InsightItem[]; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="px-4 pb-4 space-y-3">
        {items.length ? <InsightList items={items} /> : <p className="text-xs text-fg-3">No signals in the current data.</p>}
        {children}
      </div>
    </Card>
  );
}

function RefreshModal({ ad, onClose }: { ad: FatiguedAd; onClose: () => void }) {
  const team = useCRM((s) => s.team);
  const knowledge = useCRM((s) => s.knowledge);
  const mode = useCRM((s) => s.settings.approvalModes["Task creation"]);
  const [brief, setBrief] = useState(() => refreshBrief(ad, knowledge.find((k) => k.clientId === ad.clientId)));
  const [assigneeId, setAssigneeId] = useState(team.find((t) => t.role === "creative_strategist")?.id ?? team[0]!.id);
  const [days, setDays] = useState(3);
  const submit = () => {
    const r = createRefreshTask(ad, { brief, assigneeId, dueDays: days });
    toast(r === "approval" ? "Brief task awaiting approval" : "Creative brief task created", r === "approval" ? "Task creation requires approval — the task is blocked until approved." : "Find it in Tasks.", r === "approval" ? "warning" : "success");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Refresh creative" subtitle={`${ad.name} · Task creation mode: ${mode}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{mode === "Approval Required" ? "Request approval" : "Create brief task"}</Button></>}>
      <div className="space-y-3">
        <Field label="Creative brief (AI draft — edit as needed)"><Textarea value={brief} onChange={(e) => setBrief(e.target.value)} className="min-h-44" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assignee"><Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Due in (days)"><Input type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} /></Field>
        </div>
      </div>
    </Modal>
  );
}
