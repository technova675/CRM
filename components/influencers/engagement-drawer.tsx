"use client";

import { useState } from "react";
import { BadgeCheck, Check, ExternalLink, Mail, Plus, Send, Trash2, WandSparkles } from "lucide-react";
import { useCRM } from "@/lib/store";
import { INFLUENCER_STAGES, type InfluencerEngagement, type InfluencerStage } from "@/lib/types";
import { draftOutreach, engagementEconomics } from "@/lib/ai/influencer";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { compact, money } from "@/lib/utils";
import { Avatar, Badge, Button, Card, Checkbox, Drawer, Field, Input, Segmented, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { PHASE } from "./pipeline";

const toDate = (iso: string) => iso.slice(0, 10);

export function EngagementDrawer({ id, onClose, writable }: { id: string; onClose: () => void; writable: boolean }) {
  const e = useCRM((s) => s.engagements.find((x) => x.id === id));
  const inf = useCRM((s) => s.influencers.find((x) => x.id === e?.influencerId));
  const campaign = useCRM((s) => s.campaigns.find((x) => x.id === e?.campaignId));
  const client = useCRM((s) => s.clients.find((x) => x.id === e?.clientId));
  const knowledge = useCRM((s) => s.knowledge.find((x) => x.clientId === e?.clientId));
  const agency = useCRM((s) => s.settings.agencyName);
  const mode = useCRM((s) => s.settings.approvalModes["Influencer outreach"]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState("");
  if (!e || !inf) return null;

  const s = () => useCRM.getState();
  const set = (p: Partial<InfluencerEngagement>, audit?: string) => s().patch("engagements", e.id, { ...p, updatedAt: new Date().toISOString() }, audit ? { entity: "influencer", action: audit } : undefined);
  const eco = engagementEconomics(e);
  const results = e.results ?? { views: 0, engagements: 0, clicks: 0, sales: 0 };

  const genDraft = async () => {
    setBusy(true);
    const out = await runAgentJob({
      agent: "social",
      title: `Creator outreach draft · ${inf.name}`,
      clientId: e.clientId,
      local: async () => {
        const llm = await callAgent("social", "Draft a short, friendly creator outreach DM/email. Mention the brand, the deliverable idea and ask for rates; note ASCI disclosure.", { creator: { name: inf.name, category: inf.category, handle: inf.instagram }, campaign: campaign?.name, fee: e.agreedFee || undefined }, { clientId: e.clientId });
        return llm?.text?.trim() || draftOutreach(inf, { client, campaign, knowledge, fee: e.agreedFee || undefined, agency });
      },
    });
    setBusy(false);
    if (out) setDraft(out);
  };
  const send = () => {
    if (!draft.trim()) return;
    const st = s();
    if (mode === "Automatic") {
      set({ stage: e.stage === "Shortlisted" ? "Outreach" : e.stage, notes: `${e.notes}\n[${new Date().toLocaleDateString("en-IN")}] Outreach sent.`.trim() });
      st.log({ actor: "ai", agent: "social", entity: "influencer", entityId: e.id, action: "Sent creator outreach (automatic)", detail: `${inf.name}${inf.email ? ` · ${inf.email}` : ""}` });
      toast("Outreach sent", inf.email ? `Email to ${inf.email}` : "Logged — send via Instagram DM");
    } else if (mode === "Approval Required") {
      st.requestApproval({ kind: "Influencer outreach", title: `Send outreach to ${inf.name}`, detail: `${campaign?.name ?? ""}\n\n${draft}`, ref: { type: "influencer", id: e.id }, agent: "social", apply: { collection: "engagements", id: e.id, patch: { stage: "Outreach" } } });
      toast("Outreach sent for approval", "Approve in Automations → Approvals.");
    } else {
      st.addTask({ title: `Send outreach to ${inf.name}`, description: `${campaign?.name ?? ""} · ${inf.instagram ?? ""} ${inf.email ?? ""}\n\n${draft}`, assigneeId: "u_inf1", priority: "Medium", dueDate: new Date(Date.now() + 86_400_000).toISOString(), status: "Todo", related: { type: "influencer", id: e.id }, createdBy: "ai" });
      toast("Task created", "Manual mode — a human sends the message.");
    }
    setDraft("");
  };

  const toggleDeliverable = (i: number, done: boolean) => set({ deliverables: e.deliverables.map((d, j) => (j === i ? { ...d, done } : d)) });
  const setDue = (i: number, due: string) => set({ deliverables: e.deliverables.map((d, j) => (j === i ? { ...d, due: new Date(due).toISOString() } : d)) });
  const addDeliverable = () => {
    if (!newItem.trim()) return;
    set({ deliverables: [...e.deliverables, { label: newItem.trim(), due: new Date(Date.now() + 7 * 86_400_000).toISOString(), done: false }] });
    setNewItem("");
  };
  const setResult = (k: keyof typeof results, v: number) => set({ results: { ...results, [k]: v } });

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={inf.name}
      subtitle={<span>{client?.company} · {campaign?.name} · {PHASE[e.stage]}</span>}
      footer={
        <div className="flex w-full items-center gap-2">
          {writable && <Button variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { s().remove("engagements", e.id); toast("Removed from campaign"); onClose(); }}>Remove</Button>}
          <span className="flex-1" />
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      <fieldset disabled={!writable} className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={inf.name} size={40} />
          <div className="flex-1 min-w-0 text-xs text-fg-3">
            <p className="text-[13px] font-medium text-fg flex items-center gap-1">{inf.instagram}{inf.verification === "Verified" && <BadgeCheck className="size-3.5 text-info" />}</p>
            <p>{inf.category} · {inf.location} · {compact(inf.followers)} followers · {inf.engagement}% ER · rate {money(inf.pricePerPost)}</p>
            {inf.email && <p className="flex items-center gap-1"><Mail className="size-3" /> {inf.email}</p>}
          </div>
          {e.matchScore !== undefined && <div className="text-right"><p className="text-lg font-semibold text-accent-text tabular-nums">{e.matchScore}</p><p className="text-[10px] text-fg-3">AI match</p></div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage"><Select value={e.stage} onChange={(ev) => set({ stage: ev.target.value as InfluencerStage, ...(ev.target.value === "Paid" ? { paymentStatus: "Paid" as const } : {}) }, "Changed creator stage")}>{INFLUENCER_STAGES.map((st) => <option key={st}>{st}</option>)}</Select></Field>
          <Field label="Agreed fee (₹)" hint={e.agreedFee && e.agreedFee !== inf.pricePerPost ? `${e.agreedFee < inf.pricePerPost ? "Below" : "Above"} rate card by ${money(Math.abs(inf.pricePerPost - e.agreedFee))}` : undefined}><Input type="number" value={e.agreedFee || ""} onChange={(ev) => set({ agreedFee: Number(ev.target.value) })} placeholder={String(inf.pricePerPost)} /></Field>
        </div>

        {/* Outreach */}
        {["Shortlisted", "Outreach", "Negotiation"].includes(e.stage) && (
          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">Outreach <Badge className="ml-1">{mode}</Badge></p>
              <Button size="xs" variant="ai" loading={busy} icon={<WandSparkles className="size-3" />} onClick={genDraft}>{draft ? "Redraft" : "Draft outreach"}</Button>
            </div>
            {draft ? (
              <>
                <Textarea rows={9} value={draft} onChange={(ev) => setDraft(ev.target.value)} />
                <div className="flex justify-end"><Button size="xs" variant="primary" icon={<Send className="size-3" />} onClick={send}>{mode === "Automatic" ? "Send" : mode === "Approval Required" ? "Send for approval" : "Create send task"}</Button></div>
              </>
            ) : <p className="text-xs text-fg-3">AI drafts a personalised message from the creator profile, campaign and brand knowledge. Nothing is sent without following the “Influencer outreach” approval mode.</p>}
          </Card>
        )}

        {/* Deliverables */}
        <div>
          <p className="text-xs font-medium text-fg-2 mb-1.5">Deliverables</p>
          <div className="space-y-1.5">
            {e.deliverables.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <Checkbox checked={d.done} onChange={(v) => toggleDeliverable(i, v)} />
                <span className={d.done ? "flex-1 text-xs line-through text-fg-3" : "flex-1 text-xs"}>{d.label}</span>
                <Input type="date" value={toDate(d.due)} onChange={(ev) => ev.target.value && setDue(i, ev.target.value)} className="w-36 h-7 text-xs" />
                <button type="button" aria-label="Remove deliverable" className="text-fg-3 hover:text-danger" onClick={() => set({ deliverables: e.deliverables.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
              </div>
            ))}
            {writable && (
              <div className="flex gap-2">
                <Input value={newItem} onChange={(ev) => setNewItem(ev.target.value)} placeholder="e.g. 1 Reel + 3 Stories" onKeyDown={(ev) => ev.key === "Enter" && addDeliverable()} />
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={addDeliverable}>Add</Button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div>
          <p className="text-xs font-medium text-fg-2 mb-1.5">Content</p>
          <div className="flex gap-2">
            <Input value={e.contentUrl ?? ""} onChange={(ev) => set({ contentUrl: ev.target.value || undefined, ...(ev.target.value && ["Shortlisted", "Outreach", "Negotiation", "Contracted"].includes(e.stage) ? { stage: "Content Submitted" as const } : {}) })} placeholder="Draft / post URL" />
            {e.contentUrl && <Button size="sm" href={e.contentUrl} external icon={<ExternalLink className="size-3.5" />}>Open</Button>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {e.stage === "Content Submitted" ? (
              <Button size="xs" variant="primary" icon={<Check className="size-3" />} disabled={!e.contentUrl} onClick={() => { set({ stage: "Approved" }, "Approved creator content"); toast("Content approved"); }}>Approve content</Button>
            ) : ["Approved", "Live", "Paid"].includes(e.stage) ? (
              <Badge tone="success" dot>Content approved</Badge>
            ) : <span className="text-[11px] text-fg-3">Add the draft URL when the creator submits content.</span>}
            {e.stage === "Approved" && <Button size="xs" onClick={() => set({ stage: "Live" }, "Marked creator content live")}>Mark live</Button>}
          </div>
        </div>

        {/* Payment */}
        <div>
          <p className="text-xs font-medium text-fg-2 mb-1.5">Payment</p>
          <Segmented value={e.paymentStatus} onChange={(v) => set({ paymentStatus: v, ...(v === "Paid" && e.stage === "Live" ? { stage: "Paid" as const } : {}) }, "Changed creator payment status")} options={[{ value: "Unpaid", label: "Unpaid" }, { value: "Advance Paid", label: "Advance paid" }, { value: "Paid", label: "Paid" }]} />
        </div>

        {/* Results */}
        <div>
          <p className="text-xs font-medium text-fg-2 mb-1.5">Results <span className="font-normal text-fg-3">· from creator insights / UTM tracking</span></p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["views", "engagements", "clicks", "sales"] as const).map((k) => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}><Input type="number" value={results[k] || ""} onChange={(ev) => setResult(k, Number(ev.target.value))} /></Field>
            ))}
          </div>
          {eco && e.agreedFee > 0 && (
            <div className="mt-2 grid grid-cols-5 gap-2 rounded-lg bg-surface-2 p-2 text-xs">
              <div><p className="text-fg-3">CPE</p><p className="font-semibold tabular-nums">{eco.cpe ? `₹${eco.cpe.toFixed(2)}` : "—"}</p></div>
              <div><p className="text-fg-3">CPV</p><p className="font-semibold tabular-nums">{eco.cpv ? `₹${eco.cpv.toFixed(2)}` : "—"}</p></div>
              <div><p className="text-fg-3">CPC</p><p className="font-semibold tabular-nums">{eco.cpc ? `₹${eco.cpc.toFixed(0)}` : "—"}</p></div>
              <div><p className="text-fg-3">CPA</p><p className="font-semibold tabular-nums">{eco.cpa ? money(eco.cpa) : "—"}</p></div>
              <div><p className="text-fg-3">ER</p><p className="font-semibold tabular-nums">{eco.er ? `${eco.er.toFixed(1)}%` : "—"}</p></div>
            </div>
          )}
        </div>

        <Field label="Internal notes"><Textarea value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} /></Field>
      </fieldset>
    </Drawer>
  );
}
