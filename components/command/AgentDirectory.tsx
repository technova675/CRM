"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bot, MessageSquarePlus, ShieldCheck } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can, MODULE_LABEL } from "@/lib/permissions";
import { AGENT_LIST, AGENTS } from "@/lib/ai/agents";
import type { AgentId, AITask } from "@/lib/types";
import { relTime, sum } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, EmptyState, type Tone } from "@/components/ui";

const MODE_TONE: Record<string, Tone> = { Automatic: "success", "Approval Required": "warning", Manual: "neutral" };
const TASK_TONE: Record<AITask["status"], Tone> = { done: "success", running: "info", queued: "neutral", failed: "danger", awaiting_approval: "warning" };
const TASK_LABEL: Record<AITask["status"], string> = { done: "Done", running: "Running", queued: "Queued", failed: "Failed", awaiting_approval: "Awaiting approval" };

export function AgentDirectory({ onAsk }: { onAsk: (a: AgentId) => void }) {
  const me = useMe();
  const aiTasks = useCRM((s) => s.aiTasks);
  const modes = useCRM((s) => s.settings.approvalModes);
  const byAgent = useMemo(() => {
    const m = new Map<AgentId, AITask[]>();
    aiTasks.forEach((t) => m.set(t.agent, [...(m.get(t.agent) ?? []), t]));
    return m;
  }, [aiTasks]);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {AGENT_LIST.map((a) => {
        const tasks = byAgent.get(a.id) ?? [];
        const allowed = a.modules.some((m) => can(me.role, m));
        const mode = modes[a.action];
        return (
          <Card key={a.id} className="flex flex-col p-4">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: a.color }}>
                <Bot className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{a.name}</p>
                <p className="text-xs text-fg-3">{a.description}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {a.capabilities.map((c) => (
                <Badge key={c} tone="neutral">{c}</Badge>
              ))}
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-fg-3">Knowledge</dt>
                <dd className="text-fg-2">{a.knowledge.join(" · ")}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-fg-3">Modules</dt>
                <dd className="text-fg-2">{a.modules.map((m) => MODULE_LABEL[m]).join(", ")}</dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-fg-3">Approval</dt>
                <dd className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3 text-fg-3" />
                  <span className="text-fg-2">{a.action}</span>
                  <Badge tone={MODE_TONE[mode] ?? "neutral"}>{mode}</Badge>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-fg-3">Credits used</dt>
                <dd className="tabular-nums text-fg-2">
                  {sum(tasks.map((t) => t.credits))} · {tasks.length} task{tasks.length === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex-1 space-y-1 border-t border-border pt-2">
              <p className="text-[11px] font-medium text-fg-3">Recent AI tasks</p>
              {tasks.slice(0, 3).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-fg-2">{t.title}</span>
                  <Badge tone={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</Badge>
                  <span className="shrink-0 text-[11px] text-fg-3">{relTime(t.createdAt)}</span>
                </div>
              ))}
              {!tasks.length && <p className="text-xs text-fg-3">No tasks yet.</p>}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="xs" variant={allowed ? "primary" : "secondary"} disabled={!allowed} icon={<MessageSquarePlus className="size-3" />} onClick={() => onAsk(a.id)}>
                Ask this agent
              </Button>
              {!allowed && <span className="text-[11px] text-fg-3">No access for your role</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function ActivityFeed() {
  const aiTasks = useCRM((s) => s.aiTasks);
  const approvals = useCRM((s) => s.approvals);
  const clients = useCRM((s) => s.clients);
  const activities = useCRM((s) => s.activities);
  const pending = approvals.filter((a) => a.status === "pending").length;
  const credits = useMemo(() => sum(aiTasks.map((t) => t.credits)), [aiTasks]);
  const aiActions = useMemo(() => activities.filter((a) => a.actor === "ai").slice(0, 12), [activities]);
  const name = (id?: string) => clients.find((c) => c.id === id)?.company;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold">AI activity</p>
            <p className="text-xs text-fg-3">
              {aiTasks.length} AI tasks · {credits} credits metered
            </p>
          </div>
          <Link href="/automations?tab=approvals" className="text-xs font-medium text-accent-text hover:underline">
            {pending} pending approval{pending === 1 ? "" : "s"} →
          </Link>
        </div>
        {aiTasks.length === 0 ? (
          <EmptyState icon={<Bot className="size-5" />} title="No AI activity yet" description="Every Command Center answer and agent job is logged here with its credit cost." />
        ) : (
          <ul className="divide-y divide-border">
            {aiTasks.slice(0, 40).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:flex-nowrap">
                <AgentChip name={AGENTS[t.agent].short} color={AGENTS[t.agent].color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{t.title}</p>
                  <p className="truncate text-[11px] text-fg-3">
                    {t.input !== t.title ? `${t.input} · ` : ""}
                    {name(t.clientId) ?? "Agency-wide"}
                  </p>
                </div>
                <Badge tone={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</Badge>
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-fg-3">{t.credits} cr</span>
                <span className="w-20 shrink-0 text-right text-[11px] text-fg-3">{relTime(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="h-fit">
        <div className="border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold">Actions executed by AI</p>
          <p className="text-xs text-fg-3">From the audit log</p>
        </div>
        <ul className="divide-y divide-border">
          {aiActions.map((a) => (
            <li key={a.id} className="px-4 py-2">
              <p className="text-xs text-fg">{a.action}</p>
              <p className="truncate text-[11px] text-fg-3">
                {a.agent ? `${AGENTS[a.agent].short} · ` : ""}
                {a.detail ?? a.entity} · {relTime(a.at)}
              </p>
            </li>
          ))}
          {!aiActions.length && <li className="px-4 py-6 text-center text-xs text-fg-3">No AI actions logged yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
