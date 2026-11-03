"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import { SERVICES, type ProposalLine, type Service } from "@/lib/types";
import { DEFAULT_PRICE_BOOK, type GeneratedProposal, type PriceBookEntry } from "@/lib/ai/proposal";
import {flushCRMChanges} from "@/lib/crmSync";
import { cn, DAY, money, sum } from "@/lib/utils";
import { AIBadge, Button, Checkbox, Field, Input, InsightList, Modal, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ServicePicker } from "@/components/deals/DealDrawer";
import { proposalContractValue } from "./workflow";
import styles from "./proposal.module.css";

const emptyPrices=()=>DEFAULT_PRICE_BOOK.map(p=>({...p,setup:0,monthly:0}));

export function ProposalGenerator({ open, onClose, dealId: initialDeal, leadId: initialLead, onCreated }: { open: boolean; onClose: () => void; dealId?: string; leadId?: string; onCreated?: (id: string) => void }) {
  const deals = useCRM((s) => s.deals);
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const meetings = useCRM((s) => s.meetings);
  const strategies = useCRM((s) => s.strategies);

  // Target: an existing deal, or a lead (a deal is created on save).
  const initialTarget = initialDeal ? `deal:${initialDeal}` : initialLead ? (deals.find((d) => d.leadId === initialLead) ? `deal:${deals.find((d) => d.leadId === initialLead)!.id}` : `lead:${initialLead}`) : "";
  const [target, setTarget] = useState(initialTarget);
  const [kind, id] = target.split(":") as ["deal" | "lead" | "client" | "", string];
  const deal = kind === "deal" ? deals.find((d) => d.id === id) : undefined;
  const lead = kind === "lead" ? leads.find((l) => l.id === id) : deal?.leadId ? leads.find((l) => l.id === deal.leadId) : undefined;
  const client = clients.find(c=>c.id===(kind==="client"?id:deal?.clientId));
  const company = deal?.company ?? lead?.company ?? client?.company ?? "";

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
  const savedPrices=useCRM(s=>s.settings.proposalPriceBook);
  const priceBook=emptyPrices().map(p=>savedPrices.find(saved=>saved.service===p.service)??p);
  const setPriceBook=(prices:PriceBookEntry[])=>useCRM.setState(s=>({settings:{...s.settings,proposalPriceBook:prices}}));
  const [strategyNotes,setStrategyNotes]=useState("");
  const [deliverableRequirements,setDeliverableRequirements]=useState("");
  const [timelineRequirements,setTimelineRequirements]=useState("");
  const [durationMonths,setDurationMonths]=useState(3);
  const [terms,setTerms]=useState("");
  const [source,setSource]=useState("");
  const [snapshot,setSnapshot]=useState<import("@/lib/types").Proposal["clientSnapshot"]>();
  const [draftKey,setDraftKey]=useState("");
  const [pricingChecked,setPricingChecked]=useState(false);
  const [expires, setExpires] = useState(() => new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10));
  const [draft, setDraft] = useState<GeneratedProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateValue, setUpdateValue] = useState(true);
  const inputKey=JSON.stringify({target,notes,services,strategy:strategy?.summary,strategyNotes,deliverableRequirements,timelineRequirements,priceBook,durationMonths});
  const stale=!!draft&&draftKey!==inputKey;

  const setPrice = (s: Service, patch: Partial<PriceBookEntry>) => {
    const next = priceBook.map((p) => (p.service === s ? { ...p, ...patch } : p));
    setPriceBook(next);
  };

  const generate = async () => {
    if(!company||!services.length)return toast("Select a client, deal or lead and at least one service",undefined,"warning");
    setBusy(true);const account=useCRM.getState().currentUserId,captured=inputKey;
    try{
      await flushCRMChanges();
      const response=await fetch("/api/ai/proposal",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({targetKind:kind,targetId:id,services,discoveryNotes:notes,strategySummary:[strategy?.summary,strategyNotes].filter(Boolean).join("\n"),deliverableRequirements,timelineRequirements,priceBook,durationMonths}),signal:AbortSignal.timeout(85000)});
      const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not generate proposal");
      if(useCRM.getState().currentUserId!==account)return;
      setDraft(data.draft);setSource(data.source);setSnapshot(data.clientSnapshot);setDraftKey(captured);setPricingChecked(false);
    }catch(error){toast("Proposal generation failed",error instanceof Error?error.message:"Please retry","warning");}
    finally{setBusy(false);}
  };

  const setLine = (i: number, patch: Partial<ProposalLine>) => {setPricingChecked(false);if(draft)setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });};

  const save = () => {
    if (!draft||stale||!pricingChecked||!draft.title.trim()||!draft.lines.length||draft.lines.some(l=>!l.description.trim()||!Number.isFinite(l.price)||l.price<0)||!expires) return;
    const s = useCRM.getState();
    let dealId = deal?.id;
    const value = proposalContractValue({...draft,durationMonths});
    if (!dealId && lead) {
      const d = s.addDeal({ title: `${lead.company} — ${services[0] ?? "Growth retainer"}`, leadId: lead.id, company: lead.company, value, services, probability: 60, expectedClose: new Date(Date.now() + 21 * DAY).toISOString(), ownerId: lead.ownerId, stage: "Proposal", notes: "", paymentStatus: "Pending" });
      dealId = d.id;
      if (["New", "Researching", "Qualified", "Contacted", "Replied", "Meeting"].includes(lead.status)) s.setLeadStatus(lead.id, "Proposal");
    } else if (dealId && updateValue) {
      s.updateDeal(dealId, { value, services });
    }
    if(!dealId&&client){dealId=s.addDeal({title:`${client.company} — ${services[0]??"Opportunity"}`,company:client.company,clientId:client.id,value,services,probability:60,expectedClose:new Date(Date.now()+21*DAY).toISOString(),ownerId:client.accountManagerId,stage:"Proposal",notes:"",paymentStatus:"Pending"}).id;}
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
      durationMonths,terms:terms.split("\n").map(t=>t.trim()).filter(Boolean),generationSource:source,clientSnapshot:snapshot,
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
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>{draft && <Button variant="primary" disabled={stale||!pricingChecked||!draft.title.trim()||!expires||!draft.lines.length||draft.lines.some(l=>!l.description.trim()||!Number.isFinite(l.price)||l.price<0)} onClick={save}>Save draft proposal</Button>}</>}>
      <div className={`grid gap-5 lg:grid-cols-2 ${styles.generator}`}>
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
              <optgroup label="Existing clients">{clients.map(c=><option key={c.id} value={`client:${c.id}`}>{c.company}</option>)}</optgroup>
            </Select>
          </Field>
          <Field label="Strategy notes" hint="Add the strategy to propose, alongside any linked strategy document."><Textarea value={strategyNotes} maxLength={10000} rows={3} onChange={e=>setStrategyNotes(e.target.value)}/></Field>
          <Field label="Required deliverables" hint="One per line. Explicit requirements are preserved in the generated scope."><Textarea value={deliverableRequirements} maxLength={10000} rows={3} onChange={e=>setDeliverableRequirements(e.target.value)}/></Field>
          <Field label="Timeline requirements"><Textarea value={timelineRequirements} maxLength={5000} rows={2} onChange={e=>setTimelineRequirements(e.target.value)} placeholder="Preferred start date, milestones and dependencies"/></Field>
          <Field label="Engagement duration (months)"><Input type="number" min={1} max={36} value={durationMonths} onChange={e=>setDurationMonths(Number(e.target.value))}/></Field>
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
              Price book (₹) <button className="inline-flex items-center gap-1 text-[11px] text-fg-3 hover:text-fg" onClick={() => setPriceBook(emptyPrices())}><RotateCcw className="size-3" /> Clear prices</button>
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-fg-3"><tr><th className="px-2 py-1.5 text-left font-medium">Service</th><th className="px-2 py-1.5 text-left font-medium">Setup</th><th className="px-2 py-1.5 text-left font-medium">Monthly</th></tr></thead>
                <tbody>
                  {(services.length ? priceBook.filter((p) => services.includes(p.service)) : priceBook.slice(0, 4)).map((p) => (
                    <tr key={p.service} className="border-t border-border">
                      <td className="px-2 py-1"><span className="font-medium">{p.service}</span>{p.note && <span className="block text-[10px] text-fg-3">{p.note}</span>}</td>
                      <td className="px-2 py-1"><Input aria-label={`${p.service} setup price`} type="number" min={0} className="h-7 w-24" value={p.setup} onChange={(e) => setPrice(p.service, { setup: Number(e.target.value) })} /></td>
                      <td className="px-2 py-1"><Input aria-label={`${p.service} monthly price`} type="number" min={0} className="h-7 w-24" value={p.monthly} onChange={(e) => setPrice(p.service, { monthly: Number(e.target.value) })} /></td>
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
              <p className="rounded-lg bg-accent-soft p-3 text-xs">Generation: {source}. Scope and timing are proposed for review.</p>
              {stale&&<p role="alert" className="text-sm text-warning">Inputs changed. Regenerate before saving this proposal.</p>}
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
                  <div className="rounded-lg bg-surface-2 p-2"><p className="text-fg-3">{durationMonths}-month value</p><p className="font-semibold tabular-nums">{money(oneTime + monthly * durationMonths)}</p></div>
                </div>
                {deal && <label className="mt-2 flex items-center gap-2 text-xs text-fg-2"><Checkbox checked={updateValue} onChange={setUpdateValue} /> Update deal value to {money(oneTime + monthly * durationMonths)}</label>}
              </div>
              <Field label="Deliverables (one per line)">
                <Textarea rows={5} value={draft.deliverables.join("\n")} onChange={(e) => setDraft({ ...draft, deliverables: e.target.value.split("\n").filter((x) => x.trim()) })} />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-2">Timeline</p>
                <ol className="space-y-1">
                  {draft.timeline.map((t, i) => (
                    <li key={i} className="space-y-2 rounded-lg border border-border p-2"><Input aria-label={`Timeline phase ${i+1}`} value={t.phase} onChange={e=>setDraft({...draft,timeline:draft.timeline.map((row,n)=>n===i?{...row,phase:e.target.value}:row)})}/><Input aria-label={`Timeline timing ${i+1}`} value={t.weeks} onChange={e=>setDraft({...draft,timeline:draft.timeline.map((row,n)=>n===i?{...row,weeks:e.target.value}:row)})}/><Textarea aria-label={`Timeline detail ${i+1}`} value={t.detail} onChange={e=>setDraft({...draft,timeline:draft.timeline.map((row,n)=>n===i?{...row,detail:e.target.value}:row)})}/></li>
                  ))}
                </ol>
              </div>
              <Field label="Commercial terms (one per line)"><Textarea rows={3} value={terms} onChange={e=>setTerms(e.target.value)} placeholder="Enter reviewed payment terms, taxes, exclusions and dependencies"/></Field>
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={pricingChecked} onChange={setPricingChecked}/>I have checked the pricing, scope and proposed timeline.</label>
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
