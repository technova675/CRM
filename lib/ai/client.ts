"use client";

import type { AgentId, InsightItem } from "../types";
import { useCRM } from "../store";

export interface AgentInsights {
  summary: string;
  insights: InsightItem[];
  nextSteps: string[];
}

// Calls a specialised agent through /api/ai/agent when an AI provider is configured.
// Returns null in local mode or on failure so callers fall back to their local engine.
export async function callAgent(agent: AgentId, task: string, context: unknown, opts: { format?: "text" | "insights"; clientId?: string } = {}) {
  const s = useCRM.getState();
  if (!s.aiEnabled) return null;
  const knowledge = opts.clientId ? s.knowledge.find((k) => k.clientId === opts.clientId) : undefined;
  try {
    const res = await fetch("/api/ai/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent, task, context, format: opts.format ?? "text", knowledge }) });
    if (!res.ok) return null;
    return (await res.json()) as { text?: string } & Partial<AgentInsights>;
  } catch {
    return null;
  }
}

// Wraps any agent job: meters AI credits, records an AI task (visible in the Command Center
// and the audit log), runs the local engine or the model, and returns the result.
export async function runAgentJob<T>(opts: { agent: AgentId; title: string; input?: string; clientId?: string; local: () => T | Promise<T>; minDelayMs?: number }): Promise<T | null> {
  const s = useCRM.getState();
  const taskId = s.startAITask({ agent: opts.agent, title: opts.title, input: opts.input ?? opts.title, clientId: opts.clientId, ref: opts.clientId ? { type: "client", id: opts.clientId } : undefined });
  if (!taskId) return null; // plan limit reached (notification already shown)
  const started = Date.now();
  const out = await opts.local();
  const wait = (opts.minDelayMs ?? 700) - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait)); // local engine: make the job feel like a job
  useCRM.getState().finishAITask(taskId, typeof out === "string" ? out : opts.title);
  return out;
}
