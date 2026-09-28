"use client";

import { useState } from "react";
import { Check, Hash, PlugZap, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, Undo2, WandSparkles } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { SocialPlatform, SocialPost } from "@/lib/types";
import { generateCaption, hashtagsFor, hookOptions, pillarsFor } from "@/lib/ai/social";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import { cn, compact, fmtDateTime } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, Drawer, Field, Input, InsightLegend, InsightList, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { AGENTS } from "@/lib/ai/agents";
import { PLATFORMS, PlatformChip, STAGE_TONE, approvePost, platformStatus, publishNow, rejectPost, runReview, socialCtx, submitForApproval } from "./shared";

const FORMATS: SocialPost["format"][] = ["Reel", "Carousel", "Static", "Story", "Text", "Short"];
const FLOW = ["Strategy", "Idea", "Draft", "AI Review", "Approval", "Schedule", "Publish", "Analyze"] as const;
const FLOW_INDEX: Record<SocialPost["stage"], number> = { Idea: 1, Draft: 2, "AI Review": 3, "Awaiting Approval": 4, Scheduled: 5, Published: 7 };

const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Form = Pick<SocialPost, "title" | "platform" | "format" | "pillar" | "hook" | "caption" | "hashtags" | "scheduledAt" | "ownerId" | "clientId">;

export function PostDrawer({ initial, onClose, writable }: { initial: SocialPost; onClose: () => void; writable: boolean }) {
  const live = useCRM((s) => s.socialPosts.find((p) => p.id === initial.id));
  const post = live ?? initial;
  const team = useCRM((s) => s.team);
  const clients = useCRM((s) => s.clients);
  const integrations = useCRM((s) => s.integrations);
  const mode = useCRM((s) => s.settings.approvalModes["Social publishing"]);
  const [f, setF] = useState<Form>(() => ({ title: post.title, platform: post.platform, format: post.format, pillar: post.pillar, hook: post.hook, caption: post.caption, hashtags: post.hashtags, scheduledAt: post.scheduledAt, ownerId: post.ownerId, clientId: post.clientId }));
  const [hooks, setHooks] = useState<string[]>([]);
  const [salt, setSalt] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const ctx = socialCtx(f.clientId);
  const pillars = ctx ? pillarsFor(ctx).pillars : [];
  const client = clients.find((c) => c.id === f.clientId);
  const locked = post.stage === "Published";
  const canEdit = writable && !locked;
  const merged: SocialPost = { ...post, ...f };

  const save = (extra: Partial<SocialPost> = {}, quiet = false) => {
    const next: SocialPost = { ...merged, ...extra, title: f.title.trim() || `${f.format} · ${f.pillar}` };
    const s = useCRM.getState();
    s.upsert("socialPosts", next);
    if (!live) s.log({ actor: "human", actorId: s.currentUserId, entity: "social", entityId: next.id, action: "Created post", detail: next.title });
    if (!quiet) toast("Post saved");
    return next;
  };

  const aiJob = async <T,>(label: string, local: () => T | Promise<T>) => {
    setBusy(label);
    const out = await runAgentJob({ agent: "social", title: `${label} · ${client?.company ?? ""}`, clientId: f.clientId, local, minDelayMs: 450 });
    setBusy(null);
    return out;
  };

  const regenCaption = async () => {
    if (!ctx) return;
    const out = await aiJob("Regenerate caption", async () => {
      const llm = await callAgent("social", `Write a ${f.platform} ${f.format} caption. Start with the hook, keep brand voice, end with one CTA. Return only the caption.`, { hook: f.hook, pillar: f.pillar, platform: f.platform, format: f.format }, { clientId: f.clientId });
      return llm?.text?.trim() || generateCaption({ ...merged, id: `${post.id}${salt}` }, ctx, salt);
    });
    if (out) { setF((x) => ({ ...x, caption: out })); setSalt((n) => n + 1); }
  };
  const genHooks = async () => {
    if (!ctx) return;
    const out = await aiJob("5 hook options", () => hookOptions({ id: post.id, pillar: f.pillar, format: f.format }, ctx, 5, salt));
    if (out) { setHooks(out); setSalt((n) => n + 1); }
  };
  const genTags = async () => {
    if (!ctx) return;
    const out = await aiJob("Hashtags", () => hashtagsFor({ id: post.id, pillar: f.pillar, platform: f.platform }, ctx, salt));
    if (out) { setF((x) => ({ ...x, hashtags: out })); setSalt((n) => n + 1); }
  };
  const review = async () => {
    const saved = save({}, true);
    setBusy("AI review");
    const r = await runReview(saved);
    setBusy(null);
    if (r) toast(`AI review: ${r.score}/100`, r.score >= 80 ? "Ready for approval" : "See recommendations", "ai");
  };
  const submit = () => {
    if (!f.scheduledAt) return toast("Pick a schedule date first", undefined, "warning");
    const saved = save({}, true);
    const res = submitForApproval(saved);
    toast(res === "requested" ? "Sent for approval" : res === "task" ? "Approval task created" : "Scheduled", res === "requested" ? "Approve in Automations → Approvals (or here)." : res === "task" ? "Manual mode: a human approves & schedules." : "Automatic mode", "success");
  };

  const status = platformStatus(f.platform, integrations);
  const flowAt = FLOW_INDEX[post.stage];

  return (
    <Drawer
      open
      onClose={onClose}
      width={640}
      title={f.title || "New post"}
      subtitle={<span className="flex flex-wrap items-center gap-1.5"><PlatformChip platform={f.platform} /> {client?.company} · <Badge tone={STAGE_TONE[post.stage]} dot>{post.stage}</Badge> <AgentChip name={AGENTS.social.name} color={AGENTS.social.color} /></span>}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {writable && !locked && live && (
            <Button variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { useCRM.getState().remove("socialPosts", post.id); toast("Post deleted"); onClose(); }}>Delete</Button>
          )}
          <span className="flex-1" />
          <Button onClick={onClose}>Close</Button>
          {canEdit && <Button variant="primary" onClick={() => save()}>Save</Button>}
        </div>
      }
    >
      {/* Workflow */}
      <ol className="mb-4 flex flex-wrap items-center gap-1 text-[11px]">
        {FLOW.map((s, i) => (
          <li key={s} className={cn("rounded-full px-2 py-0.5 border", i < flowAt ? "border-success/30 bg-success-soft text-success" : i === flowAt ? "border-accent bg-accent-soft text-accent-text font-medium" : "border-border text-fg-3")}>
            {i < flowAt && <Check className="inline size-3 mr-0.5" />}{s}
          </li>
        ))}
      </ol>

      <fieldset disabled={!canEdit} className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Platform" className="col-span-1">
            <Select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value as SocialPlatform })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select>
          </Field>
          <Field label="Format">
            <Select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as SocialPost["format"] })}>{FORMATS.map((p) => <option key={p}>{p}</option>)}</Select>
          </Field>
          <Field label="Pillar">
            <Select value={f.pillar} onChange={(e) => setF({ ...f, pillar: e.target.value })}>{[...new Set([f.pillar, ...pillars])].map((p) => <option key={p}>{p}</option>)}</Select>
          </Field>
          <Field label="Owner">
            <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          </Field>
        </div>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-fg-2">Hook <span className="text-fg-3 font-normal">· {f.hook.trim().split(/\s+/).filter(Boolean).length} words</span></span>
            {canEdit && <Button size="xs" variant="ghost" loading={busy === "5 hook options"} icon={<WandSparkles className="size-3" />} onClick={genHooks}>5 hook options</Button>}
          </div>
          <Input value={f.hook} onChange={(e) => setF({ ...f, hook: e.target.value })} placeholder="First line / first 2 seconds" />
          {hooks.length > 0 && canEdit && (
            <div className="mt-1.5 space-y-1">
              {hooks.map((h) => (
                <button type="button" key={h} onClick={() => { setF({ ...f, hook: h }); setHooks([]); }} className="block w-full rounded-md border border-border px-2 py-1 text-left text-xs hover:border-accent hover:bg-accent-soft/40">{h}</button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-fg-2">Caption <span className="text-fg-3 font-normal">· {f.caption.length} chars</span></span>
            {canEdit && <Button size="xs" variant="ghost" loading={busy === "Regenerate caption"} icon={<RefreshCw className="size-3" />} onClick={regenCaption}>Regenerate caption</Button>}
          </div>
          <Textarea rows={8} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-fg-2">Hashtags <span className="text-fg-3 font-normal">· {f.hashtags.length}</span></span>
            {canEdit && <Button size="xs" variant="ghost" loading={busy === "Hashtags"} icon={<Hash className="size-3" />} onClick={genTags}>Hashtags</Button>}
          </div>
          <Input value={f.hashtags.join(" ")} onChange={(e) => setF({ ...f, hashtags: e.target.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)) })} placeholder="#brand #topic" />
        </div>

        <Field label="Schedule (local time)">
          <Input type="datetime-local" value={toLocalInput(f.scheduledAt)} onChange={(e) => setF({ ...f, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
        </Field>
      </fieldset>

      {/* AI review */}
      <Card className="mt-4">
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="text-[13px] font-semibold flex items-center gap-1.5"><Sparkles className="size-3.5 text-accent-text" /> AI review</p>
          <div className="flex items-center gap-2">
            {post.aiReview && <span className={cn("text-lg font-semibold tabular-nums", post.aiReview.score >= 80 ? "text-success" : post.aiReview.score >= 60 ? "text-warning" : "text-danger")}>{post.aiReview.score}<span className="text-xs text-fg-3">/100</span></span>}
            {canEdit && <Button size="xs" variant="ai" loading={busy === "AI review"} onClick={review}>{post.aiReview ? "Re-run" : "Run AI review"}</Button>}
          </div>
        </div>
        <div className="p-3">
          {post.aiReview ? <><InsightList items={post.aiReview.notes} compact /><div className="mt-2"><InsightLegend /></div></> : <p className="text-xs text-fg-3">Checks hook length, caption length, hashtag count, CTA, format fit, brand tone and posting time.</p>}
        </div>
      </Card>

      {/* Approval & publishing */}
      <Card className="mt-3 p-3 space-y-2">
        <p className="text-[13px] font-semibold flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Approval & publishing <Badge>{mode}</Badge></p>
        {post.stage === "Published" ? (
          <p className="text-xs text-fg-2">Published {fmtDateTime(post.publishedAt)}. {post.metrics ? "" : "Metrics appear once platform insights sync."}</p>
        ) : post.stage === "Awaiting Approval" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-2 flex-1 min-w-48">Waiting for human approval{mode === "Approval Required" ? " — also listed in Automations → Approvals." : "."}</p>
            {writable && <><Button size="xs" icon={<Undo2 className="size-3" />} onClick={() => { rejectPost(post); toast("Sent back to draft"); }}>Send back</Button><Button size="xs" variant="primary" icon={<Check className="size-3" />} onClick={() => { approvePost(post); toast("Approved & scheduled"); }}>Approve & schedule</Button></>}
          </div>
        ) : post.stage === "Scheduled" ? (
          <div className="space-y-2">
            <p className="text-xs text-fg-2">Approved · scheduled for {fmtDateTime(post.scheduledAt)}.</p>
            {status === "connected" ? (
              writable && <Button size="xs" variant="primary" icon={<Send className="size-3" />} onClick={() => { publishNow(post); toast(`Published to ${post.platform}`, "Simulated — live publishing runs through the platform API.", "success"); }}>Publish now</Button>
            ) : status === "error" ? (
              <Button size="xs" href="/integrations" icon={<PlugZap className="size-3" />}>Reconnect {post.platform} in Integrations</Button>
            ) : status === "available" ? (
              <Button size="xs" href="/integrations" icon={<PlugZap className="size-3" />}>Connect {post.platform} in Integrations to publish</Button>
            ) : (
              <p className="text-xs text-warning">No {post.platform} integration — publish manually and mark as published.</p>
            )}
            <p className="text-[11px] text-fg-3">Publishing here is simulated in this workspace: it marks the post Published and logs it. Real publishing goes through the {post.platform} API once the integration is connected.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-2 flex-1 min-w-48">{mode === "Automatic" ? "Automatic mode — submitting schedules the post immediately." : mode === "Manual" ? "Manual mode — submitting creates an approval task for the account manager." : "Submitting creates an approval request; approval schedules the post."}</p>
            {canEdit && <Button size="xs" variant="primary" icon={<Send className="size-3" />} onClick={submit}>Submit for approval</Button>}
          </div>
        )}
      </Card>

      {post.metrics && (
        <Card className="mt-3 p-3">
          <p className="text-[13px] font-semibold mb-2">Performance</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
            {([["Reach", post.metrics.reach], ["Impr.", post.metrics.impressions], ["Likes", post.metrics.likes], ["Comments", post.metrics.comments], ["Shares", post.metrics.shares], ["Saves", post.metrics.saves]] as const).map(([l, v]) => (
              <div key={l}><p className="text-fg-3">{l}</p><p className="font-semibold tabular-nums">{compact(v)}</p></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-2">Engagement rate <span className="font-semibold">{post.metrics.er}%</span></p>
        </Card>
      )}
    </Drawer>
  );
}
