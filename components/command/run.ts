"use client";

import { useCRM } from "@/lib/store";
import { can } from "@/lib/permissions";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { answerCommand, buildCommandSnapshot, type CommandAction, type CommandAnswer, type CommandOpts, type CommandTodo } from "@/lib/ai/command";
import type { AgentId, CommandMessage, CommandThread, InsightItem, Recommendation } from "@/lib/types";
import { DAY, uid } from "@/lib/utils";

// Persisted Command Center message: the shared CommandMessage plus UI-only extras
// (deep-link actions, task-able recommendations, clarifying options).
export interface CmdMessage extends CommandMessage {
  actions?: CommandAction[];
  todos?: CommandTodo[];
  clarify?: CommandAnswer["clarify"];
  clientId?: string;
  createdTasks?: string[];
  localContent?: string; // deterministic analysis kept alongside model prose
  mode?: "local" | "ai" | "denied";
}

const now = () => new Date().toISOString();

const toMessage = (a: CommandAnswer, extra: Partial<CmdMessage> = {}): CmdMessage => ({
  role: "assistant",
  content: a.content,
  at: now(),
  agent: a.agent,
  items: a.items,
  insights: a.insights,
  steps: a.steps,
  actions: a.actions,
  todos: a.todos,
  clarify: a.clarify,
  clientId: a.clientId,
  ...extra,
});

function currentMe() {
  const s = useCRM.getState();
  return s.team.find((t) => t.id === s.currentUserId) ?? s.team[0]!;
}

// Adds engine-generated recommendations (store de-duplicates) and returns the ids
// that now represent them, so the message can link to live recommendation cards.
function persistRecommendations(recs: Recommendation[]): string[] {
  if (!recs.length) return [];
  useCRM.getState().addRecommendations(recs);
  const all = useCRM.getState().recommendations;
  const key = (r: Recommendation) => `${r.agent}|${r.adId ?? r.campaignId ?? r.clientId}|${r.category}`;
  return recs
    .map((r) => all.find((x) => x.id === r.id)?.id ?? all.find((x) => x.status === "New" && key(x) === key(r))?.id)
    .filter((x): x is string => !!x);
}

// Runs one Command Center request: RBAC check → local engine → (optional) model →
// credits metered + AI task logged via runAgentJob.
export async function runCommand(q: string, opts: CommandOpts = {}): Promise<CmdMessage> {
  const me = currentMe();
  if (!can(me.role, "command")) {
    return { role: "assistant", content: "The AI Command Center isn't available for your role.", at: now(), mode: "denied", steps: ["Checked your permissions"] };
  }
  const s = useCRM.getState();
  const local = answerCommand(q, s, me, opts);
  if (local.clarify) return toMessage(local, { mode: "local" }); // no credits for a clarifying question
  let usedModel = false;
  const out = await runAgentJob<CommandAnswer>({
    agent: local.agent,
    title: q.length > 80 ? `${q.slice(0, 77)}…` : q,
    input: q,
    clientId: local.clientId,
    minDelayMs: 450,
    local: async () => {
      if (!useCRM.getState().aiEnabled) return local;
      const llm = await callAgent(local.agent, q, buildCommandSnapshot(useCRM.getState(), me, local), { format: "insights", clientId: local.clientId });
      if (!llm?.summary) return local;
      usedModel = true;
      const modelInsights: InsightItem[] = (llm.insights ?? []).map((i) => (i.kind === "data" && !i.source ? { ...i, source: "AI model · authorized snapshot" } : i));
      return {
        ...local,
        content: llm.summary,
        insights: [...local.insights.filter((i) => i.kind !== "recommendation"), ...modelInsights, ...local.insights.filter((i) => i.kind === "recommendation"), ...(llm.nextSteps ?? []).map((t) => ({ text: t, kind: "recommendation" as const }))],
        steps: [...local.steps, "Model reasoned over the authorized, RBAC-filtered snapshot"],
      };
    },
  });
  if (!out) {
    return { role: "assistant", content: "Your plan's AI credit limit has been reached. Upgrade in **Settings → Plan & usage** to keep using the Command Center.", at: now(), mode: "denied", agent: local.agent, steps: ["Checked AI credit balance"] };
  }
  const recIds = persistRecommendations(out.newRecommendations ?? []);
  return toMessage(out, { recommendationIds: recIds.length ? recIds : undefined, mode: usedModel ? "ai" : "local", localContent: usedModel ? local.content : undefined });
}

// Turns a recommendation into a task, respecting the "Task creation" approval mode:
// Manual → the human's click creates it · Approval Required → task parked until approved ·
// Automatic → AI creates it and logs the action.
export function createTaskFromTodo(todo: CommandTodo, agent?: AgentId): "Manual" | "Approval Required" | "Automatic" | "denied" {
  const s = useCRM.getState();
  const me = currentMe();
  if (!can(me.role, "tasks", "write")) return "denied";
  const mode = s.modeFor("Task creation");
  const client = todo.clientId ? s.clients.find((c) => c.id === todo.clientId) : undefined;
  const lead = todo.leadId ? s.leads.find((l) => l.id === todo.leadId) : undefined;
  const related = todo.campaignId ? { type: "campaign" as const, id: todo.campaignId } : todo.leadId ? { type: "lead" as const, id: todo.leadId } : todo.clientId ? { type: "client" as const, id: todo.clientId } : undefined;
  const base = {
    description: `Created from the AI Command Center${agent ? ` (${agent} agent)` : ""}.\n\n${todo.text}`,
    assigneeId: lead?.ownerId ?? client?.accountManagerId ?? me.id,
    priority: todo.priority ?? "Medium",
    dueDate: new Date(Date.now() + 2 * DAY).toISOString(),
    related,
  } as const;
  if (mode === "Approval Required") {
    s.addTask({ ...base, title: `[Awaiting approval] ${todo.text}`, status: "Blocked", createdBy: "ai" });
    const task = useCRM.getState().tasks[0]!;
    s.requestApproval({ kind: "Task creation", title: `Create task: ${todo.text}`, detail: "Suggested by the AI Command Center. Approving moves the task to Todo.", ref: { type: "task", id: task.id }, agent, apply: { collection: "tasks", id: task.id, patch: { status: "Todo", title: todo.text } } });
    return mode;
  }
  s.addTask({ ...base, title: todo.text, status: "Todo", createdBy: mode === "Automatic" ? "ai" : "human" });
  const task = useCRM.getState().tasks[0]!;
  s.log(mode === "Automatic" ? { actor: "ai", agent, entity: "task", entityId: task.id, action: "Created task from Command Center", detail: todo.text } : { actor: "human", actorId: me.id, entity: "task", entityId: task.id, action: "Created task from AI recommendation", detail: todo.text });
  return mode;
}

export function newThread(ownerId: string, agent?: AgentId): CommandThread {
  return { id: uid("th"), title: "New thread", agent, messages: [], createdAt: now(), ownerId };
}
export const userMessage = (content: string): CmdMessage => ({ role: "user", content, at: now() });
export const threadTitle = (q: string) => (q.length > 60 ? `${q.slice(0, 57)}…` : q);
