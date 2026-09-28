"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowLeft, Ban, CalendarDays, Compass, Copy, FileText, Globe, Camera as Instagram, Briefcase as Linkedin, Mail, MapPin, MessageSquare, Pencil, Phone, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { CHANNELS, LEAD_SOURCES, LEAD_STATUSES, type Channel, type CompanySize, type Lead, type LeadSource } from "@/lib/types";
import { effectiveScore, scoreTier } from "@/lib/ai/scoring";
import { personalizeFirstMessage } from "@/lib/ai/outreach";
import { cn, fmtDate, fmtDateTime, money, relTime, uid } from "@/lib/utils";
import { AIBadge, Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, InsightList, MemberAvatar, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { CustomFieldInput, nextBestAction } from "@/components/sales/LeadTools";
import { toast } from "@/components/shell/toast";
import { INDUSTRIES, ServicePicker, SIZES } from "@/components/sales/LeadForms";
import { ResearchSections } from "@/components/sales/ResearchView";

function StatusStepper({ lead, disabled }: { lead: Lead; disabled?: boolean }) {
  const setLeadStatus = useCRM((s) => s.setLeadStatus);
  const idx = LEAD_STATUSES.indexOf(lead.status);
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {LEAD_STATUSES.map((s, i) => {
        const done = lead.status !== "Lost" && i <= idx && s !== "Lost";
        const current = s === lead.status;
        return (
          <button
            key={s}
            disabled={disabled}
            onClick={() => { setLeadStatus(lead.id, s); toast(`Status → ${s}`); }}
            className={cn(
              "relative flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium transition disabled:cursor-default",
              current && s === "Lost" ? "bg-danger text-white" : current ? "bg-fg text-bg" : done ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-3 hover:text-fg",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function ScoreCard({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const overrideScore = useCRM((s) => s.overrideScore);
  const rescore = useCRM((s) => s.rescoreLeads);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(effectiveScore(lead)));
  const [reason, setReason] = useState("");
  const score = effectiveScore(lead);
  const tier = scoreTier(score);
  return (
    <Card>
      <CardHeader title="Lead score" subtitle={lead.score ? `AI scored ${relTime(lead.score.scoredAt)}` : "Not scored"} action={canWrite && <button onClick={() => { rescore([lead.id]); toast("Lead re-scored"); }} className="rounded-md p-1 text-fg-3 hover:bg-surface-2" title="Re-score"><RefreshCw className="size-3.5" /></button>} />
      <div className="px-4 pb-4">
        <div className="flex items-end gap-3">
          <span className="text-4xl font-semibold tabular-nums tracking-tight">{score}</span>
          <div className="pb-1.5">
            <Badge tone={tier === "Hot" ? "success" : tier === "Warm" ? "accent" : tier === "Cool" ? "warning" : "neutral"}>{tier}</Badge>
            {lead.score?.override !== undefined && <p className="mt-1 text-[11px] text-fg-3">Overridden (AI: {lead.score.value})</p>}
          </div>
        </div>
        {lead.score?.overrideReason && <p className="mt-2 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-fg-2">Override reason: {lead.score.overrideReason}</p>}
        <ul className="mt-4 space-y-2.5">
          {lead.score?.factors.map((f) => (
            <li key={f.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-fg-2">{f.label}</span>
                <span className="tabular-nums text-fg-3">{f.points}/{f.max}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-3"><div className="h-1 rounded-full bg-accent" style={{ width: `${(f.points / Math.max(1, f.max)) * 100}%` }} /></div>
              <p className="mt-0.5 text-[11px] text-fg-3">{f.reason}</p>
            </li>
          ))}
        </ul>
        {canWrite && (editing ? (
          <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
            <Field label="Manual score (0–100)"><Input type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} /></Field>
            <Field label="Reason"><Input value={reason} placeholder="e.g. Referred by existing client" onChange={(e) => setReason(e.target.value)} /></Field>
            <div className="flex gap-2">
              <Button size="xs" variant="primary" onClick={() => { const n = Math.max(0, Math.min(100, Number(val) || 0)); overrideScore(lead.id, n, reason || "Manual override"); setEditing(false); toast("Score overridden"); }}>Save override</Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <Button size="xs" icon={<Pencil className="size-3" />} onClick={() => { setVal(String(score)); setEditing(true); }}>Override score</Button>
            {lead.score?.override !== undefined && <Button size="xs" variant="ghost" onClick={() => overrideScore(lead.id, undefined)}>Clear override</Button>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function NextActionCard({ lead }: { lead: Lead }) {
  const threshold = useCRM((s) => s.settings.qualifyThreshold);
  const meetings = useCRM((s) => s.meetings);
  const deals = useCRM((s) => s.deals);
  const proposals = useCRM((s) => s.proposals);
  const [now] = useState(() => Date.now());
  const items = useMemo(() => {
    const deal = deals.find((d) => d.leadId === lead.id);
    return nextBestAction(lead, { threshold, hasMeeting: meetings.some((m) => m.leadId === lead.id), hasProposal: !!deal && proposals.some((p) => p.dealId === deal.id), now });
  }, [lead, threshold, meetings, deals, proposals, now]);
  return (
    <Card className="border-accent/30">
      <CardHeader title={<span className="flex items-center gap-2"><Compass className="size-3.5 text-accent-text" /> Recommended next action</span>} subtitle="Derived from score, status and last contact" />
      <div className="px-4 pb-4"><InsightList items={items} compact /></div>
    </Card>
  );
}

function CustomFieldsCard({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const defs = useCRM((s) => s.settings.leadCustomFields);
  const updateLead = useCRM((s) => s.updateLead);
  if (!defs.length) return null;
  const set = (key: string, v: string) => {
    const next = { ...(lead.customFields ?? {}) };
    if (v === "") delete next[key];
    else next[key] = v;
    updateLead(lead.id, { customFields: next });
  };
  return (
    <Card>
      <CardHeader title="Custom fields" subtitle={<Link href="/settings" className="hover:underline">Defined in Settings</Link>} />
      <div className="space-y-2.5 px-4 pb-4">
        {defs.map((d) => (
          <Field key={d.key} label={d.label}>
            <CustomFieldInput def={d} value={lead.customFields?.[d.key] ?? ""} disabled={!canWrite} onChange={(v) => set(d.key, v)} />
          </Field>
        ))}
      </div>
    </Card>
  );
}

function DraftModal({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const conversations = useCRM((s) => s.conversations);
  const sendMessage = useCRM((s) => s.sendMessage);
  const me = useCRM((s) => s.currentUserId);
  const [channel, setChannel] = useState<Channel>("Email");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    let body = personalizeFirstMessage(lead, channel).body;
    if (aiEnabled) {
      try {
        const res = await fetch("/api/ai/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead, channel, kind: lead.lastContactedAt ? "follow_up" : "first" }) });
        const d = await res.json();
        if (d.text) body = d.text;
      } catch {}
    } else await new Promise((r) => setTimeout(r, 300));
    setText(body);
    setBusy(false);
  };

  const send = () => {
    let conv = conversations.find((c) => c.leadId === lead.id && c.channel === channel);
    if (!conv) {
      conv = { id: uid("cv"), leadId: lead.id, channel, ownerId: me, status: "open", handledBy: "human", unread: 0, lastMessageAt: new Date().toISOString(), subject: channel === "Email" ? `Quick idea for ${lead.company}` : undefined };
      const c = conv;
      useCRM.setState((s) => ({ conversations: [c, ...s.conversations] }));
    }
    sendMessage(conv.id, text, "human");
    if (["New", "Researching", "Qualified"].includes(lead.status)) useCRM.getState().setLeadStatus(lead.id, "Contacted");
    toast("Message sent", `${channel} to ${lead.name}`);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Draft message for ${lead.name}`} subtitle="Review before sending — AI drafts are never sent without a human here." size="lg"
      footer={<>
        <Button variant="ghost" icon={<Copy className="size-3.5" />} disabled={!text} onClick={() => { void navigator.clipboard.writeText(text); toast("Copied"); }}>Copy</Button>
        <Button variant="primary" icon={<Send className="size-3.5" />} disabled={!text || lead.optedOut} onClick={send}>Send via {channel}</Button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="w-36">{CHANNELS.filter((c) => c !== "Phone").map((c) => <option key={c}>{c}</option>)}</Select>
          <Button variant="ai" icon={<Sparkles className="size-3.5" />} loading={busy} onClick={generate}>{text ? "Regenerate" : "Generate with AI"}</Button>
          {lead.research?.outreachAngle && <span className="text-xs text-fg-3">Angle: {lead.research.outreachAngle}</span>}
        </div>
        {lead.optedOut && <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">This lead opted out — sending is blocked.</p>}
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Click “Generate with AI” or write your own message…" />
      </div>
    </Modal>
  );
}

function EditDetails({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const updateLead = useCRM((s) => s.updateLead);
  const rescore = useCRM((s) => s.rescoreLeads);
  const [d, setD] = useState(lead);
  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Name"><Input value={d.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Company"><Input value={d.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Job title"><Input value={d.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></Field>
        <Field label="Email"><Input value={d.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Website"><Input value={d.website ?? ""} onChange={(e) => set("website", e.target.value || undefined)} /></Field>
        <Field label="LinkedIn"><Input value={d.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value || undefined)} /></Field>
        <Field label="Instagram"><Input value={d.instagram ?? ""} onChange={(e) => set("instagram", e.target.value || undefined)} /></Field>
        <Field label="Location"><Input value={d.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Industry"><Select value={d.industry} onChange={(e) => set("industry", e.target.value)}>{[...new Set([d.industry, ...INDUSTRIES])].map((i) => <option key={i}>{i}</option>)}</Select></Field>
        <Field label="Company size"><Select value={d.companySize} onChange={(e) => set("companySize", e.target.value as CompanySize)}>{SIZES.map((i) => <option key={i}>{i}</option>)}</Select></Field>
        <Field label="Source"><Select value={d.source} onChange={(e) => set("source", e.target.value as LeadSource)}>{LEAD_SOURCES.map((i) => <option key={i}>{i}</option>)}</Select></Field>
        <Field label="Deal value (₹)"><Input type="number" value={d.dealValue ?? ""} onChange={(e) => set("dealValue", e.target.value ? Number(e.target.value) : undefined)} /></Field>
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="primary" onClick={() => { const { id: _id, ...patch } = d; void _id; updateLead(lead.id, patch); rescore([lead.id]); toast("Lead updated", "Score recalculated"); onDone(); }}>Save</Button>
        <Button size="xs" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useMe();
  const canWrite = can(me.role, "leads", "write");
  const lead = useCRM((s) => s.leads.find((l) => l.id === id));
  const team = useCRM((s) => s.team);
  const conversations = useCRM((s) => s.conversations);
  const messages = useCRM((s) => s.messages);
  const deals = useCRM((s) => s.deals);
  const meetings = useCRM((s) => s.meetings);
  const tasks = useCRM((s) => s.tasks);
  const activities = useCRM((s) => s.activities);
  const updateLead = useCRM((s) => s.updateLead);
  const researchLead = useCRM((s) => s.researchLead);
  const optOutLead = useCRM((s) => s.optOutLead);
  const [editing, setEditing] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const convs = useMemo(() => conversations.filter((c) => c.leadId === id), [conversations, id]);
  const convIds = useMemo(() => new Set(convs.map((c) => c.id)), [convs]);
  const history = useMemo(() => messages.filter((m) => convIds.has(m.conversationId)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [messages, convIds]);
  const deal = deals.find((d) => d.leadId === id);
  const myMeetings = useMemo(() => meetings.filter((m) => m.leadId === id), [meetings, id]);
  const myTasks = useMemo(() => tasks.filter((t) => t.related?.type === "lead" && t.related.id === id), [tasks, id]);
  const timeline = useMemo(() => activities.filter((a) => a.entityId === id || (deal && a.entityId === deal.id)).slice(0, 30), [activities, id, deal]);

  if (!lead) return <EmptyState title="Lead not found" description="It may have been deleted." action={<Button href="/leads">Back to leads</Button>} />;
  const running = lead.research?.status === "running";

  return (
    <div className="space-y-4">
      <Link href="/leads" className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft className="size-3" /> Leads</Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Avatar name={lead.name} size={48} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
              <StatusBadge status={lead.status} />
              {lead.optedOut && <Badge tone="danger">Opted out</Badge>}
              {lead.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            </div>
            <p className="text-[13px] text-fg-2">{lead.jobTitle} at <span className="font-medium text-fg">{lead.company}</span></p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-fg"><Mail className="size-3" />{lead.email}</a>}
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-fg"><Phone className="size-3" />{lead.phone}</a>}
              {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg"><Globe className="size-3" />{lead.website.replace(/^https?:\/\//, "")}</a>}
              {lead.linkedin && <a href={`https://${lead.linkedin.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg"><Linkedin className="size-3" />LinkedIn</a>}
              {lead.instagram && <a href={`https://instagram.com/${lead.instagram.replace("@", "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg"><Instagram className="size-3" />{lead.instagram}</a>}
              <span className="flex items-center gap-1"><MapPin className="size-3" />{lead.location}</span>
            </div>
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ai" icon={<Sparkles className="size-3.5" />} loading={running} onClick={() => { void researchLead(lead.id); toast("AI research started", lead.company, "ai"); }}>{lead.research?.status === "done" ? "Re-run research" : "Run AI research"}</Button>
            <Button icon={<MessageSquare className="size-3.5" />} onClick={() => setDraftOpen(true)}>Draft message</Button>
            <Button href="/meetings" icon={<CalendarDays className="size-3.5" />}>Meeting</Button>
            {["Meeting", "Proposal", "Negotiation", "Replied", "Qualified"].includes(lead.status) && <Button href={`/proposals?new=1&lead=${lead.id}`} icon={<FileText className="size-3.5" />}>Proposal</Button>}
            {!lead.optedOut && <Button variant="ghost" className="text-danger" icon={<Ban className="size-3.5" />} onClick={() => { if (confirm("Opt out this lead? All follow-ups stop and the email is suppressed.")) { optOutLead(lead.id, "Manual opt-out"); toast("Lead opted out & suppressed", undefined, "warning"); } }}>Opt out</Button>}
          </div>
        )}
      </div>

      <Card className="p-3"><StatusStepper lead={lead} disabled={!canWrite} /></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2 min-w-0">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-accent-soft to-transparent px-4 py-3">
              <div className="flex items-center gap-2"><AIBadge>AI Lead Summary</AIBadge>{lead.research?.generatedAt && <span className="text-[11px] text-fg-3">{relTime(lead.research.generatedAt)}</span>}</div>
            </div>
            <div className="px-4 py-4">
              {running ? (
                <div className="space-y-2"><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-5/6 rounded" /><div className="skeleton h-3 w-2/3 rounded" /><p className="pt-1 text-xs text-fg-3">Researching public information and scoring…</p></div>
              ) : lead.research?.status === "done" ? (
                <div className="space-y-3">
                  <p className="text-[13px] leading-relaxed">{lead.research.summary}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-fg-3">Recommended:</span>
                    {lead.research.recommendedServices.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
                  </div>
                  {lead.research.outreachAngle && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs"><span className="font-semibold">Outreach angle: </span>{lead.research.outreachAngle}</p>}
                </div>
              ) : (
                <EmptyState icon={<Sparkles className="size-5" />} title="Not researched yet" description="Run AI research to generate a company overview, marketing analysis and a personalized outreach angle." />
              )}
            </div>
          </Card>

          {lead.research?.status === "done" && (
            <Card>
              <CardHeader title="Research findings" subtitle="Verified facts are separated from assumptions and recommendations." />
              <div className="px-4 pb-4"><ResearchSections research={lead.research} /></div>
            </Card>
          )}

          <Card>
            <CardHeader title="Communication history" subtitle={`${history.length} messages across ${convs.length} conversation(s)`} action={convs[0] && <Link href={`/inbox?c=${convs[0].id}`} className="text-xs text-accent-text hover:underline">Open in inbox</Link>} />
            <div className="px-4 pb-4">
              {history.length === 0 ? <p className="py-6 text-center text-xs text-fg-3">No messages yet.</p> : (
                <ul className="space-y-2">
                  {history.slice(0, 12).map((m) => (
                    <li key={m.id} className={cn("rounded-lg border border-border p-3", m.direction === "inbound" && "bg-surface-2")}>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
                        <Badge tone={m.direction === "inbound" ? "info" : m.author === "ai" ? "accent" : "neutral"}>{m.direction === "inbound" ? lead.name.split(" ")[0] : m.author === "ai" ? "AI agent" : "Team"}</Badge>
                        <span>{m.channel}</span><span>·</span><span>{fmtDateTime(m.sentAt)}</span>
                        {m.sentiment && <Badge tone={m.sentiment === "positive" ? "success" : m.sentiment === "negative" ? "danger" : "neutral"}>{m.sentiment}</Badge>}
                        <span className="ml-auto">{m.status}</span>
                      </div>
                      <p className="whitespace-pre-line text-[13px] text-fg-2 line-clamp-4">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <div className="px-4 pb-4">
              {timeline.length === 0 ? <p className="py-4 text-center text-xs text-fg-3">No activity yet.</p> : (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {timeline.map((a) => (
                    <li key={a.id} className="relative">
                      <span className={cn("absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-surface", a.actor === "ai" ? "bg-accent" : a.actor === "system" ? "bg-fg-3" : "bg-info")} />
                      <p className="text-[13px]"><span className="font-medium">{a.action}</span>{a.detail && <span className="text-fg-3"> — {a.detail}</span>}</p>
                      <p className="text-[11px] text-fg-3">{a.actor === "ai" ? "AI" : a.actor === "system" ? "System" : team.find((t) => t.id === a.actorId)?.name ?? "Team"} · {relTime(a.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <NextActionCard lead={lead} />
          <ScoreCard lead={lead} canWrite={canWrite} />

          <Card>
            <CardHeader title="Details" action={canWrite && !editing && <button onClick={() => setEditing(true)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2"><Pencil className="size-3.5" /></button>} />
            {editing ? <EditDetails lead={lead} onDone={() => setEditing(false)} /> : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 pb-4 text-[13px]">
                {[["Industry", lead.industry], ["Company size", lead.companySize], ["Source", lead.source], ["Added", fmtDate(lead.createdAt)], ["Last contacted", lead.lastContactedAt ? relTime(lead.lastContactedAt) : "—"], ["Next follow-up", lead.nextFollowUpAt ? fmtDate(lead.nextFollowUpAt) : "—"], ["Deal value", lead.dealValue ? money(lead.dealValue) : deal ? `${money(deal.value)} (deal)` : "—"], ["Tags", lead.tags.length ? lead.tags.map((t) => `#${t}`).join(" ") : "—"]].map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] text-fg-3">{k}</dt><dd className="truncate">{v}</dd></div>
                ))}
                <div className="col-span-2">
                  <dt className="mb-1 text-[11px] text-fg-3">Assigned salesperson</dt>
                  {canWrite ? (
                    <Select value={lead.ownerId} onChange={(e) => updateLead(lead.id, { ownerId: e.target.value })}>{team.filter((t) => ["admin", "sales"].includes(t.role)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
                  ) : <MemberAvatar id={lead.ownerId} showName />}
                </div>
              </dl>
            )}
          </Card>

          <CustomFieldsCard lead={lead} canWrite={canWrite} />

          <Card>
            <CardHeader title="Potential services" />
            <div className="px-4 pb-4">{canWrite ? <ServicePicker value={lead.services} onChange={(v) => updateLead(lead.id, { services: v })} /> : <div className="flex flex-wrap gap-1">{lead.services.map((s) => <Badge key={s}>{s}</Badge>)}</div>}</div>
          </Card>

          <Card>
            <CardHeader title="Notes & tags" />
            <div className="space-y-2 px-4 pb-4">
              <Textarea defaultValue={lead.notes} disabled={!canWrite} placeholder="Add notes…" onBlur={(e) => e.target.value !== lead.notes && updateLead(lead.id, { notes: e.target.value })} />
              <div className="flex flex-wrap items-center gap-1">
                {lead.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]">{t}{canWrite && <button onClick={() => updateLead(lead.id, { tags: lead.tags.filter((x) => x !== t) })}><X className="size-3" /></button>}</span>
                ))}
                {canWrite && <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { updateLead(lead.id, { tags: [...new Set([...lead.tags, tagInput.trim()])] }); setTagInput(""); } }} placeholder="+ tag" className="w-20 bg-transparent text-xs outline-none placeholder:text-fg-3" />}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Related" />
            <div className="space-y-3 px-4 pb-4 text-[13px]">
              <div>
                <p className="mb-1 text-[11px] text-fg-3">Deal</p>
                {deal ? (
                  <Link href={`/pipeline?deal=${deal.id}`} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-2 hover:bg-surface-2">
                    <span className="min-w-0"><span className="block truncate font-medium">{deal.title}</span><span className="text-xs text-fg-3">{money(deal.value)} · {deal.probability}%</span></span>
                    <StatusBadge status={deal.stage} />
                  </Link>
                ) : <p className="text-xs text-fg-3">No deal yet — qualifies automatically when status reaches Qualified.</p>}
              </div>
              <div>
                <p className="mb-1 text-[11px] text-fg-3">Meetings ({myMeetings.length})</p>
                {myMeetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-1"><span className="truncate">{m.title}</span><span className="shrink-0 text-xs text-fg-3">{fmtDate(m.startsAt)}</span></div>
                ))}
              </div>
              <div>
                <p className="mb-1 text-[11px] text-fg-3">Tasks ({myTasks.length})</p>
                {myTasks.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1"><span className={cn("truncate", t.status === "Done" && "line-through text-fg-3")}>{t.title}</span><StatusBadge status={t.status} /></div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <DraftModal lead={lead} open={draftOpen} onClose={() => setDraftOpen(false)} />
    </div>
  );
}
