"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import { SERVICES, type ProposalLine, type Service } from "@/lib/types";
import { buildProposal, DEFAULT_PRICE_BOOK, type GeneratedProposal, type PriceBookEntry } from "@/lib/ai/proposal";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { cn, DAY, money, sum } from "@/lib/utils";
import { AIBadge, Badge, Button, Checkbox, Field, Input, InsightList, Modal, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ServicePicker } from "@/components/deals/DealDrawer";
import { proposalContractValue } from "./workflow";

const PB_KEY = "adbibe.priceBook";
function loadPriceBook(): PriceBookEntry[] {
  try {
    const raw = localStorage.getItem(PB_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as PriceBookEntry[];
      return DEFAULT_PRICE_BOOK.map((d) => saved.find((s) => s.service === d.service) ?? d);
    }
  } catch {}
  return DEFAULT_PRICE_BOOK;
}
function savePriceBook(pb: PriceBookEntry[]) {
  try {
    localStorage.setItem(PB_KEY, JSON.stringify(pb));
  } catch {}
}

export function ProposalGenerator({ open, onClose, dealId: initialDeal, leadId: initialLead, onCreated }: { open: boolean; onClose: () => void; dealId?: string; leadId?: string; onCreated?: (id: string) => void }) {
  const deals = useCRM((s) => s.deals);
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const meetings = useCRM((s) => s.meetings);
  const strategies = useCRM((s) => s.strategies);

  // Target: an existing deal, or a lead (a deal is created on save).
  const initialTarget = initialDeal ? `deal:${initialDeal}` : initialLead ? (deals.find((d) => d.leadId === initialLead) ? `deal:${deals.find((d) => d.leadId === initialLead)!.id}` : `lead:${initialLead}`) : "";
  const [target, setTarget] = useState(initialTarget);
  const [kind, id] = target.split(":") as ["deal" | "lead" | "", string];
  const deal = kind === "deal" ? deals.find((d) => d.id === id) : undefined;
  const lead = kind === "lead" ? leads.find((l) => l.id === id) : deal?.leadId ? leads.find((l) => l.id === deal.leadId) : undefined;
  const client = deal?.clientId ? clients.find((c) => c.id === deal.clientId) : undefined;
  const company = deal?.company ?? lead?.company ?? "";

  const defaultNotes = useMemo(() => {
    const parts: string[] = [];
    if (lead?.notes) parts.push(lead.notes);
    if (deal?.notes) parts.push(deal.notes);
    meetings.filter((m) => (lead && m.leadId === lead.id) || (deal && m.dealId === deal.id)).forEach((m) => m.notes && parts.push(`Meeting (${m.title}): ${m.notes}`));
    if (lead?.research?.outreachAngle) parts.push(`Research angle: ${lead.research.outreachAngle}`);
    return parts.join("\n");
  }, [lead, deal, meetings]);

  const [notesState, setNotes] = useState<{ key: string; value: string } | null>(null);
  const notes = notesState?.key === target ? notesState.value : defaultNotes;
  const [servicesState, setServices] = useState<{ key: string; value: Service[] } | null>(null);
  const services = servicesState?.key === target ? servicesState.value : deal?.services ?? lead?.services ?? lead?.research?.recommendedServices ?? [];
  const relevantStrategies = useMemo(() => strategies.filter((s) => (client && s.clientId === client.id) || (lead && s.leadId === lead.id)), [strategies, client, lead]);
  const [strategyId, setStrategyId] = useState<string>("");
  const strategy = relevantStrategies.find((s) => s.id === strategyId) ?? (strategyId === "" ? relevantStrategies[0] : undefined);
  const [priceBook, setPriceBook] = useState<PriceBookEntry[]>(() => (typeof window === "undefined" ? DEFAULT_PRICE_BOOK : loadPriceBook()));
  const [expires, setExpires] = useState(() => new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10));
  const [draft, setDraft] = useState<GeneratedProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateValue, setUpdateValue] = useState(true);

  const setPrice = (s: Service, patch: Partial<PriceBookEntry>) => {
    const next = priceBook.map((p) => (p.service === s ? { ...p, ...patch } : p));
    setPriceBook(next);
    savePriceBook(next);
  };

  const generate = async () => {
    if (!company) return toast("Pick a deal or lead first", undefined, "warning");
    if (!services.length) return toast("Select at least one service", undefined, "warning");
    setBusy(true);
    const out = await runAgentJob({
      agent: "sales",
      title: `Proposal draft — ${company}`,
      clientId: client?.id,
      local: () => buildProposal({ company, industry: lead?.industry ?? client?.industry, contactName: lead?.name ?? client?.contacts[0]?.name, location: lead?.location ?? client?.location, services, discoveryNotes: notes, strategy: strategy ?? null, priceBook, monthlyAdSpend: client?.monthlyAdSpend }),
    });
    if (out) {
      // With an AI provider configured, let the Sales agent rewrite the strategy summary from the same inputs.
      const ai = await callAgent("sales", "Write a 2–3 sentence strategy summary for a marketing agency proposal. Use only the given inputs; do not invent numbers.", { company, services, notes, strategy: strategy?.summary }, { format: "text", clientId: client?.id });
      if (ai?.text) out.strategySummary = ai.text.trim();
      setDraft(out);
    }
    setBusy(false);
  };

  const setLine = (i: number, patch: Partial<ProposalLine>) => draft && setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const save = () => {
    if (!draft) return;
    const s = useCRM.getState();
    let dealId = deal?.id;
    const value = proposalContractValue(draft);
    if (!dealId && lead) {
      const d = s.addDeal({ title: `${lead.company} — ${services[0] ?? "Growth retainer"}`, leadId: lead.id, company: lead.company, value, services, probability: 60, expectedClose: new Date(Date.now() + 21 * DAY).toISOString(), ownerId: lead.ownerId, stage: "Proposal", notes: "", paymentStatus: "Pending" });
      dealId = d.id;
      if (["New", "Researching", "Qualified", "Contacted", "Replied", "Meeting"].includes(lead.status)) s.setLeadStatus(lead.id, "Proposal");
    } else if (dealId && updateValue) {
      s.updateDeal(dealId, { value, services });
    }
    if (!dealId) return;
    const mode = s.modeFor("Proposals");
    const p = s.addProposal({
      dealId,
      title: draft.title,
      company,
      lines: draft.lines,
      status: "Draft",
      expiresAt: new Date(`${expires}T12:00:00`).toISOString(),
      approval: mode === "Approval Required" ? "Awaiting" : "Not Required",
      discoveryNotes: notes,
      strategySummary: draft.strategySummary,
      deliverables: draft.deliverables,
      timeline: draft.timeline,
    });
    toast("Proposal saved as draft", "Submit it for internal review before sending.");
    onCreated?.(p.id);
    onClose();
  };

  const oneTime = draft ? sum(draft.lines.filter((l) => l.billing === "one-time").map((l) => l.price)) : 0;
  const monthly = draft ? sum(draft.lines.filter((l) => l.billing === "monthly").map((l) => l.price)) : 0;
  const openDeals = deals.filter((d) => !["Won", "Lost"].includes(d.stage));

  return (
    <Modal open={open} onClose={onClose} size="xl" title={<span className="flex items-center gap-2">AI proposal generator <AIBadge>Sales agent</AIBadge></span>} subtitle="Built from the client record, discovery notes, selected services, strategy and your price book."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>{draft && <Button variant="primary" onClick={save}>Save draft proposal</Button>}</>}>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-3">
          <Field label="Deal or lead">
            <Select value={target} onChange={(e) => { setTarget(e.target.value); setDraft(null); setStrategyId(""); }}>
              <option value="">Select…</option>
              <optgroup label="Open deals">
                {openDeals.map((d) => <option key={d.id} value={`deal:${d.id}`}>{d.company} · {d.stage}</option>)}
              </optgroup>
              <optgroup label="Leads without a deal">
                {leads.filter((l) => !deals.some((d) => d.leadId === l.id) && !["Won", "Lost"].includes(l.status)).slice(0, 200).map((l) => <option key={l.id} value={`lead:${l.id}`}>{l.company} · {l.name}</option>)}
              </optgroup>
            </Select>
          </Field>
          {company && (
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2">
              <b className="text-fg">{company}</b>
              {(lead?.industry ?? client?.industry) && <> · {lead?.industry ?? client?.industry}</>}
              {(lead?.location ?? client?.location) && <> · {lead?.location ?? client?.location}</>}
              {(lead?.name ?? client?.contacts[0]?.name) && <> · Contact: {lead?.name ?? client?.contacts[0]?.name}</>}
            </div>
          )}
          <Field label="Required services"><ServicePicker value={services} onChange={(v) => setServices({ key: target, value: v })} /></Field>
          <Field label="Discovery notes" hint="Prefilled from lead notes, deal notes and meeting notes.">
            <Textarea rows={5} value={notes} onChange={(e) => setNotes({ key: target, value: e.target.value })} placeholder="Goals, current performance, budget, timelines, objections…" />
          </Field>
          <Field label="Strategy" hint={relevantStrategies.length ? undefined : "No strategy document for this client/lead — create one in Strategy for a sharper proposal."}>
            <Select value={strategy?.id ?? "none"} onChange={(e) => setStrategyId(e.target.value === "none" ? "none" : e.target.value)} disabled={!relevantStrategies.length}>
              <option value="none">No strategy</option>
              {relevantStrategies.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.status}</option>)}
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 flex items-center justify-between text-xs font-medium text-fg-2">
              Price book (₹) <button className="inline-flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg" onClick={() => { setPriceBook(DEFAULT_PRICE_BOOK); savePriceBook(DEFAULT_PRICE_BOOK); }}><RotateCcw className="size-3" /> Reset defaults</button>
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-fg-3"><tr><th className="px-2 py-1.5 text-left font-medium">Service</th><th className="px-2 py-1.5 text-left font-medium">Setup</th><th className="px-2 py-1.5 text-left font-medium">Monthly</th></tr></thead>
                <tbody>
                  {(services.length ? priceBook.filter((p) => services.includes(p.service)) : priceBook.slice(0, 4)).map((p) => (
                    <tr key={p.service} className="border-t border-border">
                      <td className="px-2 py-1"><span className="font-medium">{p.service}</span>{p.note && <span className="block text-[10px] text-fg-3">{p.note}</span>}</td>
                      <td className="px-2 py-1"><Input type="number" className="h-7 w-24" value={p.setup} onChange={(e) => setPrice(p.service, { setup: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1"><Input type="number" className="h-7 w-24" value={p.monthly} onChange={(e) => setPrice(p.service, { monthly: Number(e.target.value) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Valid until"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <Button variant="ai" icon={<Sparkles className="size-3.5" />} loading={busy} onClick={generate} className="mb-px">{draft ? "Regenerate" : "Generate proposal"}</Button>
          </div>
        </div>

        {/* Output */}
        <div className="min-w-0 space-y-3">
          {!draft ? (
            <div className="grid h-full min-h-60 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-xs text-fg-3">
              <div>
                <Sparkles className="mx-auto mb-2 size-5 text-accent" />
                Pick a deal or lead, confirm services and pricing, then generate. You can edit everything before saving.
              </div>
            </div>
          ) : (
            <>
              <Field label="Title"><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
              <Field label="Strategy summary"><Textarea rows={3} value={draft.strategySummary} onChange={(e) => setDraft({ ...draft, strategySummary: e.target.value })} /></Field>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-2">Investment</p>
                <div className="space-y-1.5">
                  {draft.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-1.5">
                      <Select className="col-span-12 sm:col-span-3 h-7 text-xs" value={l.service} onChange={(e) => setLine(i, { service: e.target.value as Service })}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</Select>
                      <Input className="col-span-12 sm:col-span-4 h-7 text-xs" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      <Input className="col-span-5 sm:col-span-2 h-7 text-xs" type="number" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) })} />
                      <Select className="col-span-5 sm:col-span-2 h-7 text-xs" value={l.billing} onChange={(e) => setLine(i, { billing: e.target.value as ProposalLine["billing"] })}><option value="monthly">Monthly</option><option value="one-time">One-time</option></Select>
                      <button className="col-span-2 sm:col-span-1 grid place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-danger" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })} aria-label="Remove line"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setDraft({ ...draft, lines: [...draft.lines, { service: services[0] ?? "Meta Ads", description: "", price: 0, billing: "monthly" }] })}>Add line</Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">One-time</p><p className="font-semibold tabular-nums">{money(oneTime)}</p></div>
                  <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">Monthly</p><p className="font-semibold tabular-nums">{money(monthly)}</p></div>
                  <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">Year-1 value</p><p className="font-semibold tabular-nums">{money(oneTime + monthly * 12)}</p></div>
                </div>
                {deal && <label className="mt-2 flex items-center gap-2 text-xs text-fg-2"><Checkbox checked={updateValue} onChange={setUpdateValue} /> Update deal value to {money(oneTime + monthly * 12)}</label>}
              </div>
              <Field label="Deliverables (one per line)">
                <Textarea rows={5} value={draft.deliverables.join("\n")} onChange={(e) => setDraft({ ...draft, deliverables: e.target.value.split("\n").filter((x) => x.trim()) })} />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-2">Timeline</p>
                <ol className="space-y-1">
                  {draft.timeline.map((t, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <Badge className="w-24 justify-center">{t.weeks}</Badge>
                      <span className="min-w-0"><b className="font-medium">{t.phase}</b> <span className="text-fg-3">— {t.detail}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className={cn("rounded-lg border border-border p-3")}>
                <p className="mb-1.5 text-[11px] font-medium text-fg-3">What the generator used (internal — not shown to the client)</p>
                <InsightList items={draft.sources} compact />
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
