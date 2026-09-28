"use client";

import type { InsightItem, VideoProject, VideoTrack } from "@/lib/types";
import { useCRM } from "@/lib/store";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { analyzeProject, buildTimeline, fmtDuration, makeVersions, reviseTimeline, timelineEnd, type Aspect, type RevisionResult } from "@/lib/ai/video";
import { DAY, uid } from "@/lib/utils";

// Video-module domain actions built on the generic store helpers (no shared-file edits).
const S = () => useCRM.getState();
const now = () => new Date().toISOString();
const get = (id: string) => S().videos.find((v) => v.id === id);
const minutesFor = (p: VideoProject) => Math.max(1, Math.ceil(p.settings.targetDurationSec / 60));

export const draftMinutes = minutesFor;

export async function analyzeVideo(id: string): Promise<boolean> {
  const p = get(id);
  if (!p) return false;
  const prev = p.status;
  S().patch("videos", id, { status: "Analyzing" });
  const res = await runAgentJob({ agent: "video", title: `Analyze footage · ${p.title}`, input: `${p.assets.length} assets · ${p.objective}`, clientId: p.clientId, local: () => analyzeProject(p) });
  if (!res) {
    S().patch("videos", id, { status: prev });
    return false;
  }
  // When a model is configured, let the Video Agent add its own review of the plan (tagged by the model).
  const llm = await callAgent("video", "Review this video edit plan. Tag every point as data (from the metadata given), assumption, or recommendation.", { title: p.title, objective: p.objective, settings: p.settings, assets: p.assets.map((a) => ({ name: a.name, kind: a.kind, durationSec: a.durationSec, text: a.text?.slice(0, 1500) })), analysis: { ...res, notes: undefined } }, { format: "insights", clientId: p.clientId });
  const extra: InsightItem[] = (llm?.insights ?? []).map((i) => ({ ...i, source: i.source ?? "Video Agent (model)" }));
  S().patch("videos", id, { analysis: { ...res, notes: [...res.notes, ...extra] }, status: prev === "Analyzing" ? "Uploading" : prev, updatedAt: now() });
  return true;
}

export async function generateDraft(id: string): Promise<VideoTrack[] | null> {
  const p = get(id);
  if (!p) return null;
  if (!S().consumeUsage("videoMinutes", minutesFor(p))) return null;
  const prev = p.status;
  S().patch("videos", id, { status: "Analyzing" });
  const res = await runAgentJob({
    agent: "video", title: `Generate draft · ${p.title}`, input: `${p.settings.aspect} · ${p.settings.targetDurationSec}s · ${p.settings.pace}`, clientId: p.clientId, minDelayMs: 1200,
    local: () => {
      const analysis = analyzeProject(p);
      return { analysis, tracks: buildTimeline(p, analysis) };
    },
  });
  if (!res) {
    S().patch("videos", id, { status: prev });
    return null;
  }
  const cur = get(id)!;
  const drafts = cur.versions.filter((v) => /draft/i.test(v.label)).length;
  const dur = timelineEnd(res.tracks);
  S().patch("videos", id, {
    analysis: res.analysis,
    tracks: res.tracks,
    status: "Draft Ready",
    updatedAt: now(),
    versions: [...cur.versions, { id: uid("vv"), label: `Draft v${drafts + 1}`, aspect: p.settings.aspect, durationSec: dur, createdAt: now(), note: drafts ? "Regenerated from current assets & settings." : "First AI draft." }],
  });
  S().log({ actor: "ai", agent: "video", entity: "video", entityId: id, action: drafts ? "Regenerated video draft" : "Generated first video draft", detail: `${p.title} · ${fmtDuration(dur)} · ${minutesFor(p)} video min` });
  S().notify({ title: "Video draft ready", body: p.title, href: `/video/${id}`, kind: "ai" });
  return res.tracks;
}

export async function reviseVideo(id: string, tracks: VideoTrack[]): Promise<RevisionResult | null> {
  const p = get(id);
  if (!p) return null;
  const open = p.reviewNotes.filter((n) => !n.resolved);
  if (!open.length) return null;
  if (!S().consumeUsage("videoMinutes", minutesFor(p))) return null;
  const prev = p.status;
  S().patch("videos", id, { status: "Revising" });
  const res = await runAgentJob({ agent: "video", title: `AI revise · ${p.title}`, input: open.map((n) => n.body).join(" | "), clientId: p.clientId, minDelayMs: 1000, local: () => reviseTimeline({ ...p, tracks }, open) });
  if (!res) {
    S().patch("videos", id, { status: prev });
    return null;
  }
  const cur = get(id)!;
  const revs = cur.versions.filter((v) => /revision/i.test(v.label)).length;
  S().patch("videos", id, {
    tracks: res.tracks,
    settings: res.settings,
    status: "In Review",
    updatedAt: now(),
    reviewNotes: cur.reviewNotes.map((n) => (res.applied.includes(n.id) ? { ...n, resolved: true } : n)),
    versions: res.changes.length ? [...cur.versions, { id: uid("vv"), label: `Revision v${cur.versions.length + 1}`, aspect: res.settings.aspect, durationSec: timelineEnd(res.tracks), createdAt: now(), note: res.changes.join("; ") }] : cur.versions,
  });
  S().log({ actor: "ai", agent: "video", entity: "video", entityId: id, action: `AI revision ${revs + 1}`, detail: res.changes.join("; ") || "No notes matched a known edit" });
  return res;
}

export async function createVersions(id: string, aspects: Aspect[], hookAB: boolean) {
  const p = get(id);
  if (!p) return false;
  const res = await runAgentJob({ agent: "video", title: `Create versions · ${p.title}`, input: [...aspects, hookAB ? "Hook A/B" : ""].filter(Boolean).join(", "), clientId: p.clientId, local: () => makeVersions(p, { aspects, hookAB, now: now() }) });
  if (!res) return false;
  const cur = get(id)!;
  S().patch("videos", id, { versions: [...cur.versions, ...res.map((v) => ({ ...v, id: uid("vv") }))], updatedAt: now() });
  S().log({ actor: "ai", agent: "video", entity: "video", entityId: id, action: "Created video versions", detail: res.map((v) => v.label).join(", ") });
  return true;
}

// Final export follows the "Video exports" approval mode.
export function requestExport(id: string): "approval" | "task" | "done" | null {
  const s = S();
  const p = get(id);
  if (!p) return null;
  const versions = p.versions.length ? p.versions : [{ id: uid("vv"), label: "Final", aspect: p.settings.aspect, durationSec: timelineEnd(p.tracks), createdAt: now(), note: "Current timeline." }];
  const exported = versions.map((v) => ({ ...v, exported: true }));
  const mode = s.modeFor("Video exports");
  const detail = `${versions.length} version(s) · ${[...new Set(versions.map((v) => v.aspect))].join(" / ")} · ${fmtDuration(timelineEnd(p.tracks))}. EDL is ready; pixel rendering needs a render backend (not connected).`;
  if (mode === "Approval Required") {
    s.requestApproval({ kind: "Video exports", title: `Export video: ${p.title}`, detail, ref: { type: "video", id }, agent: "video", apply: { collection: "videos", id, patch: { status: "Exported", versions: exported, updatedAt: now() } } });
    s.log({ actor: "human", actorId: s.currentUserId, entity: "video", entityId: id, action: "Requested export approval", detail: p.title });
    return "approval";
  }
  if (mode === "Manual") {
    s.addTask({ title: `Render & export "${p.title}"`, description: `Conform the downloaded EDL in the NLE / render service and deliver: ${versions.map((v) => `${v.label} (${v.aspect})`).join(", ")}. Mark the project Exported when delivered.`, assigneeId: p.ownerId, priority: "High", dueDate: new Date(Date.now() + DAY).toISOString(), status: "Todo", related: { type: "video", id }, createdBy: "ai" });
    s.log({ actor: "ai", agent: "video", entity: "video", entityId: id, action: "Created export task (manual mode)", detail: p.title });
    return "task";
  }
  s.patch("videos", id, { status: "Exported", versions: exported, updatedAt: now() });
  s.log({ actor: "ai", agent: "video", entity: "video", entityId: id, action: "Marked video exported (automatic mode)", detail, before: p.status, after: "Exported" });
  return "done";
}
