"use client";

// Strategy workflow actions built on the generic store helpers (no store changes needed).
import { useCRM } from "@/lib/store";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { campaignDraftsFromStrategy, generateStrategy, performanceSnapshot } from "@/lib/ai/strategy";
import type { StrategyDoc, StrategyInputs } from "@/lib/types";
import { DAY, uid } from "@/lib/utils";

const now = () => new Date().toISOString();

export async function generateStrategyDoc(o: { inputs: StrategyInputs; clientId?: string; existing?: StrategyDoc }): Promise<StrategyDoc | null> {
  const s = useCRM.getState();
  const client = s.clients.find((c) => c.id === o.clientId);
  const campaigns = s.campaigns.filter((c) => c.clientId === o.clientId);
  const knowledge = s.knowledge.find((k) => k.clientId === o.clientId);
  const name = client?.company ?? (o.inputs.business.split(" — ")[0] || "Prospect");
  const doc = await runAgentJob({
    agent: "strategy",
    title: `${o.existing ? `Regenerated strategy v${o.existing.version + 1}` : "Generated marketing strategy"} — ${name}`,
    input: `Budget ₹${o.inputs.monthlyBudget.toLocaleString("en-IN")}/mo · ${o.inputs.geography} · ${o.inputs.goals}`,
    clientId: o.clientId,
    minDelayMs: 1100,
    local: async () => {
      const d = generateStrategy({
        inputs: o.inputs,
        industry: client?.industry,
        company: name,
        clientId: o.clientId,
        leadId: o.existing?.leadId,
        campaigns,
        knowledge,
        ownerId: o.existing?.ownerId ?? s.currentUserId,
        id: o.existing?.id ?? uid("str"),
        version: o.existing ? o.existing.version + 1 : 1,
      });
      // LLM mode: commentary only (summary + extra tagged insights); structure stays from the local engine.
      const llm = await callAgent(
        "strategy",
        "Write a 2-4 sentence executive summary and up to 5 strategic insights for this marketing strategy. Tag each insight data/assumption/recommendation.",
        { inputs: o.inputs, budget: d.budget, kpis: d.kpis, funnel: d.funnel, performance: performanceSnapshot(campaigns) },
        { format: "insights", clientId: o.clientId },
      );
      if (llm?.summary) d.summary = llm.summary;
      if (llm?.insights?.length) d.sections[0]!.items.push(...llm.insights.slice(0, 5).map((i) => ({ ...i, source: i.source ?? "AI provider" })));
      return d;
    },
  });
  if (!doc) return null;
  if (o.existing) {
    doc.createdAt = o.existing.createdAt;
    doc.title = o.existing.title;
  }
  s.upsert("strategies", doc);
  s.log({ actor: "ai", agent: "strategy", entity: "strategy", entityId: doc.id, action: o.existing ? `Regenerated strategy (v${doc.version})` : "Generated strategy", detail: doc.title });
  const mode = s.modeFor("Strategy documents");
  if (mode === "Manual") {
    s.addTask({ title: `Review AI strategy — ${name}`, description: "The Strategy Agent drafted a strategy. Review, edit and submit for approval.", assigneeId: s.team.find((t) => t.role === "creative_strategist")?.id ?? s.currentUserId, priority: "Medium", dueDate: new Date(Date.now() + 2 * DAY).toISOString(), status: "Todo", related: { type: "strategy", id: doc.id }, createdBy: "ai" });
  } else if (mode === "Automatic") {
    s.patch("strategies", doc.id, { status: "In Review" });
    s.log({ actor: "ai", agent: "strategy", entity: "strategy", entityId: doc.id, action: "Submitted strategy for review", detail: doc.title });
  }
  return useCRM.getState().strategies.find((x) => x.id === doc.id) ?? doc;
}

// Applies an edit; editing an approved doc resets it to Draft (approval must be re-granted).
export function updateStrategy(doc: StrategyDoc, patch: Partial<StrategyDoc>): boolean {
  const s = useCRM.getState();
  const reset = doc.status === "Approved";
  s.patch("strategies", doc.id, { ...patch, updatedAt: now(), ...(reset ? { status: "Draft", approvedAt: undefined, approvedBy: undefined } : {}) });
  if (reset) s.log({ actor: "human", actorId: s.currentUserId, entity: "strategy", entityId: doc.id, action: "Edited approved strategy — approval reset", detail: doc.title, before: "Approved", after: "Draft" });
  return reset;
}

export function submitForReview(doc: StrategyDoc): "approval" | "review" {
  const s = useCRM.getState();
  s.patch("strategies", doc.id, { status: "In Review", updatedAt: now() }, { entity: "strategy", action: "Submitted strategy for review" });
  if (s.modeFor("Strategy documents") === "Approval Required") {
    s.requestApproval({
      kind: "Strategy documents",
      title: `Approve strategy: ${doc.title} (v${doc.version})`,
      detail: doc.summary,
      ref: { type: "strategy", id: doc.id },
      agent: "strategy",
      apply: { collection: "strategies", id: doc.id, patch: { status: "Approved", approvedAt: now() } },
    });
    return "approval";
  }
  s.notify({ title: "Strategy ready for review", body: doc.title, href: `/strategy?id=${doc.id}`, kind: "info" });
  return "review";
}

export function approveStrategy(doc: StrategyDoc) {
  const s = useCRM.getState();
  // Close any pending approval for this doc so the queue stays clean.
  s.approvals.filter((a) => a.status === "pending" && a.ref?.type === "strategy" && a.ref.id === doc.id).forEach((a) => s.resolveApproval(a.id, true));
  s.patch("strategies", doc.id, { status: "Approved", approvedAt: now(), approvedBy: s.currentUserId, updatedAt: now() }, { entity: "strategy", action: "Approved strategy" });
}

export function backToDraft(doc: StrategyDoc) {
  const s = useCRM.getState();
  s.approvals.filter((a) => a.status === "pending" && a.ref?.type === "strategy" && a.ref.id === doc.id).forEach((a) => s.resolveApproval(a.id, false));
  s.patch("strategies", doc.id, { status: "Draft", approvedAt: undefined, approvedBy: undefined, updatedAt: now() }, { entity: "strategy", action: "Moved strategy back to draft" });
}

export function createCampaignsFromStrategy(doc: StrategyDoc): { created: number; skipped: number } {
  const s = useCRM.getState();
  const client = s.clients.find((c) => c.id === doc.clientId);
  if (!client) return { created: 0, skipped: 0 };
  let created = 0;
  let skipped = 0;
  campaignDraftsFromStrategy(doc).forEach((d) => {
    const name = `${client.company} · ${d.channel} (Strategy v${doc.version})`;
    if (s.campaigns.some((c) => c.name === name)) {
      skipped++;
      return;
    }
    useCRM.getState().addCampaign({
      name,
      clientId: client.id,
      service: d.service,
      platform: d.platform,
      objective: d.objective,
      budget: d.budget,
      startDate: now(),
      endDate: new Date(Date.now() + 90 * DAY).toISOString(),
      teamIds: [],
      status: "Planning",
      audience: d.audience,
      campaignType: d.campaignType,
      ownerId: s.currentUserId,
      kpis: doc.kpis.filter((k) => k.stage === "Conversion").slice(0, 1).map((k) => ({ label: k.metric, target: Number(k.target.replace(/[^\d.]/g, "")) || 0, actual: 0 })),
    });
    created++;
  });
  if (created) s.log({ actor: "human", actorId: s.currentUserId, entity: "strategy", entityId: doc.id, action: "Created campaigns from strategy", detail: `${created} Planning campaign(s) · ${client.company}` });
  return { created, skipped };
}
