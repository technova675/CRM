"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Maximize2, Sparkles, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { MessageView } from "@/components/command/MessageView";
import { newThread, runCommand, threadTitle, userMessage, type CmdMessage } from "@/components/command/run";
import { useUI } from "./ui-state";

const SUGGESTIONS = [
  "Show me all leads that need follow-up.",
  "Which clients are at risk?",
  "What should the media team optimize today?",
  "Which clients have pending payments?",
  "Compare this month's performance with last month.",
  "Summarize Bloom Organics",
];

// Floating "Ask AI" drawer. Uses the same Command Center engine (RBAC-scoped,
// credits metered) and can hand the conversation over to the full Command Center.
export function AssistantPanel() {
  const open = useUI((s) => s.assistantOpen);
  const prompt = useUI((s) => s.assistantPrompt);
  const setOpen = useUI((s) => s.setAssistant);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const me = useMe();
  const router = useRouter();
  const allowed = can(me.role, "command");
  const [msgs, setMsgs] = useState<CmdMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    if (!q.trim() || busy || !allowed) return;
    setInput("");
    setMsgs((m) => [...m, userMessage(q)]);
    setBusy(true);
    const reply = await runCommand(q);
    setMsgs((m) => [...m, reply]);
    setBusy(false);
  };

  const openInCommandCenter = () => {
    if (msgs.length) {
      const first = msgs.find((m) => m.role === "user");
      const th = { ...newThread(me.id), title: threadTitle(first?.content ?? "Assistant conversation"), messages: msgs };
      useCRM.getState().upsert("threads", th);
      router.push(`/command?t=${th.id}`);
    } else router.push("/command");
    setOpen(false);
  };

  useEffect(() => {
    // Prompts handed over from the palette/dashboard arrive through the UI store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && prompt) void ask(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 sm:inset-auto sm:bottom-4 sm:right-4 sm:top-18 flex">
      <div className="absolute inset-0 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
      <div className="animate-slide relative ml-auto mt-auto sm:mt-0 flex h-[85dvh] sm:h-auto w-full sm:w-[440px] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="ai-gradient grid size-7 place-items-center rounded-lg text-white">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Adbibe Assistant</p>
            <p className="truncate text-[11px] text-fg-3">{aiEnabled ? "AI provider + your authorized data" : "Local engine · answers from your authorized data"}</p>
          </div>
          {allowed && (
            <button onClick={openInCommandCenter} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-accent-text hover:bg-surface-2" title="Open in Command Center">
              <Maximize2 className="size-3" /> <span className="hidden sm:inline">Open in Command Center</span>
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2" aria-label="Close assistant">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed">
          {!allowed ? (
            <div className="space-y-2 text-fg-2">
              <p>The AI assistant isn&apos;t part of the client portal.</p>
              <p className="text-xs text-fg-3">You can review your campaigns, reports and creatives from the sidebar, or message your account manager in the inbox.</p>
              <Link href="/reports" onClick={() => setOpen(false)} className="text-xs font-medium text-accent-text hover:underline">
                View your reports →
              </Link>
            </div>
          ) : (
            msgs.length === 0 && (
              <div>
                <p className="mb-3 text-fg-2">Ask about leads, clients, campaigns, payments or reports. Try one of these:</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="rounded-lg border border-border px-3 py-2 text-left text-[13px] hover:border-border-strong hover:bg-surface-2">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
          {msgs.map((m, i) => (
            <div key={i} className="animate-in">
              <MessageView
                msg={m}
                compact
                onNavigate={() => setOpen(false)}
                onClarify={(cid, q) => {
                  setMsgs((x) => [...x, userMessage(q)]);
                  setBusy(true);
                  void runCommand(q, { clientId: cid }).then((r) => {
                    setMsgs((x) => [...x, r]);
                    setBusy(false);
                  });
                }}
                onTaskCreated={(text) => setMsgs((x) => x.map((y, j) => (j === i ? { ...y, createdTasks: [...(y.createdTasks ?? []), text] } : y)))}
              />
            </div>
          ))}
          {busy && (
            <div className="flex gap-1 py-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
        {allowed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="border-t border-border p-3"
          >
            <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-1.5 focus-within:border-accent">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={1}
                placeholder="Ask the agency AI…"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-fg-3"
              />
              <button type="submit" disabled={!input.trim() || busy} className="grid size-8 place-items-center rounded-lg bg-fg text-bg disabled:opacity-30" aria-label="Send">
                <ArrowUp className="size-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
