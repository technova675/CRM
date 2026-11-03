"use client";

// Strategy workflow actions built on the generic store helpers (no store changes needed).
import { useCRM } from "@/lib/store";
import {flushCRMChanges} from "@/lib/crmSync";
import {strategyReviewIssues} from "@/lib/domain/strategy";
import {toast} from "@/components/shell/toast";
import { campaignDraftsFromStrategy } from "@/lib/ai/strategy";
import type { StrategyDoc, StrategyInputs } from "@/lib/types";
import { DAY } from "@/lib/utils";

const now = () => new Date().toISOString();

export async function generateStrategyDoc(o: { inputs: StrategyInputs; clientId?: string; existing?: StrategyDoc; mode?: "ai"|"structured" }): Promise<StrategyDoc> {
  await flushCRMChanges();
  const response=await fetch("/api/ai/strategy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({inputs:o.inputs,clientId:o.clientId,existingId:o.existing?.id,mode:o.mode??"ai"}),signal:AbortSignal.timeout(110000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not generate strategy. Your inputs are preserved.");
  const s=useCRM.getState(),latest=s.strategies.find(d=>d.id===o.existing?.id);
  if(o.existing&&latest?.updatedAt!==o.existing.updatedAt)throw new Error("This strategy changed during generation. Reload it before regenerating.");
  const doc=result.doc as StrategyDoc;
  if(o.existing)backToDraft(o.existing);
  useCRM.getState().upsert("strategies",doc);
  useCRM.getState().log({actor:"ai",agent:"strategy",entity:"strategy",entityId:doc.id,action:o.existing?`Regenerated strategy v${doc.version}`:"Generated strategy",detail:doc.generationSource});
  await flushCRMChanges();return doc;
}
// Applies an edit; editing an approved doc resets it to Draft (approval must be re-granted).
export function updateStrategy(doc: StrategyDoc, patch: Partial<StrategyDoc>): boolean {
  const s = useCRM.getState();
  const reset = doc.status !== "Draft";
  if(reset)backToDraft(doc);
  s.patch("strategies", doc.id, { ...patch, updatedAt: now(), ...(reset ? { status: "Draft", approvedAt: undefined, approvedBy: undefined } : {}) });
  if (reset) s.log({ actor: "human", actorId: s.currentUserId, entity: "strategy", entityId: doc.id, action: "Edited approved strategy — approval reset", detail: doc.title, before: "Approved", after: "Draft" });
  return reset;
}

export function submitForReview(doc: StrategyDoc): "approval" | "review" | "invalid" {
  const issues=strategyReviewIssues(doc);if(issues.length){toast("Complete the strategy",issues.join(" "),"warning");return "invalid";}
  const s = useCRM.getState();
  const at=now();s.patch("strategies", doc.id, { status: "In Review", updatedAt: at,reviewHistory:[...(doc.reviewHistory??[]),{status:"In Review" as const,at,actorId:s.currentUserId}].slice(-100) }, { entity: "strategy", action: "Submitted strategy for review" });
  if (s.modeFor("Strategy documents") === "Approval Required") {
    s.requestApproval({
      kind: "Strategy documents",
      title: `Approve strategy: ${doc.title} (v${doc.version})`,
      detail: doc.summary,
      ref: { type: "strategy", id: doc.id },
      agent: "strategy",
      reviewUpdatedAt:at,
    });
    return "approval";
  }
  s.notify({ title: "Strategy ready for review", body: doc.title, href: `/strategy?id=${doc.id}`, kind: "info" });
  return "review";
}

export async function approveStrategy(doc: StrategyDoc) {
  await flushCRMChanges();
  doc=useCRM.getState().strategies.find(d=>d.id===doc.id)??doc;
  const issues=strategyReviewIssues(doc);if(doc.status!=="In Review"||issues.length){toast("Strategy cannot be approved",issues.join(" ")||"Submit it for review first.","warning");return false;}
  const s = useCRM.getState();
  // Close any pending approval for this doc so the queue stays clean.
  s.approvals.filter((a) => a.status === "pending" && a.ref?.type === "strategy" && a.ref.id === doc.id).forEach((a) => s.resolveApproval(a.id, true));
  if(useCRM.getState().strategies.find(d=>d.id===doc.id)?.status!=="Approved"){const at=now();s.patch("strategies", doc.id, { status: "Approved", approvedAt: at, approvedBy: s.currentUserId, updatedAt: at,reviewHistory:[...(doc.reviewHistory??[]),{status:"Approved" as const,at,actorId:s.currentUserId}].slice(-100) }, { entity: "strategy", action: "Approved strategy" });}
  await flushCRMChanges();
  return true;
}

export function backToDraft(doc: StrategyDoc) {
  const s = useCRM.getState();
  s.approvals.filter((a) => a.status === "pending" && a.ref?.type === "strategy" && a.ref.id === doc.id).forEach((a) => s.resolveApproval(a.id, false));
  const at=now();s.patch("strategies", doc.id, { status: "Draft", approvedAt: undefined, approvedBy: undefined, updatedAt: at,reviewHistory:[...(doc.reviewHistory??[]),{status:"Draft" as const,at,actorId:s.currentUserId}].slice(-100) }, { entity: "strategy", action: "Moved strategy back to draft" });
}

export function createCampaignsFromStrategy(doc: StrategyDoc): { created: number; skipped: number } {
  const s = useCRM.getState();
  const client = s.clients.find((c) => c.id === doc.clientId);
  if (!client||doc.status!=="Approved"||strategyReviewIssues(doc).length) return { created: 0, skipped: 0 };
  let created = 0;
  let skipped = 0;
  campaignDraftsFromStrategy(doc).forEach((d) => {
    const name = `${client.company} · ${d.channel} (Strategy v${doc.version})`;
    if (s.campaigns.some((c) => c.clientId===client.id&&c.name === name)) {
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


