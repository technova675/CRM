"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Lightbulb, Plus, Share2, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { SOCIAL_STAGES, type SocialPlatform, type SocialPost, type SocialStage } from "@/lib/types";
import { DAY, cn, fmtDateTime } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, EmptyState, MemberAvatar, PageHeader, Readonly, SearchInput, Select, Table, Tabs, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { AGENTS } from "@/lib/ai/agents";
import { SocialCalendar } from "@/components/social/calendar";
import { SocialBoard } from "@/components/social/board";
import { PostDrawer } from "@/components/social/post-drawer";
import { GeneratorModal } from "@/components/social/generator";
import { SocialAnalyze } from "@/components/social/analyze";
import { SocialListening } from "@/components/social/listening";
import { PLATFORMS, PlatformChip, STAGE_TONE, approvePost, newPost, rejectPost, runReview, submitForApproval } from "@/components/social/shared";

type View = "calendar" | "board" | "list" | "analyze" | "listening";

function SocialInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const posts = useCRM((s) => s.socialPosts);
  const clients = useCRM((s) => s.clients);
  const mode = useCRM((s) => s.settings.approvalModes["Social publishing"]);
  const writable = can(me.role, "social", "write") && me.role !== "client";
  const isClient = me.role === "client";

  const [view, setView] = useState<View>((params.get("view") as View) || "calendar");
  const [clientId, setClientId] = useState(isClient ? me.clientId ?? "" : params.get("client") ?? "All");
  const [platform, setPlatform] = useState<SocialPlatform | "All">("All");
  const [stage, setStage] = useState<SocialStage | "All">("All");
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [open, setOpen] = useState<SocialPost | null>(null);
  const [gen, setGen] = useState<{ tab?: "calendar" | "reels" | "carousels" | "static" } | null>(() => (params.get("generate") === "1" ? { tab: "calendar" } : null));
  const [now] = useState(() => Date.now());

  // Clients this workspace manages socially (services or existing posts). Client-portal users only see their own.
  const clientIds = useMemo(() => {
    const ids = new Set(clients.filter((c) => c.services.includes("Social Media") || c.services.includes("Influencer Marketing")).map((c) => c.id));
    posts.forEach((p) => ids.add(p.clientId));
    const list = [...ids];
    return isClient ? list.filter((id) => id === me.clientId) : list;
  }, [clients, posts, isClient, me.clientId]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";

  const scoped = useMemo(() => posts.filter((p) => clientIds.includes(p.clientId) && (clientId === "All" || p.clientId === clientId)), [posts, clientIds, clientId]);
  const visible = useMemo(
    () =>
      scoped.filter((p) => {
        if (platform !== "All" && p.platform !== platform) return false;
        if (stage !== "All" && p.stage !== stage) return false;
        if (q && !`${p.title} ${p.hook} ${p.caption} ${p.pillar} ${p.hashtags.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [scoped, platform, stage, q],
  );

  const stats = useMemo(() => {
    const week = now + 7 * DAY;
    const pub30 = visible.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() > now - 30 * DAY);
    const withM = pub30.filter((p) => p.metrics);
    return {
      week: visible.filter((p) => p.stage === "Scheduled" && p.scheduledAt && new Date(p.scheduledAt).getTime() >= now && new Date(p.scheduledAt).getTime() <= week).length,
      awaiting: visible.filter((p) => p.stage === "Awaiting Approval").length,
      inWork: visible.filter((p) => ["Idea", "Draft", "AI Review"].includes(p.stage)).length,
      published: pub30.length,
      er: withM.length ? withM.reduce((a, p) => a + p.metrics!.er, 0) / withM.length : 0,
    };
  }, [visible, now]);

  const onMove = async (p: SocialPost, to: SocialStage) => {
    const s = useCRM.getState();
    if (to === "Published") return toast("Publish from the post", "Open the post and use “Publish now” (needs a connected integration).", "warning");
    if (to === "Awaiting Approval") {
      if (!p.scheduledAt) return toast("Pick a schedule date first", undefined, "warning");
      const r = submitForApproval(p);
      return toast(r === "requested" ? "Sent for approval" : r === "task" ? "Approval task created" : "Scheduled");
    }
    if (to === "Scheduled") {
      if (p.stage === "Awaiting Approval") { approvePost(p); return toast("Approved & scheduled"); }
      if (mode === "Automatic") { submitForApproval(p); return toast("Scheduled (automatic mode)"); }
      return toast("Needs approval first", `Social publishing is set to “${mode}” — submit for approval.`, "warning");
    }
    if (p.stage === "Awaiting Approval") rejectPost(p);
    if (p.stage === "Published") return toast("Published posts can't move back", undefined, "warning");
    if (to === "AI Review") {
      const r = await runReview(p);
      if (r) toast(`AI review: ${r.score}/100`, undefined, "ai");
      return;
    }
    s.patch("socialPosts", p.id, { stage: to }, { entity: "social", action: `Moved post to ${to}`, field: "stage" });
  };

  const scopeLabel = clientId === "All" ? "all clients" : clientName(clientId);
  const listeningClient = clientId !== "All" ? clientId : clientIds[0] ?? "";

  return (
    <div>
      <PageHeader
        icon={<Share2 className="size-5 text-fg-3" />}
        title="Social Media"
        description={<span className="inline-flex flex-wrap items-center gap-1.5">Strategy → Idea → Draft → AI Review → Human Approval → Schedule → Publish → Analyze <AgentChip name={AGENTS.social.name} color={AGENTS.social.color} /></span>}
        actions={
          writable ? (
            <>
              <Button icon={<Lightbulb className="size-3.5" />} onClick={() => setGen({ tab: "reels" })}>Ideas</Button>
              <Button icon={<Plus className="size-3.5" />} onClick={() => setOpen(newPost(clientId !== "All" ? clientId : clientIds[0] ?? "", me.id, { stage: "Draft" }))} disabled={!clientIds.length}>New post</Button>
              <Button variant="ai" icon={<Sparkles className="size-3.5" />} onClick={() => setGen({ tab: "calendar" })}>Generate content calendar</Button>
            </>
          ) : undefined
        }
      />
      {!writable && <Readonly>Read-only access — you can view the calendar and performance but not edit posts.</Readonly>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><p className="text-xs text-fg-3">Scheduled · next 7 days</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.week}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Awaiting approval</p><p className={cn("text-xl font-semibold tabular-nums mt-1", stats.awaiting && "text-warning")}>{stats.awaiting}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">In progress (idea → review)</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.inWork}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Published · 30d</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.published}</p></Card>
        <Card className="p-3 col-span-2 lg:col-span-1"><p className="text-xs text-fg-3">Avg engagement · 30d</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.er.toFixed(2)}%</p></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {!isClient && (
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-48">
            <option value="All">All clients</option>
            {clients.filter((c) => clientIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
        )}
        <Select value={platform} onChange={(e) => setPlatform(e.target.value as SocialPlatform | "All")} className="w-36">
          <option value="All">All platforms</option>
          {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
        </Select>
        {view !== "board" && view !== "analyze" && view !== "listening" && (
          <Select value={stage} onChange={(e) => setStage(e.target.value as SocialStage | "All")} className="w-40">
            <option value="All">All stages</option>
            {SOCIAL_STAGES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Search posts…" className="w-full sm:w-56" />
        <span className="ml-auto" />
        <Badge tone={mode === "Automatic" ? "danger" : mode === "Manual" ? "neutral" : "warning"}>Publishing: {mode}</Badge>
      </div>

      <div className="mb-4">
        <Tabs
          value={view}
          onChange={(v) => { setView(v); router.replace(`/social?view=${v}`, { scroll: false }); }}
          tabs={[
            { value: "calendar", label: "Calendar" },
            { value: "board", label: "Workflow" },
            { value: "list", label: "List", count: visible.length },
            { value: "analyze", label: "Analyze" },
            { value: "listening", label: "Competitors & trends" },
          ]}
        />
      </div>

      {clientIds.length === 0 ? (
        <Card><EmptyState icon={<CalendarDays className="size-5" />} title="No social clients yet" description="Clients with Social Media or Influencer Marketing services appear here." /></Card>
      ) : view === "calendar" ? (
        <SocialCalendar posts={visible} month={month} onMonth={setMonth} onOpen={setOpen} writable={writable} clientName={clientName} />
      ) : view === "board" ? (
        <SocialBoard posts={visible} onOpen={setOpen} onMove={onMove} writable={writable} clientName={clientName} />
      ) : view === "list" ? (
        <Card>
          {visible.length === 0 ? (
            <EmptyState icon={<Share2 className="size-5" />} title="No posts match these filters" />
          ) : (
            <Table>
              <thead><tr><Th>Post</Th><Th>Client</Th><Th>Pillar</Th><Th>Stage</Th><Th>When</Th><Th>AI review</Th><Th>ER</Th><Th>Owner</Th></tr></thead>
              <tbody>
                {[...visible].sort((a, b) => (b.publishedAt ?? b.scheduledAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.scheduledAt ?? a.createdAt)).map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setOpen(p)}>
                    <Td><div className="flex items-center gap-2 min-w-0"><PlatformChip platform={p.platform} /><div className="min-w-0"><p className="truncate max-w-72">{p.hook || p.title}</p><p className="text-[11px] text-fg-3">{p.format}</p></div></div></Td>
                    <Td className="text-fg-2 whitespace-nowrap">{clientName(p.clientId)}</Td>
                    <Td><Badge>{p.pillar}</Badge></Td>
                    <Td><Badge tone={STAGE_TONE[p.stage]} dot>{p.stage}</Badge></Td>
                    <Td className="text-xs text-fg-3 whitespace-nowrap">{fmtDateTime(p.publishedAt ?? p.scheduledAt)}</Td>
                    <Td className="tabular-nums">{p.aiReview ? p.aiReview.score : "—"}</Td>
                    <Td className="tabular-nums">{p.metrics ? `${p.metrics.er}%` : "—"}</Td>
                    <Td><MemberAvatar id={p.ownerId} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : view === "analyze" ? (
        <SocialAnalyze posts={visible} clientName={clientName} onOpen={setOpen} scopeLabel={scopeLabel} clientId={clientId !== "All" ? clientId : undefined} />
      ) : (
        <SocialListening clientId={listeningClient} onClient={setClientId} clientIds={clientIds} posts={scoped} />
      )}

      {open && <PostDrawer key={open.id} initial={open} onClose={() => setOpen(null)} writable={writable} />}
      {gen && writable && <GeneratorModal onClose={() => { setGen(null); if (params.get("generate")) router.replace("/social", { scroll: false }); }} clientIds={clientIds} initialClient={clientId !== "All" ? clientId : params.get("client") ?? undefined} initialTab={gen.tab} />}
    </div>
  );
}

export default function SocialPage() {
  return (
    <Suspense>
      <SocialInner />
    </Suspense>
  );
}
