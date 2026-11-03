"use client";

// Creative Studio workflow actions on top of the store's creative + generic helpers.
import { useCRM } from "@/lib/store";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";
import {conceptProductionDraft} from "@/lib/domain/creativeStrategy";
import { type CreativeInputs, type FatiguedAd } from "@/lib/ai/creative";
import type { Creative, CreativeConcept, CreativeVersion } from "@/lib/types";
import { DAY, uid } from "@/lib/utils";

const now = () => new Date().toISOString();

// Session-only previews for uploaded files (object URLs are never persisted).
const fileUrls = new Map<string, { url: string; mime: string }>();
export const previewFor = (creativeId: string, v: number) => fileUrls.get(`${creativeId}:${v}`);
export const rememberFile = (creativeId: string, v: number, file: File) => fileUrls.set(`${creativeId}:${v}`, { url: URL.createObjectURL(file), mime: file.type });

export const isAIApproved = (c: Creative) =>
  useCRM.getState().approvals.some((a) => a.kind === "Creative generation" && a.ref?.type === "creative" && a.ref.id === c.id && a.status === "approved");

// "Send to client": AI-generated creatives respect the Creative generation approval mode first.
export function sendToClient(c: Creative): "sent" | "approval" | "pending" {
  const s = useCRM.getState();
  if (c.aiGenerated && s.modeFor("Creative generation") === "Approval Required" && !isAIApproved(c)) {
    const pending = s.approvals.some((a) => a.status === "pending" && a.kind === "Creative generation" && a.ref?.type === "creative" && a.ref.id === c.id);
    if (pending) return "pending";
    s.requestApproval({
      kind: "Creative generation",
      title: `Send AI-generated creative to client: ${c.title}`,
      detail: `${s.clients.find((x) => x.id === c.clientId)?.company ?? ""} · ${c.type} · v${c.versions.length}${c.hook ? ` · hook "${c.hook}"` : ""}`,
      ref: { type: "creative", id: c.id },
      agent: "creative",
      apply: { collection: "creatives", id: c.id, patch: { status: "Client Review" } },
    });
    if (c.status === "Draft") s.setCreativeStatus(c.id, "Internal Review");
    return "approval";
  }
  s.setCreativeStatus(c.id, "Client Review");
  return "sent";
}

export function addComment(c: Creative, body: string, version: number, internal: boolean) {
  const s = useCRM.getState();
  if (version === c.versions.length) s.addCreativeComment(c.id, body, internal || undefined);
  else s.patch("creatives", c.id, { comments: [...c.comments, { id: uid("cc"), authorId: s.currentUserId, body, at: now(), version, internal: internal || undefined }], updatedAt: now() });
}

export function toggleResolved(c: Creative, commentId: string) {
  useCRM.getState().patch("creatives", c.id, { comments: c.comments.map((x) => (x.id === commentId ? { ...x, resolved: !x.resolved } : x)) });
}

export function uploadVersion(c: Creative, v: Omit<CreativeVersion, "v" | "createdAt" | "createdBy">, file?: File) {
  if (file) rememberFile(c.id, c.versions.length + 1, file);
  useCRM.getState().addCreativeVersion(c.id, v);
}

export function createCreative(input: Pick<Creative, "clientId" | "title" | "type" | "platform" | "format"> & Partial<Pick<Creative, "campaignId" | "angle" | "hook">> & { version: Omit<CreativeVersion, "v" | "createdAt" | "createdBy"> }, file?: File): Creative {
  const s = useCRM.getState();
  const id = uid("cr");
  const c: Creative = {
    id,
    clientId: input.clientId,
    campaignId: input.campaignId,
    title: input.title,
    type: input.type,
    platform: input.platform,
    format: input.format,
    status: "Draft",
    angle: input.angle,
    hook: input.hook,
    versions: [{ ...input.version, v: 1, createdAt: now(), createdBy: s.currentUserId }],
    comments: [],
    ownerId: s.currentUserId,
    tags: [input.type.toLowerCase()],
    aiGenerated: false,
    createdAt: now(),
    updatedAt: now(),
  };
  if (file) rememberFile(id, 1, file);
  s.upsert("creatives", c);
  s.log({ actor: "human", actorId: s.currentUserId, entity: "creative", entityId: id, action: "Created creative", detail: c.title });
  return c;
}

export function saveConceptAsCreative(concept:CreativeConcept):Creative{
 const s=useCRM.getState(),latest=s.concepts.find(c=>c.id===concept.id)??concept;
 const existing=s.creatives.find(c=>c.id===latest.savedAsCreativeId||c.fromConceptId===latest.id);if(existing)return existing;
 if(latest.generationSource&&!latest.reviewedAt)throw new Error("Review the concept before saving a production draft.");
 const creative=conceptProductionDraft(latest,s.currentUserId,uid("cr"));s.upsert("creatives",creative);s.patch("concepts",latest.id,{savedAsCreativeId:creative.id});s.log({actor:"human",actorId:s.currentUserId,entity:"creative",entityId:creative.id,action:"Saved reviewed creative strategy as a production draft",detail:creative.title});return creative;
}
export async function generateConceptsJob(o:{inputs:CreativeInputs;clientId:string;count:number}){
 await flushCRMChanges();const response=await fetch("/api/ai/creative-strategy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...o,kinds:["UGC","Static","Video"],count:Math.max(3,o.count),existingCreativeIds:[],operationId:crypto.randomUUID()}),signal:AbortSignal.timeout(110000)});const result=await response.json();if(!response.ok)throw new Error(result.error??"Could not generate creative concepts.");await refreshCRMChanges();return {concepts:useCRM.getState().concepts.filter(c=>result.conceptIds.includes(c.id)),skipped:[] as string[]};
}
export function createRefreshTask(f: FatiguedAd, o: { brief: string; assigneeId: string; dueDays: number }): "created" | "approval" {
  const s = useCRM.getState();
  const mode = s.modeFor("Task creation");
  const client = s.clients.find((c) => c.id === f.clientId);
  const creative = s.creatives.find((c) => c.tags.includes(`ad:${f.adId}`));
  const task = {
    title: `Refresh creative — ${f.name}`,
    description: o.brief,
    assigneeId: o.assigneeId,
    priority: "High" as const,
    dueDate: new Date(Date.now() + o.dueDays * DAY).toISOString(),
    status: (mode === "Approval Required" ? "Blocked" : "Todo") as "Blocked" | "Todo",
    related: { type: "creative" as const, id: creative?.id ?? f.adId },
    createdBy: (mode === "Manual" ? "human" : "ai") as "human" | "ai",
  };
  s.addTask(task);
  // addTask prepends the new task; grab its id so an approval can unblock it.
  const id = useCRM.getState().tasks[0]!.id;
  if (mode === "Approval Required") {
    s.requestApproval({ kind: "Task creation", title: `Create creative refresh brief: ${f.name}`, detail: `${client?.company ?? ""} — frequency ${f.frequency}, CTR −${f.drop.toFixed(0)}% WoW. Task is blocked until approved.`, ref: { type: "task", id }, agent: "creative", apply: { collection: "tasks", id, patch: { status: "Todo" } } });
    return "approval";
  }
  s.log({ actor: mode === "Automatic" ? "ai" : "human", actorId: mode === "Automatic" ? undefined : s.currentUserId, agent: "creative", entity: "task", entityId: id, action: "Created creative refresh brief", detail: `${f.name} · ${client?.company ?? ""}` });
  return "created";
}

