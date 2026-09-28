"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Film, GalleryHorizontal, Image as ImageIcon, Plus, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import type { SocialPlatform, SocialPost } from "@/lib/types";
import { carouselIdeas, defaultPlatforms, generateCalendar, pillarsFor, reelIdeas, staticIdeas, type CarouselIdea, type ReelIdea, type StaticIdea } from "@/lib/ai/social";
import { runAgentJob } from "@/lib/ai/client";
import { cn, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, Field, InsightList, Modal, Select, Tabs } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { PLATFORMS, PlatformChip, newPost, socialCtx } from "./shared";

type Tab = "calendar" | "reels" | "carousels" | "static";

export function GeneratorModal({ onClose, clientIds, initialClient, initialTab = "calendar" }: { onClose: () => void; clientIds: string[]; initialClient?: string; initialTab?: Tab }) {
  const me = useMe();
  const clients = useCRM((s) => s.clients);
  const knowledge = useCRM((s) => s.knowledge);
  const strategies = useCRM((s) => s.strategies);
  const eligible = useMemo(() => clients.filter((c) => clientIds.includes(c.id)), [clients, clientIds]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [clientId, setClientId] = useState(initialClient && clientIds.includes(initialClient) ? initialClient : eligible[0]?.id ?? "");
  const client = clients.find((c) => c.id === clientId);
  const [monthOffset, setMonthOffset] = useState(1);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(() => (client ? defaultPlatforms(client) : ["Instagram"]));
  const [perWeek, setPerWeek] = useState(3);
  const [preview, setPreview] = useState<SocialPost[] | null>(null);
  const [reels, setReels] = useState<ReelIdea[]>([]);
  const [cars, setCars] = useState<CarouselIdea[]>([]);
  const [stat, setStat] = useState<StaticIdea[]>([]);
  const [salt, setSalt] = useState(0);
  const [busy, setBusy] = useState(false);

  const pillarInfo = useMemo(() => (client ? pillarsFor({ client, knowledge: knowledge.find((k) => k.clientId === client.id), strategies }) : null), [client, knowledge, strategies]);
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((o) => new Date(now.getFullYear(), now.getMonth() + o, 1));
  }, []);

  const pickClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) setPlatforms(defaultPlatforms(c));
    setPreview(null);
    setReels([]); setCars([]); setStat([]);
  };

  const genCalendar = async () => {
    const ctx = socialCtx(clientId);
    if (!ctx) return;
    const m = months[monthOffset]!;
    setBusy(true);
    const out = await runAgentJob({
      agent: "social",
      title: `Content calendar · ${ctx.client.company} · ${m.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`,
      clientId,
      local: () => generateCalendar(ctx, { year: m.getFullYear(), month: m.getMonth(), platforms, postsPerWeek: perWeek, ownerId: me.role === "social_media" ? me.id : "u_smm1", stage: "Draft" }),
    });
    setBusy(false);
    if (out) setPreview(out);
  };
  const addCalendar = () => {
    if (!preview) return;
    const s = useCRM.getState();
    preview.forEach((p) => s.upsert("socialPosts", p));
    s.log({ actor: "ai", agent: "social", entity: "social", action: "Generated content calendar", detail: `${client?.company} · ${preview.length} draft posts` });
    toast(`${preview.length} draft posts added`, "Run AI review, then submit for approval.", "ai");
    onClose();
  };

  const genIdeas = async (kind: Exclude<Tab, "calendar">) => {
    const ctx = socialCtx(clientId);
    if (!ctx) return;
    setBusy(true);
    const label = kind === "reels" ? "Reel ideas" : kind === "carousels" ? "Carousel ideas" : "Static post ideas";
    const out = await runAgentJob({
      agent: "social",
      title: `${label} · ${ctx.client.company}`,
      clientId,
      local: () => (kind === "reels" ? reelIdeas(ctx, 5, salt) : kind === "carousels" ? carouselIdeas(ctx, 3, salt) : staticIdeas(ctx, 4, salt)),
    });
    setBusy(false);
    setSalt((n) => n + 1);
    if (!out) return;
    if (kind === "reels") setReels(out as ReelIdea[]);
    else if (kind === "carousels") setCars(out as CarouselIdea[]);
    else setStat(out as StaticIdea[]);
  };
  const addIdea = (partial: Partial<SocialPost>) => {
    const s = useCRM.getState();
    const p = newPost(clientId, me.role === "social_media" ? me.id : "u_smm1", { platform: "Instagram", ...partial });
    s.upsert("socialPosts", p);
    s.log({ actor: "ai", agent: "social", entity: "social", entityId: p.id, action: "Saved idea to calendar", detail: p.title });
    toast("Idea added", "It's in the Idea column and the unscheduled tray.");
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Social Agent — generate" subtitle="Strategy → Idea → Draft. Everything lands as a draft for AI review and human approval.">
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <Field label="Client" className="w-56">
          <Select value={clientId} onChange={(e) => pickClient(e.target.value)}>{eligible.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select>
        </Field>
        {pillarInfo && (
          <div className="flex-1 min-w-60">
            <p className="text-xs font-medium text-fg-2 mb-1">Content pillars <span className="font-normal text-fg-3">· {pillarInfo.source}</span></p>
            <div className="flex flex-wrap gap-1">{pillarInfo.pillars.map((p) => <Badge key={p} tone="accent">{p}</Badge>)}</div>
          </div>
        )}
      </div>
      {pillarInfo && <InsightList items={[pillarInfo.note]} compact className="mb-3" />}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "calendar", label: "Content calendar" }, { value: "reels", label: "Reel ideas" }, { value: "carousels", label: "Carousel ideas" }, { value: "static", label: "Static posts" }]} />

      <div className="pt-4">
        {tab === "calendar" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Month" className="w-44">
                <Select value={monthOffset} onChange={(e) => { setMonthOffset(Number(e.target.value)); setPreview(null); }}>
                  {months.map((m, i) => <option key={i} value={i}>{m.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}
                </Select>
              </Field>
              <Field label="Posts / week / platform" className="w-40">
                <Select value={perWeek} onChange={(e) => { setPerWeek(Number(e.target.value)); setPreview(null); }}>{[1, 2, 3, 4, 5, 7].map((n) => <option key={n}>{n}</option>)}</Select>
              </Field>
              <div>
                <p className="text-xs font-medium text-fg-2 mb-1">Platforms</p>
                <div className="flex flex-wrap gap-1">
                  {PLATFORMS.map((p) => {
                    const on = platforms.includes(p);
                    return <button type="button" key={p} onClick={() => { setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p]); setPreview(null); }} className={cn("h-7 rounded-full border px-2.5 text-xs inline-flex items-center gap-1", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3")}><PlatformChip platform={p} />{p}</button>;
                  })}
                </div>
              </div>
              <Button variant="ai" loading={busy} disabled={!platforms.length || !clientId} icon={<CalendarDays className="size-3.5" />} onClick={genCalendar}>Generate content calendar</Button>
            </div>
            <p className="text-[11px] text-fg-3">Format mix follows platform best practice (e.g. Instagram ≈ 50% Reels, 30% Carousels, 10% Static, 10% Stories; LinkedIn carousel/document + text). Times use benchmark engagement windows until the account has its own history.</p>
            {preview && (
              <Card>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <p className="text-[13px] font-medium">{preview.length} draft posts</p>
                  <Button variant="primary" size="xs" icon={<Plus className="size-3" />} onClick={addCalendar}>Add all to calendar</Button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-border">
                  {preview.map((p) => (
                    <div key={p.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-fg-3"><PlatformChip platform={p.platform} /><span className="font-medium text-fg-2">{p.format}</span><Badge>{p.pillar}</Badge><span className="ml-auto tabular-nums">{fmtDateTime(p.scheduledAt)}</span></div>
                      <p className="mt-1 text-[13px]">{p.hook}</p>
                      <p className="mt-0.5 text-fg-3 truncate">{p.hashtags.join(" ")}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "reels" && (
          <IdeaSection busy={busy} onGenerate={() => genIdeas("reels")} icon={<Film className="size-3.5" />} label="Generate 5 reel ideas" empty={!reels.length}>
            {reels.map((r, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[13px] font-medium">{r.title}</p><p className="text-xs text-accent-text mt-0.5">Hook: {r.hook}</p></div>
                  <Button size="xs" icon={<Plus className="size-3" />} onClick={() => addIdea({ format: "Reel", pillar: r.pillar, title: `Reel · ${r.title}`, hook: r.hook, caption: `Reel plan:\n${r.beats.map((b) => `• ${b}`).join("\n")}\n\n${r.note}` })}>Add as idea</Button>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-fg-2">{r.beats.map((b) => <li key={b}>• {b}</li>)}</ul>
                <p className="mt-1.5 text-[11px] text-fg-3">{r.note}</p>
              </Card>
            ))}
          </IdeaSection>
        )}
        {tab === "carousels" && (
          <IdeaSection busy={busy} onGenerate={() => genIdeas("carousels")} icon={<GalleryHorizontal className="size-3.5" />} label="Generate carousel ideas" empty={!cars.length}>
            {cars.map((c, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[13px] font-medium">{c.title}</p><p className="text-xs text-accent-text mt-0.5">Cover: {c.hook}</p></div>
                  <Button size="xs" icon={<Plus className="size-3" />} onClick={() => addIdea({ format: "Carousel", pillar: c.pillar, title: `Carousel · ${c.title}`, hook: c.hook, caption: c.slides.join("\n") })}>Add as idea</Button>
                </div>
                <ol className="mt-2 grid gap-1 sm:grid-cols-2 text-xs text-fg-2">{c.slides.map((s) => <li key={s} className="rounded-md bg-surface-2 px-2 py-1">{s}</li>)}</ol>
              </Card>
            ))}
          </IdeaSection>
        )}
        {tab === "static" && (
          <IdeaSection busy={busy} onGenerate={() => genIdeas("static")} icon={<ImageIcon className="size-3.5" />} label="Generate static post ideas" empty={!stat.length}>
            {stat.map((c, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[13px] font-medium">{c.headline}</p><p className="text-xs text-fg-3 mt-0.5">{c.pillar}</p></div>
                  <Button size="xs" icon={<Plus className="size-3" />} onClick={() => addIdea({ format: "Static", pillar: c.pillar, title: `Static · ${c.title}`, hook: c.headline, caption: `${c.caption}\n\nVisual: ${c.visual}` })}>Add as idea</Button>
                </div>
                <p className="mt-2 text-xs text-fg-2">Visual: {c.visual}</p>
                <p className="mt-1 text-xs text-fg-2">Caption: {c.caption}</p>
              </Card>
            ))}
          </IdeaSection>
        )}
      </div>
    </Modal>
  );
}

function IdeaSection({ busy, onGenerate, icon, label, empty, children }: { busy: boolean; onGenerate: () => void; icon: React.ReactNode; label: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ai" loading={busy} icon={icon} onClick={onGenerate}>{empty ? label : "Regenerate"}</Button>
        <span className="text-[11px] text-fg-3 flex items-center gap-1"><Sparkles className="size-3" /> Built from pillars, brand voice and industry best practice.</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">{children}</div>
    </div>
  );
}
