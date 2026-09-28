"use client";

import { useState } from "react";
import { ArrowUp, Lightbulb } from "lucide-react";
import { AGENT_LIST } from "@/lib/ai/agents";
import { COMMAND_EXAMPLES } from "@/lib/ai/command";
import type { AgentId, Client } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SuggestionChips({ onPick, items = COMMAND_EXAMPLES, className }: { onPick: (q: string) => void; items?: readonly string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((s) => (
        <button key={s} onClick={() => onPick(s)} className="rounded-full border border-border bg-surface px-2.5 py-1 text-left text-xs text-fg-2 transition hover:border-accent hover:bg-accent-soft hover:text-accent-text">
          {s}
        </button>
      ))}
    </div>
  );
}

const pickerCls = "h-7 max-w-[46%] sm:max-w-[200px] truncate rounded-md border border-border bg-surface px-1.5 text-xs text-fg-2 outline-none focus:border-accent";

export function Composer({
  onSend,
  busy,
  agent,
  onAgent,
  clientId,
  onClient,
  clients,
}: {
  onSend: (q: string) => void;
  busy: boolean;
  agent: AgentId | "auto";
  onAgent: (a: AgentId | "auto") => void;
  clientId: string;
  onClient: (id: string) => void;
  clients: Client[];
}) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState(false);
  const send = (q = text) => {
    if (!q.trim() || busy) return;
    onSend(q.trim());
    setText("");
    setChips(false);
  };
  return (
    <div className="space-y-2">
      {chips && <SuggestionChips onPick={(q) => send(q)} className="max-h-40 overflow-y-auto" />}
      <div className="rounded-xl border border-border bg-surface-2 p-1.5 focus-within:border-accent">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ask the agency AI… e.g. “Analyze the performance of all our ecommerce clients this month”"
          className="max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-fg-3"
          aria-label="Message"
        />
        <div className="flex items-center gap-1.5">
          <select value={agent} onChange={(e) => onAgent(e.target.value as AgentId | "auto")} className={pickerCls} aria-label="Agent">
            <option value="auto">Auto-route agent</option>
            {AGENT_LIST.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select value={clientId} onChange={(e) => onClient(e.target.value)} className={pickerCls} aria-label="Client">
            <option value="">No client selected</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setChips((v) => !v)} className={cn("grid size-7 place-items-center rounded-md text-fg-3 hover:bg-surface hover:text-fg", chips && "bg-surface text-accent-text")} aria-label="Suggested prompts" title="Suggested prompts">
            <Lightbulb className="size-3.5" />
          </button>
          <button type="button" onClick={() => send()} disabled={!text.trim() || busy} className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg bg-fg text-bg disabled:opacity-30" aria-label="Send">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
