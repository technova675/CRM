import type { InfluencerEngagement, InfluencerStage, SocialPlatform, SocialPost } from "../types";
import { DAY } from "../utils";
import { makeRand, ago, type SeedCtx } from "./context";
import { BEST_HOURS, PLATFORM_FORMATS, generateCaption, hashtagsFor, hookOptions, pillarsFor, reviewPost, type SocialFormat } from "../ai/social";
import { defaultDeliverables, defaultRequirements, rankCreators } from "../ai/influencer";

// Owned by the Social + Influencer modules.

const SOCIAL_CLIENTS: { id: string; n: number; reach: number; platforms: SocialPlatform[] }[] = [
  { id: "c_4", n: 14, reach: 15000, platforms: ["Instagram", "Instagram", "Facebook", "YouTube"] }, // Coral Stays
  { id: "c_6", n: 12, reach: 11000, platforms: ["Instagram", "Instagram", "Facebook"] }, // Ember Kitchen
  { id: "c_8", n: 12, reach: 8000, platforms: ["Instagram", "Instagram", "YouTube", "Facebook"] }, // Zen Fitness
  { id: "c_1", n: 10, reach: 38000, platforms: ["Instagram", "Instagram", "Facebook"] }, // Bloom Organics
];
const FORMAT_REACH: Record<SocialFormat, number> = { Reel: 1.8, Short: 1.5, Carousel: 1.1, Static: 0.7, Story: 0.45, Text: 0.6 };
const FORMAT_ER: Record<SocialFormat, number> = { Reel: 1.25, Short: 1.1, Carousel: 1.2, Static: 0.8, Story: 0.6, Text: 0.7 };

export function seedSocialPosts(ctx: SeedCtx): SocialPost[] {
  const { R, pick, int } = makeRand(1717);
  const posts: SocialPost[] = [];
  SOCIAL_CLIENTS.forEach((sc, ci) => {
    const client = ctx.clients.find((c) => c.id === sc.id);
    if (!client) return;
    const sctx = { client };
    const { pillars } = pillarsFor(sctx);
    for (let i = 0; i < sc.n; i++) {
      // Spread evenly from 29 days ago to 29 days ahead, with a little jitter.
      const off = Math.round(-29 + (i * 58) / (sc.n - 1) + (R() - 0.5) * 2);
      const platform = sc.platforms[(i + ci) % sc.platforms.length]!;
      const bag = PLATFORM_FORMATS[platform].flatMap((m) => Array(m.weight).fill(m.format) as SocialFormat[]);
      const format = bag[Math.floor(R() * bag.length)]!;
      const pillar = pillars[(i + ci) % pillars.length]!;
      const hours = [...BEST_HOURS[platform], 10, 15];
      const hour = pick(hours);
      const when = new Date(Date.now() + off * DAY);
      when.setHours(hour, int(0, 1) * 30, 0, 0);
      const id = `sp_${sc.id}_${i}`;
      const base = { id, pillar, format, platform };
      const hook = hookOptions(base, sctx, 1)[0]!;
      let stage: SocialPost["stage"];
      if (off < 0) stage = "Published";
      else if (off <= 3) stage = R() < 0.7 ? "Scheduled" : "Awaiting Approval";
      else if (off <= 14) stage = pick(["Scheduled", "Awaiting Approval", "AI Review", "Draft"] as const);
      else stage = pick(["Draft", "Draft", "Idea", "AI Review"] as const);
      const post: SocialPost = {
        id,
        clientId: sc.id,
        platform,
        format,
        stage,
        pillar,
        title: `${format} · ${pillar}`,
        hook,
        caption: stage === "Idea" ? "" : generateCaption({ ...base, hook }, sctx, i % 3),
        hashtags: stage === "Idea" ? [] : hashtagsFor(base, sctx),
        scheduledAt: stage === "Idea" && R() < 0.5 ? undefined : when.toISOString(),
        ownerId: R() < 0.75 ? "u_smm1" : "u_cs1",
        createdAt: new Date(when.getTime() - int(5, 14) * DAY).toISOString(),
      };
      if (stage === "Published") {
        post.publishedAt = when.toISOString();
        const night = hour >= 19 ? 1.2 : hour <= 11 ? 0.85 : 1;
        const pillarLift = 0.8 + (((i + ci) % pillars.length) / pillars.length) * 0.5;
        const reach = Math.round(sc.reach * FORMAT_REACH[format] * pillarLift * (0.7 + R() * 0.6));
        const er = +(2.2 * FORMAT_ER[format] * night * pillarLift * (0.8 + R() * 0.4)).toFixed(2);
        const eng = Math.round((reach * er) / 100);
        const saveShare = format === "Carousel" ? 0.24 : format === "Reel" ? 0.1 : 0.06;
        post.metrics = {
          reach,
          impressions: Math.round(reach * (1.2 + R() * 0.5)),
          likes: Math.round(eng * (0.82 - saveShare)),
          comments: Math.round(eng * 0.07),
          shares: Math.round(eng * (format === "Reel" ? 0.09 : 0.05)),
          saves: Math.round(eng * saveShare),
          er,
        };
      }
      if (["AI Review", "Awaiting Approval", "Scheduled", "Published"].includes(stage)) post.aiReview = reviewPost(post, sctx);
      posts.push(post);
    }
  });
  return posts;
}

const BLOOM_STAGES: InfluencerStage[] = ["Shortlisted", "Shortlisted", "Outreach", "Negotiation", "Contracted", "Content Submitted", "Live", "Paid"];
const CORAL_STAGES: InfluencerStage[] = ["Shortlisted", "Outreach", "Negotiation", "Contracted", "Approved", "Live", "Paid"];
const ORDER = ["Shortlisted", "Outreach", "Negotiation", "Contracted", "Content Submitted", "Approved", "Live", "Paid"];

export function seedEngagements(ctx: SeedCtx): InfluencerEngagement[] {
  const { R, int } = makeRand(2929);
  const out: InfluencerEngagement[] = [];
  const plan: [string, InfluencerStage[]][] = [["c_1", BLOOM_STAGES], ["c_4", CORAL_STAGES]];
  plan.forEach(([clientId, stages]) => {
    const client = ctx.clients.find((c) => c.id === clientId);
    const campaign = ctx.campaigns.find((c) => c.clientId === clientId && c.service === "Influencer Marketing");
    if (!client || !campaign) return;
    const req = defaultRequirements(client, campaign);
    const used = new Set(out.map((e) => e.influencerId));
    const ranked = rankCreators(ctx.influencers, { ...req, budget: 40000, minFollowers: 3000 }).filter((x) => x.i.availability !== "Unavailable" && x.i.pricePerPost <= 60000 && !used.has(x.i.id));
    stages.forEach((stage, k) => {
      const r = ranked[k];
      if (!r) return;
      const inf = r.i;
      const idx = ORDER.indexOf(stage);
      const started = ago(int(8, 28));
      const deliverables = defaultDeliverables(inf.contentTypes.filter((c) => c === "Reels" || c === "Stories" || c === "Shorts"), started).map((d, di, arr) => ({
        ...d,
        done: idx >= 7 ? true : idx >= 6 ? di < arr.length - 1 || R() < 0.5 : idx >= 4 ? di < arr.length - 2 : idx >= 3 ? di === 0 : false,
      }));
      const fee = Math.round((inf.pricePerPost * (0.85 + R() * 0.25)) / 500) * 500;
      const views = Math.round(inf.followers * (0.35 + R() * 0.6));
      const engagements = Math.round((views * inf.engagement * (0.8 + R() * 0.5)) / 100);
      const clicks = Math.round(engagements * (0.06 + R() * 0.08));
      out.push({
        id: `eng_${clientId}_${k}`,
        influencerId: inf.id,
        campaignId: campaign.id,
        clientId,
        stage,
        agreedFee: idx >= 2 ? fee : 0,
        deliverables,
        contentUrl: idx >= 4 ? `https://instagram.com/p/${inf.id.replace("_", "")}${k}demo` : undefined,
        paymentStatus: idx >= 7 ? "Paid" : idx >= 3 && R() < 0.7 ? "Advance Paid" : "Unpaid",
        results: idx >= 6 ? { views, engagements, clicks, sales: Math.round(clicks * (0.03 + R() * 0.05)) } : undefined,
        matchScore: r.m.total,
        notes: idx === 2 ? "Asked for 2 Stories extra at the same fee — countering." : idx === 1 ? "Outreach sent via Instagram DM + email." : "",
        updatedAt: ago(int(0, 6)),
      });
    });
  });
  return out;
}
