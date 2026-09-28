"use client";

import { useMemo } from "react";
import { useCRM } from "@/lib/store";
import type { Task, TaskRelatedType } from "@/lib/types";

export const REL_TYPES: { value: TaskRelatedType; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "campaign", label: "Campaign" },
  { value: "creative", label: "Creative" },
  { value: "seo", label: "SEO project" },
  { value: "influencer", label: "Influencer project" },
  { value: "social", label: "Social post" },
  { value: "video", label: "Video" },
  { value: "strategy", label: "Strategy" },
  { value: "deal", label: "Sales deal" },
  { value: "lead", label: "Lead" },
];

type Entry = { label: string; href: string; clientId?: string };

// One lookup for every entity a task can be attached to.
export function useRelatedIndex() {
  const leads = useCRM((s) => s.leads);
  const deals = useCRM((s) => s.deals);
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const creatives = useCRM((s) => s.creatives);
  const seoProjects = useCRM((s) => s.seoProjects);
  const engagements = useCRM((s) => s.engagements);
  const influencers = useCRM((s) => s.influencers);
  const socialPosts = useCRM((s) => s.socialPosts);
  const videos = useCRM((s) => s.videos);
  const strategies = useCRM((s) => s.strategies);

  return useMemo(() => {
    const clientName = new Map(clients.map((c) => [c.id, c.company]));
    const infName = new Map(influencers.map((i) => [i.id, i.name]));
    const maps: Record<TaskRelatedType, Map<string, Entry>> = {
      lead: new Map(leads.map((x) => [x.id, { label: `${x.name} · ${x.company}`, href: `/leads/${x.id}` }])),
      deal: new Map(deals.map((x) => [x.id, { label: x.title, href: `/pipeline?deal=${x.id}`, clientId: x.clientId }])),
      client: new Map(clients.map((x) => [x.id, { label: x.company, href: `/clients/${x.id}`, clientId: x.id }])),
      campaign: new Map(campaigns.map((x) => [x.id, { label: x.name, href: `/campaigns?c=${x.id}`, clientId: x.clientId }])),
      creative: new Map(creatives.map((x) => [x.id, { label: `${x.title} · ${clientName.get(x.clientId) ?? ""}`, href: `/creative?c=${x.id}`, clientId: x.clientId }])),
      seo: new Map(seoProjects.map((x) => [x.id, { label: `SEO · ${x.domain}`, href: `/seo`, clientId: x.clientId }])),
      influencer: new Map<string, Entry>([
        ...influencers.map((x): [string, Entry] => [x.id, { label: `Creator · ${x.name}`, href: `/influencers` }]),
        ...engagements.map((x): [string, Entry] => [x.id, { label: `${infName.get(x.influencerId) ?? "Creator"} · ${clientName.get(x.clientId) ?? ""}`, href: `/influencers`, clientId: x.clientId }]),
      ]),
      social: new Map(socialPosts.map((x) => [x.id, { label: `${x.platform} · ${x.title}`, href: `/social`, clientId: x.clientId }])),
      video: new Map(videos.map((x) => [x.id, { label: x.title, href: `/video/${x.id}`, clientId: x.clientId }])),
      strategy: new Map(strategies.map((x) => [x.id, { label: x.title, href: `/strategy`, clientId: x.clientId }])),
    };
    const get = (r?: Task["related"]) => (r ? maps[r.type]?.get(r.id) : undefined);
    const options = (type: TaskRelatedType | "") => {
      if (!type) return [];
      const list = [...maps[type].entries()].map(([id, e]) => ({ id, label: e.label }));
      return type === "lead" ? list.slice(0, 300) : type === "influencer" ? list.filter((o) => engagements.some((e) => e.id === o.id)).concat(list.filter((o) => !engagements.some((e) => e.id === o.id))) : list;
    };
    return { get, options };
  }, [leads, deals, clients, campaigns, creatives, seoProjects, engagements, influencers, socialPosts, videos, strategies]);
}

export const isBlockedByDeps = (t: Task, byId: Map<string, Task>) => (t.dependsOn ?? []).some((id) => byId.get(id) && byId.get(id)!.status !== "Done");
