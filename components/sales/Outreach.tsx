"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, CheckCheck, ChevronRight, Eye, MailCheck, Pause, Play, Plus,
  FlaskConical, Rocket, Search, Send, ShieldOff, Sparkles, Target, Trash2, UserCheck, Workflow, X,
} from "lucide-react";
import { useCRM } from "@/lib/store";
import { CHANNELS, LEAD_STATUSES, type Channel, type Lead, type LeadStatus, type OutreachCampaign, type OutreachRecipient, type Sequence, type SequenceStep } from "@/lib/types";
import { effectiveScore } from "@/lib/ai/scoring";
import { renderStep } from "@/lib/ai/outreach";
import { cn, fmtDate, pct, relTime, uid } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, InsightList, Modal, Progress, ScorePill, Segmented, Select, StatusBadge, Textarea, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { INDUSTRIES } from "./LeadForms";
import { withOptOut, suppressed } from "@/lib/domain/outreach";
import { DeliveryTracking, useDeliveryStatus } from "./OutreachDelivery";

export function funnel(c: OutreachCampaign) {
  const f: Record<OutreachRecipient["state"], number> = { queued: 0, researching: 0, drafted: 0, approved: 0, sent: 0, replied: 0, stopped: 0, bounced: 0 };
  for (const r of c.recipients) f[r.state]++;
  const contacted = f.sent + f.replied + c.recipients.filter((r) => r.state === "stopped" && r.lastSentAt).length;
  return { ...f, total: c.recipients.length, contacted, replyRate: contacted ? (f.replied / contacted) * 100 : 0 };
}

// ---------------- A/B testing & templates ----------------
// The shared OutreachCampaign type has no variant fields, so A/B data is stored as extra
// properties on the campaign / recipients (persisted with the store, ignored elsewhere).
export type Variant = "A" | "B";
type ABTest = { variantB: { label: string; template: string } };
type ABCampaign = OutreachCampaign & { abTest?: ABTest };
type ABRecipient = OutreachRecipient & { variant?: Variant };
export const abOf = (c: OutreachCampaign) => (c as ABCampaign).abTest;
export const variantOf = (r: OutreachRecipient) => (r as ABRecipient).variant;

export const MESSAGE_TEMPLATES: { id: string; label: string; template: string }[] = [
  { id: "question", label: "Short question", template: "Hi {{first_name}}, is {{service}} a current priority for {{company}}? I'd welcome a short conversation about your goals before suggesting any work.\n\nReply stop to opt out." },
  { id: "audit", label: "Discovery review", template: "Hi {{first_name}}, would a discovery review of {{company}}'s {{service}} priorities be useful? We can first agree on what you want to evaluate.\n\nReply stop to opt out." },
  { id: "angle", label: "Research-led question", template: "Hi {{first_name}}, {{angle}}\n\nWould it be helpful to compare notes about {{company}}?\n\nReply stop to opt out." },
  { id: "intro", label: "Simple introduction", template: "Hi {{first_name}}, reaching out from Adbibe to ask whether {{company}} is exploring support with {{service}}. Is this something you'd like to discuss?\n\nReply stop to opt out." },
];

// Splits recipients alternately into A (AI-personalised) and B (template) and redrafts B.
export function setupABTest(campaignId: string, label: string, template: string) {
  const s = useCRM.getState();
  const leads = new Map(s.leads.map((l) => [l.id, l]));
  useCRM.setState((st) => ({
    outreach: st.outreach.map((c) => {
      if (c.id !== campaignId) return c;
      const recipients = c.recipients.map((r, i): ABRecipient => {
        const variant: Variant = i % 2 === 0 ? "A" : "B";
        const lead = leads.get(r.leadId);
        const redraft = variant === "B" && lead && ["drafted", "approved"].includes(r.state);
        return redraft ? { ...r, variant, draft: withOptOut(renderStep(template, lead, r.service ?? lead.services[0] ?? "Consulting", r.angle ?? lead.research?.outreachAngle ?? "")), state:"drafted",approvalToken:undefined,approvedAt:undefined,approvedBy:undefined,draftSource:"Personalized variant B template" } : { ...r,variant };
      });
      return { ...c, recipients, abTest: { variantB: { label, template } } } as ABCampaign;
    }),
  }));
  s.log({ actor: "human", actorId: s.currentUserId, entity: "outreach", entityId: campaignId, action: "Started A/B test", detail: `A: AI-personalised · B: ${label}` });
}

// Re-applies variant B drafts after the agent drafts newly queued recipients.
export function applyVariantDrafts(campaignId: string) {
  const s = useCRM.getState();
  const camp = s.outreach.find((c) => c.id === campaignId);
  const ab = camp && abOf(camp);
  if (!camp || !ab) return;
  const leads = new Map(s.leads.map((l) => [l.id, l]));
  useCRM.setState((st) => ({
    outreach: st.outreach.map((c) =>
      c.id !== campaignId
        ? c
        : {
            ...c,
            recipients: c.recipients.map((r, i): ABRecipient => {
              const variant = variantOf(r) ?? (i % 2 === 0 ? "A" : "B");
              const lead = leads.get(r.leadId);
              if (variant === "B" && r.state === "drafted" && lead) return { ...r, variant, draft: withOptOut(renderStep(ab.variantB.template, lead, r.service ?? lead.services[0] ?? "Consulting", r.angle ?? "")),approvalToken:undefined,approvedAt:undefined,approvedBy:undefined,draftSource:"Personalized variant B template" };
              return { ...r, variant };
            }),
          },
    ),
  }));
}

export function variantStats(c: OutreachCampaign) {
  const out = { A: { n: 0, contacted: 0, replied: 0, rate: 0 }, B: { n: 0, contacted: 0, replied: 0, rate: 0 } };
  c.recipients.forEach((r) => {
    const v = variantOf(r);
    if (!v) return;
    const o = out[v];
    o.n++;
    if (r.lastSentAt || r.state === "sent" || r.state === "replied") o.contacted++;
    if (r.state === "replied") o.replied++;
  });
  (["A", "B"] as const).forEach((v) => (out[v].rate = out[v].contacted ? (out[v].replied / out[v].contacted) * 100 : 0));
  return out;
}

function ABTestCard({ c, canWrite }: { c: OutreachCampaign; canWrite: boolean }) {
  const customTemplates=useCRM(s=>s.settings.outreachTemplates??[]);
  const templates=[...MESSAGE_TEMPLATES,...customTemplates];
  const ab = abOf(c);
  const [tplId, setTplId] = useState(MESSAGE_TEMPLATES[0]!.id);
  const [text, setText] = useState(MESSAGE_TEMPLATES[0]!.template);
  const [editing, setEditing] = useState(false);
  const st = variantStats(c);
  const sentAny = c.recipients.some((r) => r.lastSentAt);
  if (!ab && !canWrite) return null;
  if (!ab || editing) {
    return (
      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><FlaskConical className="size-3.5" /> A/B test</span>} subtitle="Variant A = AI-personalised draft from research · Variant B = a template. Recipients are split 50/50." />
        <div className="space-y-2 px-4 pb-4">
          {sentAny && !ab && <p className="text-xs text-warning">Messages were already sent — only unsent drafts switch to variant B.</p>}
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button key={t.id} onClick={() => { setTplId(t.id); setText(t.template); }} className={cn("rounded-md border px-2 py-1 text-xs", tplId === t.id ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>{t.label}</button>
            ))}
          </div>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-[11px] text-fg-3">{"Variables: {{first_name}} {{company}} {{service}} {{industry}} {{location}} {{angle}}"}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<FlaskConical className="size-3.5" />} disabled={!text.trim()} onClick={() => { setupABTest(c.id, MESSAGE_TEMPLATES.find((t) => t.id === tplId)?.label ?? "Custom", text); setEditing(false); toast("A/B test running", "Recipients split 50/50 · variant B drafts updated for review"); }}>{ab ? "Update variant B" : "Start A/B test"}</Button>
            {editing && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </div>
      </Card>
    );
  }
  const insights = [
    { kind: "data" as const, text: `A: ${st.A.replied}/${st.A.contacted} replied (${pct(st.A.rate)}) · B: ${st.B.replied}/${st.B.contacted} replied (${pct(st.B.rate)})`, source: "Outreach replies" },
    ...(st.A.contacted >= 10 && st.B.contacted >= 10 && Math.abs(st.A.rate - st.B.rate) >= 3
        ? [{ kind: "recommendation" as const, text: `Variant ${st.A.rate > st.B.rate ? "A (AI-personalised)" : `B (${ab.variantB.label})`} has an observed reply rate ${Math.abs(st.A.rate - st.B.rate).toFixed(1)} points higher. This is descriptive; no statistical significance has been established.` }]
      : [{ kind: "assumption" as const, text: "Insufficient evidence to name a winner. Reply rates are descriptive; no statistical significance has been established." }]),
  ];
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><FlaskConical className="size-3.5" /> A/B test</span>} subtitle={`A: AI-personalised · B: ${ab.variantB.label}`} action={canWrite && <Button size="xs" variant="ghost" onClick={() => { setText(ab.variantB.template); setEditing(true); }}>Edit variant B</Button>} />
      <div className="grid gap-3 px-4 pb-3 sm:grid-cols-2">
        {(["A", "B"] as const).map((v) => (
          <div key={v} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between"><Badge tone={v === "A" ? "accent" : "info"}>Variant {v}</Badge><span className="text-[11px] text-fg-3">{st[v].n} recipients</span></div>
            <p className="mt-2 text-xl font-semibold tabular-nums">{pct(st[v].rate)}<span className="ml-1 text-xs font-normal text-fg-3">reply rate</span></p>
            <p className="text-[11px] text-fg-3">{st[v].contacted} contacted · {st[v].replied} replied</p>
            <Progress value={st[v].rate * 3} tone={v === "A" ? "accent" : "success"} className="mt-2" />
          </div>
        ))}
      </div>
      <div className="px-4 pb-4"><InsightList items={insights} compact /></div>
    </Card>
  );
}

// ---------------- Campaign list ----------------
export function CampaignList({ onOpen }: { onOpen: (id: string) => void }) {
  const outreach = useCRM((s) => s.outreach);
  const team = useCRM((s) => s.team);
  if (!outreach.length) return <Card><EmptyState icon={<Send className="size-5" />} title="No outreach campaigns yet" description="Select 100, 500 or 1,000+ leads and let the AI agent research and draft personalized messages." /></Card>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {outreach.map((c) => {
        const f = funnel(c);
        return (
          <Card key={c.id} className="cursor-pointer p-4 transition hover:border-border-strong" onClick={() => onOpen(c.id)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{c.name}</p>
                <p className="text-xs text-fg-3">{c.channel} · {f.total} leads · {team.find((t) => t.id === c.ownerId)?.name.split(" ")[0]} · {relTime(c.createdAt)}</p>
              </div>
              <span className="flex items-center gap-1.5">{abOf(c) && <Badge tone="info"><FlaskConical className="size-3" /> A/B</Badge>}<StatusBadge status={c.status} /></span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {([["Queued", f.queued + f.researching], ["Drafted", f.drafted], ["Approved", f.approved], ["Sent", f.sent], ["Replied", f.replied], ["Stopped", f.stopped]] as const).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
                  <p className="text-[10px] text-fg-3">{k}</p>
                  <p className="text-sm font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-fg-3">Reply rate</span>
              <Progress value={f.replyRate * 3} tone="success" className="flex-1" />
              <span className="font-semibold tabular-nums">{pct(f.replyRate)}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------- New campaign wizard ----------------
const PRESETS = [
  { value: "100", label: "100 leads", n: 100 },
  { value: "500", label: "500 leads", n: 500 },
  { value: "1000", label: "1,000+ leads", n: Infinity },
] as const;

export function NewCampaignModal({ open, onClose, presetIds }: { open: boolean; onClose: () => void; presetIds?: string[] }) {
  const leads = useCRM((s) => s.leads);
  const suppressions=useCRM(s=>s.settings.suppressions);
  const customTemplates=useCRM(s=>s.settings.outreachTemplates??[]);
  const templates=[...MESSAGE_TEMPLATES,...customTemplates];
  const sequences = useCRM((s) => s.settings.sequences);
  const createOutreach = useCRM((s) => s.createOutreach);
  const generateDrafts = useCRM((s) => s.generateDrafts);
  const [name, setName] = useState(() => `Outreach — ${fmtDate(new Date().toISOString())}`);
  const [channel, setChannel] = useState<Channel>("Email");
  const [seqId, setSeqId] = useState(sequences[0]?.id ?? "seq_default");
  const [preset, setPreset] = useState<"100" | "500" | "1000">("100");
  const [statuses, setStatuses] = useState<LeadStatus[]>(["New", "Researching", "Qualified"]);
  const [industry, setIndustry] = useState("All");
  const [tag,setTag]=useState("");
  const [companySize,setCompanySize]=useState("All");
  const [minScore, setMinScore] = useState(40);
  const [busy, setBusy] = useState(false);
  const [abTpl, setAbTpl] = useState("");
  const usePreset = !!presetIds?.length;


  const eligible = useMemo(() => {
    if (usePreset) {
      const ids = new Set(presetIds);
      return leads.filter((l) => ids.has(l.id)&&!suppressed(l,suppressions));
    }
    return leads
      .filter((l) => !suppressed(l,suppressions) && statuses.includes(l.status) && (industry === "All" || l.industry === industry) && (!tag||l.tags.some(t=>t.toLowerCase().includes(tag.toLowerCase()))) && (companySize==="All"||l.companySize===companySize) && effectiveScore(l) >= minScore)
      .sort((a, b) => effectiveScore(b) - effectiveScore(a));
  }, [leads, usePreset, presetIds, statuses, industry, minScore,suppressions,tag,companySize]);
  const n = usePreset ? eligible.length : PRESETS.find((p) => p.value === preset)!.n;
  const selected = eligible.slice(0, n);
  const avg = selected.length ? Math.round(selected.reduce((a, l) => a + effectiveScore(l), 0) / selected.length) : 0;

  const start = async () => {
    if (!selected.length) return;
    setBusy(true);
    const id = createOutreach(name || "Untitled outreach", selected.map((l) => l.id), channel, seqId);
    onClose();
    toast("AI agent started", "Preparing up to 10 leads in this batch; remaining leads stay queued", "ai");
    window.dispatchEvent(new CustomEvent("outreach:open", { detail: id }));
    const tpl = templates.find((t) => t.id === abTpl);
    if (tpl) setupABTest(id, tpl.label, tpl.template);
    await generateDrafts(id);
    if (tpl) applyVariantDrafts(id);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New AI outreach campaign" subtitle="Choose a segment and channel. The agent researches and drafts in batches of 10; you review and approve every message."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ai" loading={busy} disabled={!selected.length} icon={<Sparkles className="size-3.5" />} onClick={start}>Create campaign & draft first batch</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Campaign name" className="sm:col-span-3"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Channel"><Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>{CHANNELS.filter((c) => c !== "Phone").map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Follow-up sequence" className="sm:col-span-2"><Select value={seqId} onChange={(e) => setSeqId(e.target.value)}>{sequences.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.steps.length} steps</option>)}</Select></Field>
          <Field label="A/B test (optional)" className="sm:col-span-3" hint="Variant A: AI-personalised from research · Variant B: the template you pick. Recipients split 50/50; reply rate tracked per variant.">
            <Select value={abTpl} onChange={(e) => setAbTpl(e.target.value)}><option value="">No A/B test</option>{templates.map((t) => <option key={t.id} value={t.id}>A vs B: {t.label}</option>)}</Select>
          </Field>
        </div>
        {usePreset ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px]"><span className="font-semibold">{eligible.length} leads</span> selected from the Leads page.</div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-2">Audience size</p>
              <Segmented value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Industry"><Select value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="All">All industries</option>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</Select></Field>
              <Field label="Lead tag"><Input value={tag} onChange={e=>setTag(e.target.value)} placeholder="Any tag"/></Field>
              <Field label="Company size"><Select value={companySize} onChange={e=>setCompanySize(e.target.value)}>{["All","Unknown","1-10","11-50","51-200","201-1000","1000+"].map(value=><option key={value}>{value}</option>)}</Select></Field>
              <Field label={`Minimum AI score: ${minScore}`}><input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-2">Include statuses</p>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_STATUSES.filter((s) => !["Won", "Lost"].includes(s)).map((s) => {
                  const on = statuses.includes(s);
                  return <button key={s} type="button" onClick={() => setStatuses(on ? statuses.filter((x) => x !== s) : [...statuses, s])} className={cn("rounded-md border px-2 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3")}>{s}</button>;
                })}
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-surface-2 p-3"><p className="text-[11px] text-fg-3">Eligible</p><p className="text-lg font-semibold tabular-nums">{eligible.length}</p></div>
          <div className="rounded-lg bg-surface-2 p-3"><p className="text-[11px] text-fg-3">Will be contacted</p><p className="text-lg font-semibold tabular-nums">{selected.length}</p></div>
          <div className="rounded-lg bg-surface-2 p-3"><p className="text-[11px] text-fg-3">Avg. score</p><p className="text-lg font-semibold tabular-nums">{avg}</p></div>
        </div>
        {!usePreset && n !== Infinity && eligible.length < n && <p className="text-xs text-warning">Only {eligible.length} leads match — widen filters or import more leads to reach {n}.</p>}
        <p className="text-xs text-fg-2">Opted-out and suppressed contacts are excluded. Drafts are generated in batches of 10. Every first message and follow-up needs human approval and a separate send action, regardless of global automation mode.</p>
      </div>
    </Modal>
  );
}

// ---------------- Campaign detail ----------------
const AGENT_STEPS = [
  { label: "Research", icon: Search },
  { label: "Personalize", icon: Target },
  { label: "Generate", icon: Sparkles },
  { label: "Review", icon: Eye },
  { label: "Approve", icon: UserCheck },
  { label: "Send", icon: Send },
  { label: "Track", icon: MailCheck },
  { label: "Follow-up review", icon: Workflow },
];

function AgentPipeline({ c }: { c: OutreachCampaign }) {
  const f = funnel(c);
  const counts = [f.total-f.queued-f.researching,f.drafted+f.approved+f.contacted,f.drafted+f.approved+f.contacted,f.drafted,f.approved+f.contacted,f.contacted,f.contacted,c.recipients.filter(r=>r.stepIndex>0&&r.state==="drafted"||r.stepIndex>1).length];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {AGENT_STEPS.map((s, i) => {
        const active = counts[i]! > 0;
        return (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={cn("flex w-28 shrink-0 flex-col gap-1 rounded-lg border p-2", active ? "border-accent/40 bg-accent-soft" : "border-border bg-surface-2")}>
              <div className="flex items-center justify-between">
                <s.icon className={cn("size-3.5", active ? "text-accent-text" : "text-fg-3")} />
                <span className="text-[10px] text-fg-3">{i + 1}</span>
              </div>
              <p className="text-[11px] font-medium leading-tight">{s.label}</p>
              <p className="text-xs font-semibold tabular-nums">{counts[i]}</p>
            </div>
            {i < AGENT_STEPS.length - 1 && <ChevronRight className="size-3 shrink-0 text-fg-3" />}
          </div>
        );
      })}
    </div>
  );
}

type RFilter = "drafted" | "approved" | "sent" | "replied" | "stopped" | "all";

export function CampaignDetail({ id, onBack, canWrite }: { id: string; onBack: () => void; canWrite: boolean }) {
  const deliveryStatus=useDeliveryStatus(id);
  const [busy,setBusy]=useState(false);
  const camp = useCRM((s) => s.outreach.find((c) => c.id === id));
  const leads = useCRM((s) => s.leads);
  const sequences = useCRM((s) => s.settings.sequences);
  const updateDraft = useCRM((s) => s.updateDraft);
  const approveDrafts = useCRM((s) => s.approveDrafts);
  const launch = useCRM((s) => s.launchOutreach);
  const setStatus = useCRM((s) => s.setOutreachStatus);
  const runFollowUps = useCRM((s) => s.runFollowUps);
  const generateDrafts = useCRM((s) => s.generateDrafts);
  const [filter, setFilter] = useState<RFilter>(() => (camp?.recipients.some((r) => r.state === "drafted") || camp?.recipients.some((r) => ["queued", "researching"].includes(r.state)) ? "drafted" : "all"));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);


  if (!camp) return <EmptyState title="Campaign not found" action={<Button onClick={onBack}>Back</Button>} />;
  const f = funnel(camp);
  const seq = sequences.find((s) => s.id === camp.sequenceId);
  const rows = camp.recipients.filter((r) => filter === "all" || r.state === filter);
  const drafted = camp.recipients.filter((r) => r.state === "drafted").map((r) => r.leadId);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft className="size-3" /> All campaigns</button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{camp.name}</h1><StatusBadge status={camp.status} /></div>
          <p className="text-[13px] text-fg-3">{camp.channel} · {f.total} leads · sequence “{seq?.name ?? "—"}” ({seq?.steps.length ?? 0} steps) · reply rate {pct(f.replyRate)}</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {f.queued > 0 && <Button variant="ai" icon={<Sparkles className="size-3.5" />} onClick={async () => { await generateDrafts(camp.id); applyVariantDrafts(camp.id); }}>Draft {f.queued} queued</Button>}
            {f.approved > 0 && <Button variant="primary" loading={busy} disabled={!deliveryStatus.integration.ready||!deliveryStatus.integration.channels.includes(camp.channel)} icon={<Rocket className="size-3.5" />} onClick={async () => {setBusy(true);try{const result=await launch(camp.id);toast("Delivery results",`${result.accepted} accepted by integration · ${result.blocked} blocked or unconfirmed`);await deliveryStatus.refresh();}catch(error){toast("Messages not confirmed",error instanceof Error?error.message:"Check delivery tracking","warning");}finally{setBusy(false);}}}>Send approved batch · up to 10</Button>}
            {camp.status === "Running" && <Button icon={<Pause className="size-3.5" />} onClick={() => setStatus(camp.id, "Paused")}>Pause</Button>}
            {camp.status === "Paused" && <Button icon={<Play className="size-3.5" />} onClick={() => setStatus(camp.id, "Running")}>Resume</Button>}
            {camp.status === "Running" && <Button icon={<Workflow className="size-3.5" />} onClick={() => { const n = runFollowUps(); toast(n ? `${n} due follow-ups prepared for review` : "No follow-ups due");setFilter("drafted"); }}>Prepare due follow-ups</Button>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
        <Badge tone="success">Human approval required · every touch</Badge>
        <span>{deliveryStatus.integration.ready?"Delivery adapter configured":"No delivery integration connected — drafts and approvals remain saved"}</span>
      </div>

      <Card className="p-3">
        <p className="mb-2 text-xs font-medium text-fg-2">Agent pipeline</p>
        <AgentPipeline c={camp} />
      </Card>

      <ABTestCard c={camp} canWrite={canWrite} />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Segmented value={filter} onChange={(v) => { setFilter(v); setSel(new Set()); }} options={[
              { value: "drafted", label: `Review · ${f.drafted}` }, { value: "approved", label: `Approved · ${f.approved}` }, { value: "sent", label: `Accepted · ${f.sent}` },
            { value: "replied", label: `Replied · ${f.replied}` }, { value: "stopped", label: `Stopped · ${f.stopped}` }, { value: "all", label: "All" },
          ]} />
          {canWrite && filter === "drafted" && drafted.length > 0 && (
            <div className="ml-auto flex gap-2">
              {sel.size > 0 && <Button size="xs" icon={<Check className="size-3" />} loading={busy} onClick={async () => {setBusy(true);try{await approveDrafts(camp.id,[...sel]);setSel(new Set());toast("Eligible drafts approved");}catch(e){toast("Approval failed",e instanceof Error?e.message:"Please retry","warning");}finally{setBusy(false);}}}>Approve {sel.size}</Button>}
              <Button size="xs" variant="primary" loading={busy} icon={<CheckCheck className="size-3" />} onClick={async () => {setBusy(true);try{await approveDrafts(camp.id,drafted);toast("Eligible drafts approved");}catch(e){toast("Approval failed",e instanceof Error?e.message:"Please retry","warning");}finally{setBusy(false);}}}>Approve all</Button>
            </div>
          )}
        </div>
        <div className="divide-y divide-border">
          {rows.length === 0 && <EmptyState title="Nothing here" description={filter === "drafted" ? "All drafts have been reviewed." : undefined} />}
          {rows.slice(0, 100).map((r) => {
            const l = leadMap.get(r.leadId);
            if (!l) return null;
            return <RecipientRow key={r.leadId} r={r} lead={l} campId={camp.id} canWrite={canWrite} selected={sel.has(r.leadId)} onSelect={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(r.leadId); else n.delete(r.leadId); return n; })} onEdit={(d) => updateDraft(camp.id, r.leadId, d)} onApprove={() => {void approveDrafts(camp.id,[r.leadId]).then(()=>toast("Eligible draft approved")).catch(e=>toast("Approval failed",e instanceof Error?e.message:"Please retry","warning"));}} />;
          })}
          {rows.length > 100 && <p className="px-3 py-2 text-xs text-fg-3">Showing first 100 of {rows.length}.</p>}
        </div>
      </Card>
      <DeliveryTracking campaignId={camp.id}/>
    </div>
  );
}

function RecipientRow({ r, lead, canWrite, selected, onSelect, onEdit, onApprove }: { r: OutreachRecipient; lead: Lead; campId: string; canWrite: boolean; selected: boolean; onSelect: (v: boolean) => void; onEdit: (d: string) => void; onApprove: () => void }) {
  const [expanded, setExpanded] = useState(r.state === "drafted");
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3">
        {canWrite && r.state === "drafted" && <Checkbox checked={selected} onChange={onSelect} />}
        <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded((e) => !e)}>
          <p className="truncate text-[13px] font-medium">{lead.name} <span className="font-normal text-fg-3">· {lead.company}</span></p>
          <p className="truncate text-xs text-fg-3">{r.service && <span className="text-accent-text">{r.service}</span>}{r.angle && <> · {r.angle}</>}</p>
        </button>
        {variantOf(r) && <Badge tone={variantOf(r) === "A" ? "accent" : "info"}>{variantOf(r)}</Badge>}
        <ScorePill score={effectiveScore(lead)} />
        <span className="hidden sm:block text-[11px] text-fg-3 w-24 text-right">{r.stopReason ?? (r.lastSentAt ? `step ${r.stepIndex} · ${relTime(r.lastSentAt)}` : "")}</span>
        <Badge tone={r.state === "replied" ? "success" : r.state === "stopped" || r.state === "bounced" ? "danger" : r.state === "approved" ? "accent" : r.state === "drafted" ? "warning" : "neutral"}>{r.state}</Badge>
      </div>
      {r.error&&<p role="alert" className="mt-2 text-xs text-danger">{r.error}</p>}
      {r.draftSource&&<p className="mt-2 text-xs text-fg-2">Draft source: {r.draftSource}</p>}
      {expanded && r.draft && (
        <div className="mt-2 ml-0 sm:ml-7 space-y-2">
          {["drafted","approved"].includes(r.state) && canWrite ? (
            <>
              <Textarea key={r.draft} aria-label={`Message draft for ${lead.company}`} defaultValue={r.draft} rows={7} onBlur={(e) => e.target.value !== r.draft && onEdit(e.target.value)} />
              <div className="flex items-center gap-2">
                <AIBadge>Personalized draft</AIBadge>
                <Link href={`/leads/${lead.id}`} className="text-xs text-fg-3 hover:text-fg">View research</Link>
                <Button size="xs" variant="primary" className="ml-auto" icon={<UserCheck className="size-3" />} onClick={onApprove}>Approve</Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{r.draft}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Sequence builder ----------------
export function SequenceBuilder({ canWrite }: { canWrite: boolean }) {
  const sequences = useCRM((s) => s.settings.sequences);
  const [id, setId] = useState(sequences[0]?.id ?? "");
  const current = sequences.find((s) => s.id === id) ?? sequences[0];
  if (!current) return null;
  // Keyed editor: switching or re-saving a sequence resets the local draft.
  return <SequenceEditor key={current.id + JSON.stringify(current).length} current={current} sequences={sequences} setId={setId} canWrite={canWrite} />;
}

function SequenceEditor({ current, sequences, setId, canWrite }: { current: Sequence; sequences: Sequence[]; setId: (id: string) => void; canWrite: boolean }) {
  const upsert = useCRM((s) => s.upsertSequence);
  const [draft, setDraft] = useState<Sequence>(current);

  const setStep = (i: number, patch: Partial<SequenceStep>) => setDraft({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);

  return (
    <Card>
      <CardHeader title="Follow-up sequence builder" subtitle="Day 0 uses the AI-personalized first message. Variables: {{first_name}} {{company}} {{service}} {{industry}} {{location}}"
        action={canWrite && (
          <div className="flex gap-2">
            <Select value={draft.id} onChange={(e) => setId(e.target.value)} className="w-44">{sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => { const n = { ...draft, id: uid("seq"), name: `${draft.name} (copy)` }; upsert(n); setId(n.id); toast("Sequence duplicated"); }}>Duplicate</Button>
          </div>
        )} />
      <div className="space-y-4 px-4 pb-4">
        <Field label="Sequence name"><Input value={draft.name} disabled={!canWrite} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <ol className="space-y-2">
          {draft.steps.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">{i + 1}</span>
                <span className="text-xs text-fg-3">Day</span>
                <Input type="number" min={0} value={s.dayOffset} disabled={!canWrite || i === 0} onChange={(e) => setStep(i, { dayOffset: Number(e.target.value) })} className="w-16" />
                <Select value={s.channel} disabled={!canWrite} onChange={(e) => setStep(i, { channel: e.target.value as Channel })} className="w-32">{CHANNELS.filter((c) => c !== "Phone").map((c) => <option key={c}>{c}</option>)}</Select>
                <Select value={s.condition} disabled={!canWrite || i === 0} onChange={(e) => setStep(i, { condition: e.target.value as SequenceStep["condition"] })} className="w-44">
                  <option value="always">Always</option><option value="no_reply">If no reply</option><option value="opened_no_reply">If opened, no reply</option>
                </Select>
                {canWrite && i > 0 && <button onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} className="ml-auto rounded-md p-1 text-fg-3 hover:bg-danger-soft hover:text-danger"><Trash2 className="size-3.5" /></button>}
              </div>
              {i === 0 ? <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-3"><Sparkles className="size-3 text-accent" /> AI-personalized first message from lead research</p> : (
                <Textarea value={s.template} disabled={!canWrite} rows={2} className="mt-2" onChange={(e) => setStep(i, { template: e.target.value })} />
              )}
            </li>
          ))}
        </ol>
        {canWrite && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => { const last = draft.steps[draft.steps.length - 1]; setDraft({ ...draft, steps: [...draft.steps, { id: uid("st"), dayOffset: (last?.dayOffset ?? 0) + 4, channel: "Email", condition: "no_reply", template: "Hi {{first_name}}, one last note on {{service}} for {{company}}…" }] }); }}>Add step</Button>}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-fg-2">Stop rules</p>
            {([["onReply", "Lead replies"], ["onMeetingBooked", "Meeting is booked"], ["onOptOut", "Lead opts out"], ["onNotInterested", "Marked not interested"], ["onManualPause", "Lead manually paused"]] as const).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between py-1.5 text-[13px]">
                <span>Stop when {label.toLowerCase()}</span>
                <Badge tone="success">Always on</Badge>
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold text-fg-2">Sending limits</p>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="w-24 text-fg-3">Window (UTC)</span>
              <Input type="number" min={0} max={23} value={draft.sendWindow.startHour} disabled={!canWrite} className="w-16" onChange={(e) => setDraft({ ...draft, sendWindow: { ...draft.sendWindow, startHour: Number(e.target.value) } })} />
              <span>to</span>
              <Input type="number" min={1} max={24} value={draft.sendWindow.endHour} disabled={!canWrite} className="w-16" onChange={(e) => setDraft({ ...draft, sendWindow: { ...draft.sendWindow, endHour: Number(e.target.value) } })} />
            </div>
            <div className="flex items-center justify-between text-[13px]"><span className="text-fg-3">Weekdays only</span><Toggle checked={draft.sendWindow.weekdaysOnly} onChange={(v) => canWrite && setDraft({ ...draft, sendWindow: { ...draft.sendWindow, weekdaysOnly: v } })} /></div>
            <div className="flex items-center gap-2 text-[13px]"><span className="w-24 text-fg-3">Daily limit</span><Input type="number" min={1} max={1000} value={draft.dailyLimit} disabled={!canWrite} className="w-24" onChange={(e) => setDraft({ ...draft, dailyLimit: Number(e.target.value) })} /><span className="text-xs text-fg-3">account-wide cap for this send</span></div>
          </div>
        </div>
        {canWrite && dirty && (
          <div className="flex gap-2">
            <Button variant="primary" disabled={!draft.name.trim()||draft.sendWindow.endHour<=draft.sendWindow.startHour||draft.dailyLimit<1||draft.dailyLimit>1000} onClick={() => { upsert({ ...draft,stopRules:{onReply:true,onMeetingBooked:true,onOptOut:true,onNotInterested:true,onManualPause:true}, steps: [...draft.steps].sort((a, b) => a.dayOffset - b.dayOffset) }); toast("Sequence saved"); }}>Save sequence</Button>
            <Button variant="ghost" onClick={() => setDraft(current)}>Discard</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function SuppressionCard({ canWrite = false }: { canWrite?: boolean }) {
  const sup = useCRM((s) => s.settings.suppressions);
  const leads = useCRM((s) => s.leads);
  const addSuppression = useCRM((s) => s.addSuppression);
  const removeSuppression = useCRM((s) => s.removeSuppression);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("Manual suppression");
  const [q, setQ] = useState("");
  const optedOut = leads.filter((l) => l.optedOut).length;
  const shown = sup.filter((x) => !q || x.value.toLowerCase().includes(q.toLowerCase()));
  const add = () => {
    const v = value.trim().toLowerCase();
    if (!v) return;
    if (sup.some((x) => x.value === v)) return toast("Already suppressed", v, "info");
    addSuppression(v, reason || "Manual suppression");
    toast("Added to suppression list", `${v} will never be contacted`);
    setValue("");
  };
  return (
    <Card>
      <CardHeader title="Opt-outs & suppression" subtitle={`${sup.length} emails / phones / domains never contacted · ${optedOut} leads opted out`} action={<Link href="/settings" className="text-xs text-accent-text hover:underline">Settings</Link>} />
      <div className="space-y-2 px-4 pb-2">
        {canWrite && (
          <div className="flex flex-wrap gap-1.5">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="email, phone or domain.com" className="min-w-0 flex-1" onKeyDown={(e) => e.key === "Enter" && add()} />
            <Select value={reason} onChange={(e) => setReason(e.target.value)} className="w-40"><option>Manual suppression</option><option>Opt-out request</option><option>Competitor domain</option><option>Existing client</option><option>Bounced</option></Select>
            <Button size="sm" icon={<Plus className="size-3.5" />} disabled={!value.trim()} onClick={add}>Add</Button>
          </div>
        )}
        {sup.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppression list…" />}
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y divide-border px-4 pb-2">
        {shown.slice(0, 50).map((s) => (
          <li key={s.value} className="flex items-center gap-2 py-2 text-[13px]">
            <ShieldOff className="size-3.5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1 truncate">{s.value}</span>
            <span className="shrink-0 text-[11px] text-fg-3">{s.reason}</span>
            {canWrite && <button onClick={() => { if (confirm(`Remove ${s.value} from the suppression list? They may be contacted again.`)) removeSuppression(s.value); }} className="rounded p-0.5 text-fg-3 hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${s.value}`}><X className="size-3" /></button>}
          </li>
        ))}
        {shown.length === 0 && <li className="py-3 text-center text-xs text-fg-3">Nothing suppressed.</li>}
      </ul>
    </Card>
  );
}

export function useOpenCampaignEvents(cb: (id: string) => void) {
  const router = useRouter();
  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent<string>).detail; cb(id); router.replace(`/outreach?c=${id}`); };
    window.addEventListener("outreach:open", h);
    return () => window.removeEventListener("outreach:open", h);
  }, [cb, router]);
}
