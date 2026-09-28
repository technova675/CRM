"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, CircleCheck, ListChecks, ListPlus, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { AGENTS } from "@/lib/ai/agents";
import type { CommandTodo } from "@/lib/ai/command";
import { cn } from "@/lib/utils";
import { AgentChip, Badge, Button, InsightList, InsightTag } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { RichText } from "./RichText";
import { createTaskFromTodo, type CmdMessage } from "./run";

function Steps({ steps, defaultOpen }: { steps: string[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!steps.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-2/50">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-fg-3 hover:text-fg-2">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <ListChecks className="size-3" />
        What I did · {steps.length} step{steps.length > 1 ? "s" : ""}
      </button>
      {open && (
        <ol className="space-y-1 px-3 pb-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-fg-2">
              <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-success-soft text-[9px] font-semibold text-success">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RecommendationCards({ ids, compact }: { ids: string[]; compact?: boolean }) {
  const all = useCRM((s) => s.recommendations);
  const act = useCRM((s) => s.actOnRecommendation);
  const me = useMe();
  const writable = can(me.role, "performance", "write") || can(me.role, "campaigns", "write");
  const recs = useMemo(() => ids.map((id) => all.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r), [ids, all]);
  if (!recs.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-fg-3">Recommendations created · Finding → Evidence → Action → Human approval</p>
      {recs.map((r) => (
        <div key={r.id} className="rounded-lg border border-border p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={r.priority === "High" ? "danger" : r.priority === "Medium" ? "warning" : "neutral"}>{r.priority}</Badge>
            <Badge tone="neutral">{r.category}</Badge>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.title}</span>
            <Badge tone={r.status === "New" ? "info" : r.status === "Dismissed" ? "neutral" : r.status === "Awaiting Approval" ? "warning" : "success"}>{r.status}</Badge>
          </div>
          {!compact && (
            <div className="mt-1.5 space-y-1 text-xs">
              <p className="text-fg-2">{r.finding}</p>
              {r.evidence.length > 0 && (
                <p className="text-fg-3">
                  {r.evidence.map((e) => `${e.label}: ${e.value}`).join(" · ")} <span className="text-[11px]">({r.evidence[0]!.source})</span>
                </p>
              )}
              {r.why && (
                <p className="flex items-start gap-1.5 text-fg-3">
                  <InsightTag kind="assumption" /> <span>{r.why}</span>
                </p>
              )}
              <p className="flex items-start gap-1.5 text-fg-2">
                <InsightTag kind="recommendation" /> <span>{r.recommendation}</span>
              </p>
            </div>
          )}
          {r.status === "New" && writable && (
            <div className="mt-2 flex gap-1.5">
              <Button size="xs" variant="primary" icon={<Check className="size-3" />} onClick={() => { act(r.id, "approve"); toast("Recommendation approved", "Executed according to your approval settings."); }}>
                Approve
              </Button>
              <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => act(r.id, "dismiss")}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MessageView({
  msg,
  compact,
  onClarify,
  onTaskCreated,
  onNavigate,
}: {
  msg: CmdMessage;
  compact?: boolean;
  onClarify?: (clientId: string, q: string) => void;
  onTaskCreated?: (text: string) => void;
  onNavigate?: () => void;
}) {
  const me = useMe();
  const canTask = can(me.role, "tasks", "write");
  const [showLocal, setShowLocal] = useState(false);
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-fg px-3 py-2 text-[13px] text-bg">{msg.content}</div>
      </div>
    );
  }
  const agent = msg.agent ? AGENTS[msg.agent] : undefined;
  const facts = (msg.insights ?? []).filter((i) => i.kind !== "recommendation");
  const recs = (msg.insights ?? []).filter((i) => i.kind === "recommendation");
  const todoFor = (text: string): CommandTodo => msg.todos?.find((t) => t.text === text) ?? { text, clientId: msg.clientId };
  const created = new Set(msg.createdTasks ?? []);
  const makeTask = (text: string) => {
    const mode = createTaskFromTodo(todoFor(text), msg.agent);
    if (mode === "denied") return toast("You can't create tasks", "Your role has no write access to Tasks.", "warning");
    toast(mode === "Approval Required" ? "Task sent for approval" : "Task created", mode === "Approval Required" ? "Approve it in Automations → Approvals." : text);
    onTaskCreated?.(text);
  };
  const pending = recs.filter((r) => !created.has(r.text));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {agent && <AgentChip name={agent.name} color={agent.color} />}
        {msg.mode === "ai" && <Badge tone="accent">AI model + local data</Badge>}
        {msg.mode === "local" && <span className="text-[11px] text-fg-3">Local engine · computed from your data</span>}
      </div>
      {msg.steps && msg.steps.length > 0 && <Steps steps={msg.steps} defaultOpen={!compact && msg.steps.length >= 5} />}
      <RichText text={msg.content} />
      {msg.localContent && (
        <div>
          <button onClick={() => setShowLocal((v) => !v)} className="text-[11px] font-medium text-accent-text hover:underline">
            {showLocal ? "Hide" : "Show"} deterministic analysis
          </button>
          {showLocal && <RichText text={msg.localContent} className="mt-1 rounded-lg border border-border p-2.5" />}
        </div>
      )}
      {msg.clarify && onClarify && (
        <div className="flex flex-wrap gap-1.5">
          {msg.clarify.options.map((o) => (
            <button key={o.id} onClick={() => onClarify(o.id, msg.clarify!.q)} className="h-7 rounded-full border border-border bg-surface px-3 text-xs font-medium hover:border-accent hover:bg-accent-soft hover:text-accent-text">
              {o.label}
            </button>
          ))}
        </div>
      )}
      {facts.length > 0 && <InsightList items={facts} compact={compact} />}
      {recs.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-fg-3">Recommendations</p>
            {canTask && pending.length > 1 && (
              <button onClick={() => pending.forEach((r) => makeTask(r.text))} className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text hover:underline">
                <ListPlus className="size-3" /> Turn all into tasks
              </button>
            )}
          </div>
          <ul className="space-y-1.5">
            {recs.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                <InsightTag kind="recommendation" />
                <span className={cn("min-w-0 flex-1 text-fg-2", compact && "text-xs")}>{r.text}</span>
                {canTask &&
                  (created.has(r.text) ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-success">
                      <CircleCheck className="size-3" /> Task
                    </span>
                  ) : (
                    <button onClick={() => makeTask(r.text)} className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-fg-2 hover:bg-surface-2" title="Create a task (respects the Task creation approval mode)">
                      + Task
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg.recommendationIds && msg.recommendationIds.length > 0 && <RecommendationCards ids={msg.recommendationIds} compact={compact} />}
      {msg.items && msg.items.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {msg.items.slice(0, compact ? 8 : 20).map((it, j) =>
            it.href ? (
              <Link key={j} href={it.href} onClick={onNavigate} className="block px-3 py-2 hover:bg-surface-2">
                <span className="block truncate text-[13px] font-medium">{it.label}</span>
                {it.sub && <span className="block truncate text-xs text-fg-3">{it.sub}</span>}
              </Link>
            ) : (
              <div key={j} className="px-3 py-2">
                <span className="block text-[13px] font-medium">{it.label}</span>
                {it.sub && <span className="block text-xs text-fg-3">{it.sub}</span>}
              </div>
            ),
          )}
        </div>
      )}
      {msg.actions && msg.actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {msg.actions.map((a) => (
            <span key={a.href} onClick={onNavigate}>
              <Button size="xs" variant={a.primary ? "ai" : "secondary"} href={a.href} icon={<ArrowUpRight className="size-3" />}>
                {a.label}
              </Button>
            </span>
          ))}
          {msg.actions.some((a) => a.primary) && <span className="text-[11px] text-fg-3">Human reviews before execution</span>}
        </div>
      )}
    </div>
  );
}
