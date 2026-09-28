"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, History, MessageSquarePlus, Trash2 } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { AGENTS } from "@/lib/ai/agents";
import { AGENT_IDS, type AgentId } from "@/lib/types";
import { cn, relTime } from "@/lib/utils";
import { AgentChip, Badge, Card, InsightLegend, PageHeader, Tabs } from "@/components/ui";
import { Composer, SuggestionChips } from "@/components/command/Composer";
import { HomePanels } from "@/components/command/HomePanels";
import { MessageView } from "@/components/command/MessageView";
import { ActivityFeed, AgentDirectory } from "@/components/command/AgentDirectory";
import { newThread, runCommand, threadTitle, userMessage, type CmdMessage } from "@/components/command/run";

type Tab = "chat" | "agents" | "activity";
const asAgent = (v: string | null): AgentId | "auto" => (v && (AGENT_IDS as readonly string[]).includes(v) ? (v as AgentId) : "auto");

function CommandInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const threads = useCRM((s) => s.threads);
  const clients = useCRM((s) => s.clients);
  const aiTasks = useCRM((s) => s.aiTasks);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const upsert = useCRM((s) => s.upsert);
  const remove = useCRM((s) => s.remove);

  const [tab, setTab] = useState<Tab>(() => (["agents", "activity"].includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "chat"));
  const [activeId, setActiveId] = useState<string | null>(() => params.get("t"));
  const [draftAgent, setDraftAgent] = useState<AgentId | "auto">(() => asAgent(params.get("agent")));
  const [clientId, setClientId] = useState(() => params.get("client") ?? "");
  const [busy, setBusy] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const mine = useMemo(() => threads.filter((t) => t.ownerId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [threads, me.id]);
  const active = mine.find((t) => t.id === activeId);
  const agentSel: AgentId | "auto" = active ? (active.agent ?? "auto") : draftAgent;
  const running = aiTasks.filter((t) => t.status === "running").length;

  const ask = async (q: string, o: { fresh?: boolean; clientId?: string } = {}) => {
    if (busy || !q.trim()) return;
    setBusy(true);
    setTab("chat");
    const st = useCRM.getState();
    const existing = !o.fresh && activeId ? st.threads.find((t) => t.id === activeId) : undefined;
    const base = existing ?? newThread(me.id, draftAgent === "auto" ? undefined : draftAgent);
    const th = { ...base, title: base.messages.length ? base.title : threadTitle(q), messages: [...base.messages, userMessage(q)] };
    upsert("threads", th);
    setActiveId(th.id);
    setShowThreads(false);
    const cid = o.clientId ?? (clientId || undefined);
    try {
      const reply = await runCommand(q, { agent: th.agent, clientId: cid });
      const latest = useCRM.getState().threads.find((t) => t.id === th.id) ?? th;
      useCRM.getState().upsert("threads", { ...latest, messages: [...latest.messages, reply] });
      if (reply.clientId && !clientId) setClientId(reply.clientId); // "this client" now refers to the resolved client
    } finally {
      setBusy(false);
    }
  };

  // /command?q=… (palette, other modules) auto-asks once on load in a fresh thread.
  useEffect(() => {
    const q = params.get("q");
    if (!q || asked.current) return;
    asked.current = true;
    void ask(q, { fresh: true });
    router.replace("/command", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length, busy]);

  const markTask = (threadId: string, index: number, text: string) => {
    const t = useCRM.getState().threads.find((x) => x.id === threadId);
    if (!t) return;
    const messages = t.messages.map((m, i) => (i === index ? { ...m, createdTasks: [...((m as CmdMessage).createdTasks ?? []), text] } : m));
    useCRM.getState().upsert("threads", { ...t, messages });
  };
  const setAgent = (a: AgentId | "auto") => {
    if (active) upsert("threads", { ...active, agent: a === "auto" ? undefined : a });
    else setDraftAgent(a);
  };
  const startThread = (agent: AgentId | "auto" = "auto") => {
    setActiveId(null);
    setDraftAgent(agent);
    setShowThreads(false);
    setTab("chat");
  };

  const pinned = agentSel !== "auto" ? AGENTS[agentSel] : undefined;

  return (
    <div>
      <PageHeader
        title="AI Command Center"
        icon={<BrainCircuit className="size-5 text-accent-text" />}
        description="Ask anything about the agency. Specialised agents answer from the data you're authorized to see — and show their work."
        actions={
          <>
            <Badge tone={aiEnabled ? "accent" : "neutral"} dot>
              {aiEnabled ? "AI provider connected" : "Local engine"}
            </Badge>
            {running > 0 && <Badge tone="info">{running} AI task{running > 1 ? "s" : ""} running</Badge>}
          </>
        }
      />
      <div className="mb-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "chat", label: "Assistant", count: mine.length },
            { value: "agents", label: "Agents", count: 12 },
            { value: "activity", label: "AI activity", count: aiTasks.length },
          ]}
        />
      </div>

      {tab === "agents" && <AgentDirectory onAsk={(a) => startThread(a)} />}
      {tab === "activity" && <ActivityFeed />}

      {tab === "chat" && (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className={cn("lg:block", showThreads ? "block" : "hidden")}>
            <Card className="overflow-hidden">
              <div className="border-b border-border p-2">
                <button onClick={() => startThread()} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-[13px] font-medium hover:bg-surface-2">
                  <MessageSquarePlus className="size-3.5" /> New thread
                </button>
              </div>
              <ul className="max-h-[50vh] overflow-y-auto p-1.5 lg:max-h-[calc(100dvh-300px)]">
                {mine.map((t) => (
                  <li key={t.id} className="group">
                    <div className={cn("flex items-start gap-1 rounded-lg px-2 py-1.5", t.id === activeId ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                      <button onClick={() => { setActiveId(t.id); setShowThreads(false); }} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px]">{t.title}</span>
                        <span className="flex items-center gap-1 text-[11px] text-fg-3">
                          {t.agent && <span className="size-1.5 rounded-full" style={{ background: AGENTS[t.agent].color }} />}
                          {t.agent ? `${AGENTS[t.agent].short} · ` : ""}
                          {relTime(t.createdAt)}
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          remove("threads", t.id);
                          if (t.id === activeId) setActiveId(null);
                        }}
                        className="rounded p-1 text-fg-3 opacity-100 hover:bg-surface hover:text-danger lg:opacity-0 lg:group-hover:opacity-100"
                        aria-label="Delete thread"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </li>
                ))}
                {!mine.length && <li className="px-2 py-6 text-center text-xs text-fg-3">No threads yet — ask your first question.</li>}
              </ul>
            </Card>
          </aside>

          <Card className="flex h-[calc(100dvh-210px)] min-h-[520px] min-w-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <button onClick={() => setShowThreads((v) => !v)} className="grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface-2 lg:hidden" aria-label="Show threads">
                <History className="size-4" />
              </button>
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{active?.title ?? "New thread"}</p>
              {pinned ? <AgentChip name={`Pinned: ${pinned.name}`} color={pinned.color} /> : <span className="text-[11px] text-fg-3">Auto-routing to the best agent</span>}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {!active || active.messages.length === 0 ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] text-fg-2">{pinned ? `Ask the ${pinned.name} — ${pinned.description.toLowerCase()}` : "What would you like to know? Pick a prompt or type your own. Choose a client below to use “this client”."}</p>
                    <SuggestionChips className="mt-2" onPick={(q) => void ask(q)} items={pinned ? pinned.examples : undefined} />
                  </div>
                  {!pinned && <HomePanels onAsk={(q) => void ask(q)} />}
                  <InsightLegend />
                </div>
              ) : (
                active.messages.map((m, i) => (
                  <div key={i} className="animate-in">
                    <MessageView msg={m as CmdMessage} onClarify={(cid, q) => { setClientId(cid); void ask(q, { clientId: cid }); }} onTaskCreated={(text) => markTask(active.id, i, text)} />
                  </div>
                ))
              )}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-fg-3">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </span>
                  Finding data → analysing → drafting recommendations…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-border p-3">
              <Composer onSend={(q) => void ask(q)} busy={busy} agent={agentSel} onAgent={setAgent} clientId={clientId} onClient={setClientId} clients={clients} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Re-mount when another surface (e.g. the assistant drawer) opens a specific thread.
function CommandKeyed() {
  const t = useSearchParams().get("t") ?? "";
  return <CommandInner key={t} />;
}

export default function CommandPage() {
  return (
    <Suspense>
      <CommandKeyed />
    </Suspense>
  );
}
