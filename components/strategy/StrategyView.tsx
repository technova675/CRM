"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Megaphone, Plus, Printer, RefreshCw, Send, Trash2, Undo2 } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { normalizeBudget, strategyContextUsed, withAmounts } from "@/lib/ai/strategy";
import { AGENTS } from "@/lib/ai/agents";
import type { StrategyDoc, StrategyPersona } from "@/lib/types";
import { cn, compactMoney, fmtDate, money, relTime } from "@/lib/utils";
import { Donut, Legend } from "@/components/charts";
import { AgentChip, Badge, Button, Card, CardHeader, Input, InsightLegend, MemberAvatar, Modal, Table, Td, Th, type Tone } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ContextUsed, EditableInsights, EditableText, SectionCard } from "./shared";
import { approveStrategy, backToDraft, createCampaignsFromStrategy, generateStrategyDoc, submitForReview, updateStrategy } from "./actions";
import { downloadStrategyMarkdown, printStrategy } from "./export";

export const STRATEGY_TONE: Record<StrategyDoc["status"], Tone> = { Draft: "neutral", "In Review": "warning", Approved: "success" };
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function StrategyView({ doc, onBack }: { doc: StrategyDoc; onBack: () => void }) {
  const me = useMe();
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const knowledge = useCRM((s) => s.knowledge);
  const approvals = useCRM((s) => s.approvals);
  const mode = useCRM((s) => s.settings.approvalModes["Strategy documents"]);
  const writable = can(me.role, "strategy", "write") && me.role !== "client";
  const client = clients.find((c) => c.id === doc.clientId);
  const [busy, setBusy] = useState(false);
  const [confirmCampaigns, setConfirmCampaigns] = useState(false);
  const pending = approvals.find((a) => a.status === "pending" && a.ref?.type === "strategy" && a.ref.id === doc.id);

  const context = useMemo(
    () => (client ? strategyContextUsed({ client, campaigns: campaigns.filter((c) => c.clientId === client.id), knowledge: knowledge.find((k) => k.clientId === client.id) }) : [{ label: "Inputs only", value: "No client linked" }]),
    [client, campaigns, knowledge],
  );

  const edit = (patch: Partial<StrategyDoc>) => {
    if (updateStrategy(doc, patch)) toast("Approval reset", "The strategy was edited after approval — resubmit for review.", "warning");
  };

  const budgetSum = doc.budget.reduce((a, b) => a + b.pct, 0);
  const amountSum = doc.budget.reduce((a, b) => a + b.amount, 0);
  const setBudgetRow = (i: number, patch: Partial<StrategyDoc["budget"][number]>) => {
    const rows = doc.budget.map((b, j) => (j === i ? { ...b, ...patch } : b));
    edit({ budget: withAmounts(rows, doc.inputs.monthlyBudget) });
  };
  const setTotal = (v: number) => edit({ inputs: { ...doc.inputs, monthlyBudget: v }, budget: withAmounts(doc.budget, v) });

  const regenerate = async () => {
    setBusy(true);
    const next = await generateStrategyDoc({ inputs: doc.inputs, clientId: doc.clientId, existing: doc });
    setBusy(false);
    if (next) toast(`Regenerated as v${next.version}`, "Previous edits were replaced by the new draft.", "ai");
  };

  const submit = () => {
    const r = submitForReview(doc);
    toast(r === "approval" ? "Sent for approval" : "Submitted for review", r === "approval" ? "Approve it in Automations → Approvals, or approve directly here." : undefined, r === "approval" ? "warning" : "success");
  };

  const makeCampaigns = () => {
    const r = createCampaignsFromStrategy(doc);
    setConfirmCampaigns(false);
    toast(r.created ? `${r.created} Planning campaign(s) created` : "Nothing to create", r.skipped ? `${r.skipped} already existed` : "Find them in Campaigns → Planning.");
  };

  const setPersona = (i: number, patch: Partial<StrategyPersona>) => edit({ personas: doc.personas.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg mb-1.5"><ArrowLeft className="size-3.5" /> All strategies</button>
          <h1 className="text-xl font-semibold tracking-tight"><EditableText value={doc.title} disabled={!writable} onSave={(title) => title && edit({ title })} /></h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <Badge tone={STRATEGY_TONE[doc.status]} dot>{doc.status}</Badge>
            <Badge>v{doc.version}</Badge>
            {client ? <Link href={`/clients/${client.id}`} className="hover:underline text-fg-2">{client.company}</Link> : <span>No client</span>}
            <span>·</span><MemberAvatar id={doc.ownerId} size={16} showName />
            <span>· updated {relTime(doc.updatedAt)}</span>
            {doc.approvedAt && <span>· approved {fmtDate(doc.approvedAt)}{doc.approvedBy && <> by <MemberAvatar id={doc.approvedBy} size={14} showName /></>}</span>}
            <AgentChip name={AGENTS.strategy.name} color={AGENTS.strategy.color} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {writable && doc.status === "Draft" && <Button variant="primary" icon={<Send className="size-3.5" />} onClick={submit}>{mode === "Approval Required" ? "Submit for approval" : "Submit for review"}</Button>}
          {writable && doc.status === "In Review" && <Button variant="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => { approveStrategy(doc); toast("Strategy approved"); }}>Approve</Button>}
          {writable && doc.status !== "Draft" && <Button icon={<Undo2 className="size-3.5" />} onClick={() => { backToDraft(doc); toast("Moved back to draft"); }}>Back to draft</Button>}
          {writable && <Button variant="ai" loading={busy} icon={<RefreshCw className="size-3.5" />} onClick={regenerate}>Regenerate</Button>}
          {writable && doc.clientId && (
            <Button icon={<Megaphone className="size-3.5" />} disabled={doc.status !== "Approved"} title={doc.status !== "Approved" ? "Approve the strategy first — humans review before execution" : undefined} onClick={() => setConfirmCampaigns(true)}>Create campaigns</Button>
          )}
          <Button icon={<Download className="size-3.5" />} onClick={() => downloadStrategyMarkdown(doc, client?.company)}>Markdown</Button>
          <Button icon={<Printer className="size-3.5" />} onClick={() => !printStrategy(doc, client?.company) && toast("Pop-up blocked", "Allow pop-ups to print the strategy.", "warning")}>Print</Button>
        </div>
      </div>

      {pending && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          Awaiting approval (requested {relTime(pending.createdAt)}) — <Link href="/automations?tab=approvals" className="underline">open Approvals</Link>{writable ? " or approve directly." : "."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2 min-w-0">
          <SectionCard title="Executive summary" action={<InsightLegend />}>
            <p className="text-[13px] text-fg-2 leading-relaxed"><EditableText value={doc.summary} multiline disabled={!writable} onSave={(summary) => edit({ summary })} /></p>
          </SectionCard>

          <Card>
            <CardHeader
              title="Budget allocation"
              subtitle={<>Suggested split of <span className="font-medium text-fg-2">{money(doc.inputs.monthlyBudget)}</span> / month</>}
              action={writable && budgetSum !== 100 ? <Button size="xs" onClick={() => edit({ budget: normalizeBudget(doc.budget, doc.inputs.monthlyBudget) })}>Normalize to 100%</Button> : undefined}
            />
            <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[180px_1fr] items-start">
              <div>
                <Donut data={doc.budget.map((b) => ({ name: b.channel, value: b.amount }))} height={170} fmt={compactMoney} center={<div><p className="text-sm font-semibold">{compactMoney(amountSum)}</p><p className="text-[10px] text-fg-3">/ month</p></div>} />
                <div className="mt-2"><Legend items={doc.budget.map((b) => ({ label: b.channel, value: `${b.pct}%` }))} /></div>
              </div>
              <div className="min-w-0">
                <Table>
                  <thead><tr><Th>Channel</Th><Th className="w-20">%</Th><Th className="text-right">₹ / month</Th><Th>Rationale</Th>{writable && <Th className="w-8" />}</tr></thead>
                  <tbody>
                    {doc.budget.map((b, i) => (
                      <tr key={i}>
                        <Td className="font-medium"><EditableText value={b.channel} disabled={!writable} onSave={(channel) => channel && setBudgetRow(i, { channel })} /></Td>
                        <Td>{writable ? <Input type="number" min={0} max={100} value={b.pct} onChange={(e) => setBudgetRow(i, { pct: Math.max(0, Number(e.target.value)) })} className="h-7 w-16" /> : `${b.pct}%`}</Td>
                        <Td className="text-right tabular-nums">{money(b.amount)}</Td>
                        <Td className="text-xs text-fg-3 min-w-48"><EditableText value={b.rationale} disabled={!writable} onSave={(rationale) => setBudgetRow(i, { rationale })} /></Td>
                        {writable && <Td><button onClick={() => edit({ budget: withAmounts(doc.budget.filter((_, j) => j !== i), doc.inputs.monthlyBudget) })} className="text-fg-3 hover:text-danger" aria-label="Remove channel"><Trash2 className="size-3.5" /></button></Td>}
                      </tr>
                    ))}
                    <tr>
                      <Td className="font-medium">Total</Td>
                      <Td className={cn("font-semibold tabular-nums", budgetSum === 100 ? "text-success" : "text-danger")}>{budgetSum}%</Td>
                      <Td className="text-right font-semibold tabular-nums">{money(amountSum)}</Td>
                      <Td colSpan={writable ? 2 : 1}>
                        {writable ? (
                          <span className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
                            Budget ₹ <Input type="number" min={0} step={10000} defaultValue={doc.inputs.monthlyBudget} key={doc.inputs.monthlyBudget} onBlur={(e) => Number(e.target.value) !== doc.inputs.monthlyBudget && setTotal(Math.max(0, Number(e.target.value)))} className="h-7 w-28" />
                            <button onClick={() => edit({ budget: withAmounts([...doc.budget, { channel: "New channel", pct: 0, amount: 0, rationale: "Strategist addition" }], doc.inputs.monthlyBudget) })} className="inline-flex items-center gap-1 text-accent-text hover:underline"><Plus className="size-3" /> Add channel</button>
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                  </tbody>
                </Table>
                {budgetSum !== 100 && <p className="mt-2 text-xs text-danger">Allocation sums to {budgetSum}% — normalize before approval.</p>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Funnel" subtitle="Objective, channels and KPI per stage" />
            <div className="grid gap-px bg-border border-t border-border sm:grid-cols-4">
              {doc.funnel.map((f, i) => (
                <div key={f.stage} className="bg-surface p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-fg">{i + 1}. {f.stage}</p>
                  <p className="text-xs text-fg-2"><EditableText value={f.objective} multiline disabled={!writable} onSave={(objective) => edit({ funnel: doc.funnel.map((x, j) => (j === i ? { ...x, objective } : x)) })} /></p>
                  <div className="flex flex-wrap gap-1">{f.channels.map((c) => <Badge key={c}>{c}</Badge>)}</div>
                  <p className="text-[11px] text-fg-3">KPI: {f.kpi}</p>
                </div>
              ))}
            </div>
          </Card>

          {doc.sections.map((s, si) => (
            <SectionCard key={s.key} title={s.title} subtitle={`${s.items.length} lines`}>
              <EditableInsights items={s.items} disabled={!writable} onChange={(items) => edit({ sections: doc.sections.map((x, j) => (j === si ? { ...x, items } : x)) })} />
            </SectionCard>
          ))}

          <Card>
            <CardHeader title="Customer personas" action={writable && <Button size="xs" icon={<Plus className="size-3" />} onClick={() => edit({ personas: [...doc.personas, { name: "New persona", profile: "Describe the persona", pains: [], motivations: [], channels: [] }] })}>Add</Button>} />
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
              {doc.personas.map((p, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold"><EditableText value={p.name} disabled={!writable} onSave={(name) => name && setPersona(i, { name })} /></p>
                    {writable && <button onClick={() => edit({ personas: doc.personas.filter((_, j) => j !== i) })} className="text-fg-3 hover:text-danger" aria-label="Remove persona"><Trash2 className="size-3.5" /></button>}
                  </div>
                  <p className="text-fg-2"><EditableText value={p.profile} multiline disabled={!writable} onSave={(profile) => setPersona(i, { profile })} /></p>
                  <p><span className="text-fg-3">Pains: </span><EditableText value={p.pains.join(", ")} disabled={!writable} onSave={(v) => setPersona(i, { pains: splitList(v) })} /></p>
                  <p><span className="text-fg-3">Motivations: </span><EditableText value={p.motivations.join(", ")} disabled={!writable} onSave={(v) => setPersona(i, { motivations: splitList(v) })} /></p>
                  <p><span className="text-fg-3">Channels: </span><EditableText value={p.channels.join(", ")} disabled={!writable} onSave={(v) => setPersona(i, { channels: splitList(v) })} /></p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Testing roadmap" subtitle="One variable at a time; scale winners" action={writable && <Button size="xs" icon={<Plus className="size-3" />} onClick={() => edit({ testing: [...doc.testing, { week: "Week —", test: "New test", hypothesis: "Hypothesis" }] })}>Add</Button>} />
            <Table>
              <thead><tr><Th className="w-28">When</Th><Th>Test</Th><Th>Hypothesis</Th>{writable && <Th className="w-8" />}</tr></thead>
              <tbody>
                {doc.testing.map((t, i) => {
                  const set = (patch: Partial<typeof t>) => edit({ testing: doc.testing.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={i}>
                      <Td className="text-xs whitespace-nowrap"><EditableText value={t.week} disabled={!writable} onSave={(week) => set({ week })} /></Td>
                      <Td className="min-w-48"><EditableText value={t.test} disabled={!writable} onSave={(test) => set({ test })} /></Td>
                      <Td className="text-xs text-fg-2 min-w-48"><EditableText value={t.hypothesis} disabled={!writable} onSave={(hypothesis) => set({ hypothesis })} /></Td>
                      {writable && <Td><button onClick={() => edit({ testing: doc.testing.filter((_, j) => j !== i) })} className="text-fg-3 hover:text-danger" aria-label="Remove test"><Trash2 className="size-3.5" /></button></Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="KPI framework" subtitle="Targets are estimates until validated with live data" action={writable && <Button size="xs" icon={<Plus className="size-3" />} onClick={() => edit({ kpis: [...doc.kpis, { metric: "New KPI", target: "—", stage: "Conversion" }] })}>Add</Button>} />
            <Table>
              <thead><tr><Th>Metric</Th><Th>Target</Th><Th>Stage</Th>{writable && <Th className="w-8" />}</tr></thead>
              <tbody>
                {doc.kpis.map((k, i) => {
                  const set = (patch: Partial<typeof k>) => edit({ kpis: doc.kpis.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={i}>
                      <Td className="font-medium"><EditableText value={k.metric} disabled={!writable} onSave={(metric) => set({ metric })} /></Td>
                      <Td className="tabular-nums"><EditableText value={k.target} disabled={!writable} onSave={(target) => set({ target })} /></Td>
                      <Td className="text-xs text-fg-3"><EditableText value={k.stage} disabled={!writable} onSave={(stage) => set({ stage })} /></Td>
                      {writable && <Td><button onClick={() => edit({ kpis: doc.kpis.filter((_, j) => j !== i) })} className="text-fg-3 hover:text-danger" aria-label="Remove KPI"><Trash2 className="size-3.5" /></button></Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="Approval workflow" subtitle={`Strategy documents: ${mode}`} />
            <ol className="px-4 pb-4 space-y-2">
              {(["Draft", "In Review", "Approved"] as const).map((st, i) => {
                const idx = ["Draft", "In Review", "Approved"].indexOf(doc.status);
                return (
                  <li key={st} className="flex items-center gap-2 text-xs">
                    <span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-semibold", i < idx || doc.status === "Approved" ? "bg-success text-white" : i === idx ? "bg-accent text-white" : "bg-surface-3 text-fg-3")}>{i + 1}</span>
                    <span className={cn(i === idx ? "font-medium text-fg" : "text-fg-3")}>{st}</span>
                  </li>
                );
              })}
            </ol>
            <p className="px-4 pb-4 text-[11px] text-fg-3">Editing an approved strategy resets it to Draft. Regenerating bumps the version.</p>
          </Card>
          <Card>
            <CardHeader title="Inputs" subtitle="What the agent was given" />
            <dl className="px-4 pb-4 space-y-2 text-xs">
              {(
                [
                  ["Business", "business"], ["Product", "product"], ["Audience", "audience"], ["Geography", "geography"], ["Goals", "goals"],
                  ["Current performance", "currentPerformance"], ["Competitors", "competitors"], ["Existing channels", "channels"],
                ] as const
              ).map(([label, k]) => (
                <div key={k}>
                  <dt className="text-fg-3">{label}</dt>
                  <dd className="text-fg-2"><EditableText value={doc.inputs[k]} multiline disabled={!writable} onSave={(v) => edit({ inputs: { ...doc.inputs, [k]: v } })} /></dd>
                </div>
              ))}
              <div><dt className="text-fg-3">Monthly budget</dt><dd className="text-fg-2 tabular-nums">{money(doc.inputs.monthlyBudget)}</dd></div>
            </dl>
            {writable && <p className="px-4 pb-4 text-[11px] text-fg-3">Change inputs, then Regenerate to produce the next version.</p>}
          </Card>
          <ContextUsed items={context} />
        </div>
      </div>

      {confirmCampaigns && (
        <Modal open onClose={() => setConfirmCampaigns(false)} title="Create campaigns from strategy" subtitle="Creates one Planning campaign per budget line — nothing goes live until the media team launches it." footer={<><Button onClick={() => setConfirmCampaigns(false)}>Cancel</Button><Button variant="primary" onClick={makeCampaigns}>Create {doc.budget.filter((b) => b.amount > 0).length} campaign(s)</Button></>}>
          <ul className="space-y-1.5 text-[13px]">
            {doc.budget.filter((b) => b.amount > 0).map((b) => (
              <li key={b.channel} className="flex items-center justify-between gap-2"><span>{client?.company} · {b.channel}</span><span className="tabular-nums text-fg-2">{money(b.amount)}/mo</span></li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
