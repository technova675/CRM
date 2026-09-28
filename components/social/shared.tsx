"use client";

import { useCRM } from "@/lib/store";
import type { SocialPlatform, SocialPost, SocialStage } from "@/lib/types";
import { reviewPost, type SocialCtx } from "@/lib/ai/social";
import { runAgentJob, callAgent } from "@/lib/ai/client";
import { cn, uid } from "@/lib/utils";
import type { Tone } from "@/components/ui";

export const PLATFORMS: SocialPlatform[] = ["Instagram", "Facebook", "LinkedIn", "YouTube", "X"];
export const PLATFORM_META: Record<SocialPlatform, { short: string; color: string; integration?: string }> = {
  Instagram: { short: "IG", color: "#e1306c", integration: "instagram" },
  Facebook: { short: "FB", color: "#1877f2", integration: "facebook_pages" },
  LinkedIn: { short: "IN", color: "#0a66c2", integration: "linkedin" },
  YouTube: { short: "YT", color: "#ff0000", integration: "youtube" },
  X: { short: "X", color: "#71717a" },
};
export const STAGE_TONE: Record<SocialStage, Tone> = {
  Idea: "neutral",
  Draft: "neutral",
  "AI Review": "accent",
  "Awaiting Approval": "warning",
  Scheduled: "info",
  Published: "success",
};

export function PlatformChip({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const m = PLATFORM_META[platform];
  return (
    <span className={cn("inline-flex h-4 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold text-white", className)} style={{ background: m.color }} title={platform}>
      {m.short}
    </span>
  );
}

// Returns the integration status for a platform: connected | error | available | missing.
export function platformStatus(platform: SocialPlatform, integrations: { key: string; status: string }[]) {
  const key = PLATFORM_META[platform].integration;
  const i = key ? integrations.find((x) => x.key === key) : undefined;
  return (i?.status ?? "missing") as "connected" | "error" | "available" | "missing";
}

export function socialCtx(clientId: string): SocialCtx | null {
  const s = useCRM.getState();
  const client = s.clients.find((c) => c.id === clientId);
  if (!client) return null;
  return { client, knowledge: s.knowledge.find((k) => k.clientId === clientId), strategies: s.strategies };
}

// ---------- Domain actions (built on the generic store helpers) ----------
export async function runReview(post: SocialPost) {
  const ctx = socialCtx(post.clientId);
  if (!ctx) return null;
  const result = await runAgentJob({
    agent: "social",
    title: `AI review · ${post.title}`,
    clientId: post.clientId,
    local: async () => {
      const r = reviewPost(post, ctx);
      const llm = await callAgent("social", "Review this social post draft for hook strength, clarity, brand voice fit and CTA. Return insights.", { post: { platform: post.platform, format: post.format, hook: post.hook, caption: post.caption, hashtags: post.hashtags } }, { format: "insights", clientId: post.clientId });
      if (llm?.insights?.length) r.notes.push(...llm.insights.slice(0, 4).map((x) => ({ ...x, source: x.source ?? "Social Agent (LLM)" })));
      return r;
    },
  });
  if (!result) return null;
  const s = useCRM.getState();
  const stage: SocialStage = post.stage === "Idea" || post.stage === "Draft" ? "AI Review" : post.stage;
  s.patch("socialPosts", post.id, { aiReview: result, stage });
  s.log({ actor: "ai", agent: "social", entity: "social", entityId: post.id, action: "AI reviewed post", detail: `${post.title} · score ${result.score}` });
  return result;
}

export function submitForApproval(post: SocialPost): "requested" | "task" | "scheduled" {
  const s = useCRM.getState();
  const mode = s.modeFor("Social publishing");
  const client = s.clients.find((c) => c.id === post.clientId);
  const when = post.scheduledAt ? new Date(post.scheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "unscheduled";
  if (mode === "Automatic") {
    s.patch("socialPosts", post.id, { stage: "Scheduled" });
    s.log({ actor: "ai", agent: "social", entity: "social", entityId: post.id, action: "Scheduled post (automatic mode)", detail: `${client?.company} · ${post.platform} · ${when}` });
    return "scheduled";
  }
  s.patch("socialPosts", post.id, { stage: "Awaiting Approval" }, { entity: "social", action: "Submitted post for approval", field: "stage" });
  if (mode === "Approval Required") {
    s.requestApproval({
      kind: "Social publishing",
      title: `Approve ${post.platform} ${post.format.toLowerCase()} — ${client?.company ?? ""}`,
      detail: `${post.hook} · scheduled ${when}${post.aiReview ? ` · AI review ${post.aiReview.score}/100` : ""}`,
      ref: { type: "social", id: post.id },
      agent: "social",
      apply: { collection: "socialPosts", id: post.id, patch: { stage: "Scheduled" } },
    });
    return "requested";
  }
  // Manual: AI recommends, a human executes.
  s.addTask({
    title: `Review & approve post: ${post.title}`,
    description: `${client?.company} · ${post.platform} · ${when}\n\nHook: ${post.hook}`,
    assigneeId: client?.accountManagerId ?? post.ownerId,
    priority: "Medium",
    dueDate: post.scheduledAt ?? new Date(Date.now() + 2 * 86_400_000).toISOString(),
    status: "Todo",
    related: { type: "social", id: post.id },
    createdBy: "ai",
  });
  return "task";
}

// Approving from the post itself resolves the linked approval request (if any) so both stay in sync.
export function approvePost(post: SocialPost) {
  const s = useCRM.getState();
  const ap = s.approvals.find((a) => a.status === "pending" && a.ref?.type === "social" && a.ref.id === post.id);
  if (ap) s.resolveApproval(ap.id, true);
  else s.patch("socialPosts", post.id, { stage: "Scheduled" }, { entity: "social", action: "Approved post", field: "stage" });
}
export function rejectPost(post: SocialPost) {
  const s = useCRM.getState();
  const ap = s.approvals.find((a) => a.status === "pending" && a.ref?.type === "social" && a.ref.id === post.id);
  if (ap) s.resolveApproval(ap.id, false);
  s.patch("socialPosts", post.id, { stage: "Draft" }, { entity: "social", action: "Sent post back to draft", field: "stage" });
}

// Simulated publish — the real call goes through the platform API once the integration is connected.
export function publishNow(post: SocialPost) {
  const s = useCRM.getState();
  const now = new Date().toISOString();
  s.patch("socialPosts", post.id, { stage: "Published", publishedAt: now, scheduledAt: post.scheduledAt ?? now });
  s.log({ actor: "human", actorId: s.currentUserId, entity: "social", entityId: post.id, action: `Published to ${post.platform} (simulated)`, detail: `${post.title} — real publishing runs through the ${post.platform} API once connected`, before: post.stage, after: "Published" });
}

export function reschedule(post: SocialPost, day: Date) {
  const s = useCRM.getState();
  const prev = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const next = new Date(day);
  next.setHours(prev?.getHours() ?? 12, prev?.getMinutes() ?? 0, 0, 0);
  s.patch("socialPosts", post.id, { scheduledAt: next.toISOString() }, { entity: "social", action: "Rescheduled post", field: "scheduledAt" });
}

export function newPost(clientId: string, ownerId: string, partial: Partial<SocialPost> = {}): SocialPost {
  return {
    id: uid("sp"),
    clientId,
    platform: "Instagram",
    format: "Reel",
    stage: "Idea",
    pillar: "General",
    title: "New post",
    hook: "",
    caption: "",
    hashtags: [],
    ownerId,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}
