"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, FlaskConical, Hand, Inbox, Mail, MessageCircle, Send, Sparkles, User } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { CHANNELS, type Channel, type Conversation } from "@/lib/types";
import { effectiveScore } from "@/lib/ai/scoring";
import { renderStep } from "@/lib/ai/outreach";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { AIBadge, Avatar, Badge, Button, EmptyState, MemberAvatar, ScorePill, SearchInput, Select, StatusBadge, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const SAMPLE_REPLIES = [
  "Yes, interested — can we set up a call next week?",
  "What would pricing look like for this?",
  "Please remove me from your list.",
  "Not interested, thanks.",
];

function ChannelIcon({ c, className }: { c: Channel; className?: string }) {
  return c === "Email" ? <Mail className={className} /> : <MessageCircle className={className} />;
}

function InboxInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const isClient = me.role === "client";
  // Client portal: only their own conversations; replies go in as the client; no internal controls.
  const canWrite = can(me.role, "inbox", "write") && !isClient;
  const conversations = useCRM((s) => s.conversations);
  const messages = useCRM((s) => s.messages);
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const team = useCRM((s) => s.team);
  const outreach = useCRM((s) => s.outreach);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const sendMessage = useCRM((s) => s.sendMessage);
  const receiveReply = useCRM((s) => s.receiveReply);
  const takeOver = useCRM((s) => s.takeOverConversation);
  const handBack = useCRM((s) => s.handBackToAI);
  const markRead = useCRM((s) => s.markConversationRead);
  const updateConversation = useCRM((s) => s.updateConversation);

  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("All");
  const [owner, setOwner] = useState("All");
  const [status, setStatus] = useState("All");
  const [campaign, setCampaign] = useState("All");
  const [handled, setHandled] = useState("All");
  // Composer text is scoped to the open conversation, so switching threads clears it.
  const [composer, setComposer] = useState({ id: "", value: "" });
  const [suggesting, setSuggesting] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeId = params.get("c");
  const text = composer.id === activeId ? composer.value : "";
  const setText = (value: string) => setComposer({ id: activeId ?? "", value });

  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const lastMsg = useMemo(() => {
    const m = new Map<string, (typeof messages)[number]>();
    for (const x of messages) { const p = m.get(x.conversationId); if (!p || p.sentAt < x.sentAt) m.set(x.conversationId, x); }
    return m;
  }, [messages]);
  const title = (c: Conversation) => (isClient ? c.subject || "Adbibe team" : (c.leadId ? leadMap.get(c.leadId)?.name : clientMap.get(c.clientId ?? "")?.company) ?? "Unknown");
  const subtitle = (c: Conversation) => (isClient ? `${c.channel}` : (c.leadId ? leadMap.get(c.leadId)?.company : "Client") ?? "");

  const visibleConvs = useMemo(() => (isClient ? conversations.filter((c) => c.clientId === me.clientId) : conversations), [conversations, isClient, me.clientId]);
  const list = useMemo(() => {
    const t = q.toLowerCase();
    return visibleConvs
      .filter((c) =>
        (channel === "All" || c.channel === channel) && (owner === "All" || c.ownerId === owner) && (status === "All" || c.status === status) &&
        (campaign === "All" || (campaign === "none" ? !c.campaignId : c.campaignId === campaign)) && (handled === "All" || c.handledBy === handled) &&
        (!t || `${title(c)} ${subtitle(c)} ${c.subject ?? ""} ${lastMsg.get(c.id)?.body ?? ""}`.toLowerCase().includes(t)))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleConvs, q, channel, owner, status, campaign, handled, lastMsg, leadMap, clientMap]);

  const active = visibleConvs.find((c) => c.id === activeId);
  const thread = useMemo(() => (active ? messages.filter((m) => m.conversationId === active.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt)) : []), [messages, active]);
  const lead = active?.leadId ? leadMap.get(active.leadId) : undefined;
  const client = active?.clientId ? clientMap.get(active.clientId) : undefined;
  const camp = outreach.find((o) => o.id === active?.campaignId);

  useEffect(() => { if (active && active.unread > 0) markRead(active.id); }, [active, markRead]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [activeId, thread.length]);

  const select = (id: string) => router.replace(`/inbox?c=${id}`);
  const needsHuman = visibleConvs.filter((c) => c.status === "needs_human").length;
  const [clientText, setClientText] = useState({ id: "", value: "" });
  const clientDraft = clientText.id === activeId ? clientText.value : "";
  const sendAsClient = () => {
    if (!active || !clientDraft.trim()) return;
    receiveReply(active.id, clientDraft.trim());
    setClientText({ id: activeId ?? "", value: "" });
    toast("Message sent to your Adbibe team");
  };

  const suggest = async () => {
    if (!active) return;
    setSuggesting(true);
    const lastIn = [...thread].reverse().find((m) => m.direction === "inbound");
    let body = "";
    if (lead) {
      body = lastIn
        ? /pric|cost|budget/i.test(lastIn.body)
          ? renderStep("Hi {{first_name}}, great question — it depends on scope, but most {{industry}} brands start with a {{service}} retainer. Could we do a 15-min call so I can give you an accurate number for {{company}}?", lead, lead.research?.recommendedServices[0] ?? "Meta Ads", "")
          : /case|example|details/i.test(lastIn.body)
            ? renderStep("Hi {{first_name}}, absolutely — I'll share two short case studies from similar {{industry}} brands. Would Tuesday or Wednesday work for a quick walkthrough?", lead, "Meta Ads", "")
            : renderStep("Thanks {{first_name}}! Happy to set up a quick call to walk through ideas for {{company}}. Does Tuesday or Thursday afternoon work?", lead, "Meta Ads", "")
        : renderStep("Hi {{first_name}}, following up on my note about {{company}} — happy to share a few specific ideas if helpful.", lead, "Meta Ads", "");
    } else body = `Hi team, thanks for the note — I'll look into this and come back to you today.`;
    if (aiEnabled && lead) {
      try {
        const res = await fetch("/api/ai/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead, channel: active.channel, kind: "reply", context: thread.slice(-6).map((m) => `${m.direction === "inbound" ? "Lead" : "Adbibe"}: ${m.body}`).join("\n") }) });
        const d = await res.json();
        if (d.text) body = d.text;
      } catch {}
    }
    setText(body);
    setSuggesting(false);
  };

  const send = () => {
    if (!active || !text.trim()) return;
    if (active.handledBy === "ai") takeOver(active.id);
    sendMessage(active.id, text.trim(), "human");
    setText("");
  };

  return (
    <div className="-mx-4 -my-5 lg:-mx-6 lg:-my-6 flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* List */}
      <section className={cn("flex w-full flex-col border-r border-border bg-surface md:w-80 lg:w-96 shrink-0", active && "hidden md:flex")}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-semibold">Inbox</h1>
            {needsHuman > 0 && !isClient && <button onClick={() => setStatus(status === "needs_human" ? "All" : "needs_human")}><Badge tone="warning" dot>{needsHuman} need a human</Badge></button>}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Search conversations…" />
          {!isClient && <div className="grid grid-cols-2 gap-1.5">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="h-7 text-xs"><option value="All">All channels</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-7 text-xs"><option value="All">All statuses</option><option value="needs_human">Needs human</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="closed">Closed</option></Select>
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-7 text-xs"><option value="All">All members</option>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            <Select value={handled} onChange={(e) => setHandled(e.target.value)} className="h-7 text-xs"><option value="All">AI + human</option><option value="ai">Handled by AI</option><option value="human">Handled by human</option></Select>
            <Select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="col-span-2 h-7 text-xs"><option value="All">All campaigns</option><option value="none">No campaign</option>{outreach.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          </div>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && <EmptyState icon={<Inbox className="size-5" />} title="No conversations" />}
          {list.map((c) => {
            const m = lastMsg.get(c.id);
            return (
              <button key={c.id} onClick={() => select(c.id)} className={cn("flex w-full gap-2.5 border-b border-border px-3 py-3 text-left transition hover:bg-surface-2", c.id === activeId && "bg-accent-soft/50")}>
                <Avatar name={title(c)} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-[13px]", c.unread ? "font-semibold" : "font-medium")}>{title(c)}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-fg-3">{relTime(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-fg-3">{subtitle(c)}{c.subject ? ` · ${c.subject}` : ""}</p>
                  <p className={cn("mt-0.5 truncate text-xs", c.unread ? "text-fg" : "text-fg-3")}>{isClient ? (m?.direction === "outbound" ? "Adbibe: " : "You: ") : m?.direction === "outbound" ? (m.author === "ai" ? "AI: " : "You: ") : ""}{m?.body}</p>
                  {!isClient && <div className="mt-1.5 flex items-center gap-1.5">
                    <ChannelIcon c={c.channel} className="size-3 text-fg-3" />
                    {c.status === "needs_human" && <Badge tone="warning">Needs human</Badge>}
                    {c.handledBy === "ai" ? <Badge tone="accent">AI</Badge> : <MemberAvatar id={c.ownerId} size={16} />}
                    {c.unread > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{c.unread}</span>}
                  </div>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Thread */}
      <section className={cn("flex min-w-0 flex-1 flex-col bg-bg", !active && "hidden md:flex")}>
        {!active ? (
          <div className="grid flex-1 place-items-center"><EmptyState icon={<Inbox className="size-5" />} title="Select a conversation" description={isClient ? "Your conversations with the Adbibe team." : "All email, LinkedIn, WhatsApp and Instagram threads in one place."} /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
              <button className="md:hidden rounded-md p-1 hover:bg-surface-2" onClick={() => router.replace("/inbox")}><ArrowLeft className="size-4" /></button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{title(active)} <span className="font-normal text-fg-3">· {subtitle(active)}</span></p>
                <p className="flex items-center gap-1.5 text-[11px] text-fg-3"><ChannelIcon c={active.channel} className="size-3" />{active.channel}{active.subject && ` · ${active.subject}`}{camp && ` · ${camp.name}`}</p>
              </div>
              {!isClient && <StatusBadge status={active.status} />}
              {canWrite && (active.handledBy === "ai" ? (
                <Button size="xs" variant="primary" icon={<Hand className="size-3" />} onClick={() => { takeOver(active.id); toast("You're now handling this conversation", "AI follow-ups paused for this thread"); }}>Take over from AI</Button>
              ) : (
                <Button size="xs" icon={<Bot className="size-3" />} onClick={() => { handBack(active.id); toast("Handed back to AI", undefined, "ai"); }}>Hand back to AI</Button>
              ))}
              {canWrite && (
                <Select value={active.status} onChange={(e) => updateConversation(active.id, { status: e.target.value as Conversation["status"] })} className="h-7 w-32 text-xs">
                  <option value="open">Open</option><option value="waiting">Waiting</option><option value="needs_human">Needs human</option><option value="closed">Closed</option>
                </Select>
              )}
            </div>
            {active.handledBy === "ai" && !isClient && <div className="border-b border-border bg-accent-soft/60 px-4 py-1.5 text-[11px] text-accent-text"><Sparkles className="mr-1 inline size-3" />The AI agent is handling this thread. It drafts follow-ups and flags replies — take over any time.</div>}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {thread.map((m) => {
                const out = m.direction === "outbound";
                return (
                  <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] sm:max-w-[70%]")}>
                      <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] text-fg-3", out && "justify-end")}>
                        {isClient ? (out ? <><User className="size-3" />Adbibe team</> : "You") : out ? (m.author === "ai" ? <><Bot className="size-3" />AI agent</> : <><User className="size-3" />{team.find((t) => t.id === m.authorId)?.name ?? "Team"}</>) : title(active)}
                        <span>· {fmtDateTime(m.sentAt)}</span>
                        {m.sentiment && !isClient && <Badge tone={m.sentiment === "positive" ? "success" : m.sentiment === "negative" ? "danger" : "neutral"}>{m.sentiment}</Badge>}
                      </div>
                      <div className={cn("whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed", out ? (m.author === "ai" ? "rounded-br-md bg-accent-soft text-fg" : "rounded-br-md bg-fg text-bg") : "rounded-bl-md border border-border bg-surface")}>{m.body}</div>
                      {out && !isClient && <p className="mt-0.5 text-right text-[10px] text-fg-3">{m.status}</p>}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            {isClient && can(me.role, "inbox", "write") && (
              <div className="border-t border-border bg-surface p-3">
                <Textarea value={clientDraft} onChange={(e) => setClientText({ id: activeId ?? "", value: e.target.value })} rows={3} placeholder="Write to your Adbibe team…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendAsClient(); }} />
                <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" icon={<Send className="size-3.5" />} disabled={!clientDraft.trim()} onClick={sendAsClient}>Send</Button></div>
              </div>
            )}
            {canWrite && (
              <div className="border-t border-border bg-surface p-3">
                {lead?.optedOut ? (
                  <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">This contact opted out and is suppressed — messaging is disabled.</p>
                ) : (
                  <>
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={`Reply via ${active.channel}…`} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button size="xs" variant="ai" icon={<Sparkles className="size-3" />} loading={suggesting} onClick={suggest}>AI suggest reply</Button>
                      <div className="relative">
                        <Button size="xs" variant="ghost" icon={<FlaskConical className="size-3" />} onClick={() => setSimOpen((o) => !o)}>Simulate reply</Button>
                        {simOpen && (
                          <div className="animate-in absolute bottom-full left-0 z-10 mb-1 w-72 rounded-xl border border-border bg-surface p-1 shadow-pop">
                            <p className="px-2 py-1 text-[11px] text-fg-3">Demo: inject an inbound reply to test stop rules</p>
                            {SAMPLE_REPLIES.map((r) => (
                              <button key={r} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2" onClick={() => { receiveReply(active.id, r); setSimOpen(false); toast("Inbound reply received", "Follow-ups stopped · stage updated", "ai"); }}>{r}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="ml-auto hidden text-[11px] text-fg-3 sm:inline">Ctrl + Enter to send</span>
                      <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} disabled={!text.trim()} onClick={send}>Send</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Context */}
      {active && !isClient && (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4 xl:block">
          {lead ? (
            <div className="space-y-4 text-[13px]">
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.name} size={40} />
                <div className="min-w-0"><Link href={`/leads/${lead.id}`} className="block truncate font-semibold hover:underline">{lead.name}</Link><p className="truncate text-xs text-fg-3">{lead.jobTitle} · {lead.company}</p></div>
              </div>
              <div className="flex items-center justify-between"><StatusBadge status={lead.status} /><ScorePill score={effectiveScore(lead)} /></div>
              <dl className="space-y-2 text-xs">
                {[["Email", lead.email], ["Phone", lead.phone], ["Industry", lead.industry], ["Location", lead.location], ["Owner", team.find((t) => t.id === lead.ownerId)?.name], ["Next follow-up", lead.nextFollowUpAt ? relTime(lead.nextFollowUpAt) : "None (stopped)"]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><dt className="text-fg-3">{k}</dt><dd className="truncate text-right">{v}</dd></div>
                ))}
              </dl>
              {lead.research?.summary && (
                <div className="rounded-lg bg-surface-2 p-3">
                  <AIBadge>Lead summary</AIBadge>
                  <p className="mt-1.5 text-xs leading-relaxed text-fg-2 line-clamp-[10]">{lead.research.summary}</p>
                </div>
              )}
              {camp && (
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="text-fg-3">Outreach campaign</p>
                  <Link href={`/outreach?c=${camp.id}`} className="font-medium hover:underline">{camp.name}</Link>
                  <p className="mt-1 text-fg-3">State: {camp.recipients.find((r) => r.leadId === lead.id)?.state ?? "—"}</p>
                </div>
              )}
              <Button href={`/leads/${lead.id}`} size="sm" className="w-full">Open lead profile</Button>
            </div>
          ) : client ? (
            <div className="space-y-3 text-[13px]">
              <p className="font-semibold">{client.company}</p>
              <p className="text-xs text-fg-3">{client.industry} · {client.location}</p>
              <StatusBadge status={client.health} />
              <p className="text-xs text-fg-2">Services: {client.services.join(", ")}</p>
              <Button href={`/clients/${client.id}`} size="sm" className="w-full">Open client</Button>
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxInner />
    </Suspense>
  );
}
