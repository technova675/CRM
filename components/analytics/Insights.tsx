"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ClipboardList, Lightbulb, Radar, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import type { InsightItem } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { detectAnomalies, fmtMetric, investigate, type Anomaly, type Investigation } from "@/lib/ai/analytics";
import { fmtChange } from "@/lib/ai/media";
import { DAY, cn, money, uid } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, Drawer, EmptyState, InsightLegend, InsightList, InsightTag, Segmented, Table, Td, Th, type Tone } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { useConnectedKeys } from "@/components/performance/shared";

const SEV_TONE: Record<Anomaly["severity"], Tone> = { High: "danger", Medium: "warning", Low: "neutral" };
const TONE_TONE: Record<Anomaly["tone"], Tone> = { worse: "danger", better: "success", neutral: "info" };

export function Insights({ clientId, writable }: { clientId: string; writable: boolean }) {
  const campaigns = useCRM((s) => s.campaigns);
  const ads = useCRM((s) => s.ads);
  const clients = useCRM((s) => s.clients);
  const [filter, setFilter] = useState<"worse" | "all" | "better">("worse");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => detectAnomalies(campaigns, ads, clients), [campaigns, ads, clients]);
  const list = useMemo(
    () => all.filter((a) => (clientId === "All" || a.clientId === clientId) && (filter === "all" || (filter === "worse" ? a.tone === "worse" : a.tone !== "worse"))),
    [all, clientId, filter],
  );
  const open = all.find((a) => a.id === openId);
  const agent = AGENTS.analytics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AgentChip name={agent.name} color={agent.color} />
        <p className="text-xs text-fg-3">Metric changes beyond thresholds (CPA/ROAS/CPC/CPM/CVR ±20%, CTR ±15%, conversions ±25%, spend ±30%) · this week vs last week</p>
        <Segmented className="ml-auto" value={filter} onChange={setFilter} options={[{ value: "worse", label: "Needs attention" }, { value: "better", label: "Improvements" }, { value: "all", label: `All ${all.filter((a) => clientId === "All" || a.clientId === clientId).length}` }]} />
      </div>
      {list.length === 0 ? (
        <Card><EmptyState icon={<Radar className="size-5" />} title="No anomalies for this selection" description="Performance is within normal week-to-week ranges." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => {
            const up = a.changePct > 0;
            return (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="text-left rounded-xl border border-border bg-surface p-4 shadow-card hover:border-border-strong hover:bg-surface-2/40 transition">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={SEV_TONE[a.severity]} dot>{a.severity}</Badge>
                  <Badge tone="neutral">{a.scope === "client" ? "Client" : "Campaign"}</Badge>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold">
                  {up ? <ArrowUpRight className={cn("size-4", a.tone === "worse" ? "text-danger" : a.tone === "better" ? "text-success" : "text-info")} /> : <ArrowDownRight className={cn("size-4", a.tone === "worse" ? "text-danger" : a.tone === "better" ? "text-success" : "text-info")} />}
                  {a.headline}
                </p>
                <p className="text-[13px] text-fg-2 truncate">{a.label}</p>
                <p className="mt-2 text-xs tabular-nums text-fg-2">{fmtMetric(a.metric, a.prev)} → <span className="font-semibold text-fg">{fmtMetric(a.metric, a.curr)}</span> · spend {money(a.spend)}/wk</p>
                <p className="mt-1 text-[11px] text-fg-3 truncate">{a.source}</p>
                <p className="mt-2 text-xs text-accent-text">Investigate →</p>
              </button>
            );
          })}
        </div>
      )}
      {open && <InvestigationDrawer anomaly={open} onClose={() => setOpenId(null)} writable={writable} />}
    </div>
  );
}

const STATUS_TONE: Record<Investigation["checks"][number]["status"], Tone> = { Contributing: "danger", "Not a driver": "success", Unverified: "neutral" };
const KINDS = new Set(["data", "assumption", "recommendation"]);

function InvestigationDrawer({ anomaly, onClose, writable }: { anomaly: Anomaly; onClose: () => void; writable: boolean }) {
  const me = useMe();
  const campaigns = useCRM((s) => s.campaigns);
  const ads = useCRM((s) => s.ads);
  const clients = useCRM((s) => s.clients);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const addRecommendations = useCRM((s) => s.addRecommendations);
  const addTask = useCRM((s) => s.addTask);
  const connected = useConnectedKeys();
  const inv = useMemo(() => investigate(anomaly, { campaigns, ads, clients, connected }), [anomaly, campaigns, ads, clients, connected]);
  const [driverDim, setDriverDim] = useState(inv.drivers[0]?.dimension ?? "Ad");
  const [narrative, setNarrative] = useState<{ summary?: string; insights: InsightItem[] } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [created, setCreated] = useState<{ rec?: boolean; task?: boolean }>({});
  const drivers = inv.drivers.find((d) => d.dimension === driverDim) ?? inv.drivers[0];
  const client = clients.find((c) => c.id === anomaly.clientId);
  const campaign = campaigns.find((c) => c.id === anomaly.campaignId);

  const createRec = () => {
    addRecommendations([{ ...inv.recommendation, id: uid("rec"), createdAt: new Date().toISOString() }]);
    setCreated((c) => ({ ...c, rec: true }));
    toast("Recommendation created", "Added to the Performance queue for approval.", "success");
  };
  const createTask = () => {
    addTask({
      title: inv.recommendation.action?.label ?? inv.recommendation.title,
      description: [
        `What happened: ${inv.whatHappened.map((w) => w.text).join(" ")}`,
        `Why: ${inv.why.map((w) => `[${w.kind}] ${w.text}`).join(" ")}`,
        `Next: ${inv.next.map((w) => w.text).join(" ")}`,
        `Test: ${inv.tests.map((w) => w.text).join(" ")}`,
      ].join("\n\n"),
      assigneeId: campaign?.ownerId ?? client?.accountManagerId ?? me.id,
      priority: anomaly.severity === "High" ? "High" : "Medium",
      dueDate: new Date(Date.now() + 2 * DAY).toISOString(),
      status: "Todo",
      related: campaign ? { type: "campaign", id: campaign.id } : client ? { type: "client", id: client.id } : undefined,
      createdBy: "ai",
    });
    setCreated((c) => ({ ...c, task: true }));
    toast("Task created", inv.recommendation.title);
  };
  const enrich = async () => {
    setEnriching(true);
    const res = await runAgentJob({
      agent: "analytics",
      title: `Explain: ${anomaly.headline} — ${anomaly.label}`,
      clientId: anomaly.clientId,
      local: () =>
        callAgent(
          "analytics",
          `Explain this performance change for an agency client. Answer: What happened? Why did it happen? What should we do next? What should we test? Use ONLY the numbers provided; label anything not supported by them as an assumption.`,
          { anomaly, decomposition: inv.decomposition, componentNote: inv.componentNote, checks: inv.checks, drivers: inv.drivers.map((d) => ({ dimension: d.dimension, rows: d.rows.slice(0, 3) })) },
          { format: "insights", clientId: anomaly.clientId },
        ),
    });
    setEnriching(false);
    if (!res) {
      toast("AI narrative unavailable", "Showing the analytics engine's output.", "info");
      return;
    }
    const insights = (res.insights ?? []).filter((i) => i && KINDS.has(i.kind)).map((i) => ({ text: String(i.text), kind: i.kind, source: i.source }));
    setNarrative({ summary: res.summary ?? res.text, insights });
  };

  const q = (n: number, title: string, items: InsightItem[]) => (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold"><span className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-accent-soft text-[11px] text-accent-text">{n}</span>{title}</h3>
      <InsightList items={items} />
    </section>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      width={880}
      title={`${anomaly.headline} — ${anomaly.label}`}
      subtitle={<span className="flex flex-wrap items-center gap-1.5"><Badge tone={SEV_TONE[anomaly.severity]} dot>{anomaly.severity}</Badge><Badge tone={TONE_TONE[anomaly.tone]}>{anomaly.tone === "worse" ? "Worse" : anomaly.tone === "better" ? "Better" : "Change"}</Badge>{anomaly.source}</span>}
      footer={
        writable ? (
          <>
            <Button icon={<ClipboardList className="size-3.5" />} onClick={createTask} disabled={created.task}>{created.task ? "Task created" : "Turn into task"}</Button>
            <Button variant="primary" icon={<Lightbulb className="size-3.5" />} onClick={createRec} disabled={created.rec}>{created.rec ? "Recommendation created" : "Create recommendation"}</Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><p className="text-[11px] text-fg-3">Last week</p><p className="text-lg font-semibold tabular-nums">{fmtMetric(anomaly.metric, anomaly.prev)}</p></Card>
          <Card className="p-3"><p className="text-[11px] text-fg-3">This week</p><p className="text-lg font-semibold tabular-nums">{fmtMetric(anomaly.metric, anomaly.curr)}</p></Card>
          <Card className="p-3"><p className="text-[11px] text-fg-3">Change</p><p className={cn("text-lg font-semibold tabular-nums", anomaly.tone === "worse" ? "text-danger" : anomaly.tone === "better" ? "text-success" : "")}>{fmtChange(anomaly.changePct)}</p></Card>
        </div>
        <InsightLegend />

        {q(1, "What happened?", inv.whatHappened)}
        {q(2, "Why did it happen?", inv.why)}
        {q(3, "What should we do next?", inv.next)}
        {q(4, "What should we test?", inv.tests)}

        {aiEnabled && (
          <Card className="p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold inline-flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent-text" /> AI narrative</p>
              <Button size="xs" variant="ai" loading={enriching} onClick={enrich}>{narrative ? "Regenerate" : "Enrich with AI"}</Button>
            </div>
            <p className="mt-1 text-[11px] text-fg-3">Numbers come from the analytics engine; the model only writes the narrative.</p>
            {narrative && (
              <div className="mt-2 space-y-2">
                {narrative.summary && <p className="text-[13px] text-fg-2 leading-relaxed">{narrative.summary}</p>}
                <InsightList items={narrative.insights} compact />
              </div>
            )}
          </Card>
        )}

        <section>
          <h3 className="mb-2 text-[13px] font-semibold">Finding → Evidence → Recommendation → Priority</h3>
          <Table className="rounded-lg border border-border">
            <thead><tr><Th>Finding</Th><Th>Evidence</Th><Th>Recommendation</Th><Th>Priority</Th></tr></thead>
            <tbody>
              {inv.findings.map((f, i) => (
                <tr key={i}>
                  <Td className="font-medium min-w-40">{f.finding}</Td>
                  <Td className="text-xs text-fg-2 min-w-40">{f.evidence}</Td>
                  <Td className="text-xs min-w-40">{f.recommendation}</Td>
                  <Td><Badge tone={SEV_TONE[f.priority]}>{f.priority}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <section>
          <h3 className="mb-1 text-[13px] font-semibold">Metric decomposition</h3>
          {inv.componentNote && <p className="mb-2 text-xs text-fg-2">{inv.componentNote}</p>}
          <Table className="rounded-lg border border-border">
            <thead><tr><Th>Metric</Th><Th className="text-right">Last week</Th><Th className="text-right">This week</Th><Th className="text-right">Change</Th><Th>Meaning</Th></tr></thead>
            <tbody>
              {inv.decomposition.map((r) => (
                <tr key={r.label} className={r.label === anomaly.metric ? "bg-accent-soft/40" : ""}>
                  <Td className="font-medium">{r.label}</Td>
                  <Td className="text-right tabular-nums text-fg-2">{r.prev}</Td>
                  <Td className="text-right tabular-nums">{r.curr}</Td>
                  <Td className="text-right tabular-nums">{fmtChange(r.change)}</Td>
                  <Td className="text-[11px] text-fg-3 min-w-40">{r.note ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold">Factors investigated</h3>
          <Table className="rounded-lg border border-border">
            <thead><tr><Th>Factor</Th><Th>Status</Th><Th>Evidence</Th></tr></thead>
            <tbody>
              {inv.checks.map((c) => (
                <tr key={c.factor}>
                  <Td className="font-medium whitespace-nowrap">{c.factor}</Td>
                  <Td><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></Td>
                  <Td className="text-xs text-fg-2 min-w-64"><span className="flex items-start gap-2"><InsightTag kind={c.kind} /><span>{c.evidence}</span></span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        {drivers && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">What contributed most to the change</h3>
              <Segmented value={drivers.dimension} onChange={setDriverDim} options={inv.drivers.map((d) => ({ value: d.dimension, label: d.dimension }))} className="overflow-x-auto max-w-full" />
            </div>
            <Table className="rounded-lg border border-border">
              <thead><tr><Th>{drivers.dimension}</Th><Th className="text-right">Spend</Th><Th className="text-right">{anomaly.metric}</Th><Th className="text-right">Share of change</Th></tr></thead>
              <tbody>
                {drivers.rows.map((r) => (
                  <tr key={r.key}>
                    <Td className="max-w-72 truncate" >{r.key}</Td>
                    <Td className="text-right tabular-nums text-xs whitespace-nowrap">{money(r.spendPrev)} → {money(r.spendCurr)}</Td>
                    <Td className="text-right tabular-nums text-xs whitespace-nowrap">{fmtMetric(anomaly.metric, r.valuePrev)} → {fmtMetric(anomaly.metric, r.valueCurr)}</Td>
                    <Td className={cn("text-right tabular-nums font-medium", r.share >= 25 ? "text-danger" : r.share < 0 ? "text-success" : "")}>{Number.isFinite(r.share) ? `${r.share.toFixed(0)}%` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-1 text-[11px] text-fg-3">Additive decomposition: shares sum to 100% of the total change; negative shares offset it.</p>
          </section>
        )}
      </div>
    </Drawer>
  );
}
