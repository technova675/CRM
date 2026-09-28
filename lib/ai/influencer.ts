// Influencer Marketing — local, deterministic matching engine.
// Pure module (no store imports). Scores each creator 0–100 against campaign
// requirements with a transparent explanation per factor.
import type { Campaign, Client, ClientKnowledge, Influencer, InfluencerEngagement, InsightItem } from "../types";

export const CREATOR_CATEGORIES = ["Beauty", "Fashion", "Food", "Fitness", "Tech", "Travel", "Parenting", "Finance", "Lifestyle", "Gaming"];
export const CREATOR_CONTENT = ["Reels", "Stories", "YouTube long-form", "Shorts", "Static posts", "Live", "UGC"];
export const INDUSTRY_CATEGORIES: Record<string, string[]> = {
  "D2C / E-commerce": ["Lifestyle", "Beauty", "Fashion"],
  Hospitality: ["Travel", "Food", "Lifestyle"],
  "Food & Beverage": ["Food", "Lifestyle"],
  Fitness: ["Fitness", "Lifestyle"],
  Fintech: ["Finance", "Tech"],
  Education: ["Parenting", "Tech"],
  "Real Estate": ["Lifestyle", "Finance"],
  Healthcare: ["Fitness", "Parenting", "Lifestyle"],
};

export type Tier = "Nano" | "Micro" | "Mid" | "Macro" | "Mega";
export function tierOf(followers: number): Tier {
  if (followers < 10_000) return "Nano";
  if (followers < 100_000) return "Micro";
  if (followers < 500_000) return "Mid";
  if (followers < 1_000_000) return "Macro";
  return "Mega";
}
// Typical Instagram engagement-rate benchmarks by tier (industry guidance, not platform data).
export const ER_BENCHMARK: Record<Tier, number> = { Nano: 4.5, Micro: 3.0, Mid: 2.2, Macro: 1.6, Mega: 1.2 };

export interface MatchRequirements {
  clientId: string;
  campaignId: string;
  categories: string[];
  geography: string; // "" = any
  budget: number; // per creator (₹)
  minFollowers: number;
  maxFollowers: number; // 0 = no cap
  minEngagement: number;
  contentTypes: string[];
  gender: "Any" | "Female-skewed" | "Male-skewed";
  ageBand: string; // "" = any, e.g. "18-24"
}

export interface MatchFactor { key: string; label: string; points: number; max: number; reason: string }
export interface MatchResult { total: number; factors: MatchFactor[]; excluded?: string }

export function defaultRequirements(client?: Client, campaign?: Campaign): MatchRequirements {
  return {
    clientId: client?.id ?? "",
    campaignId: campaign?.id ?? "",
    categories: INDUSTRY_CATEGORIES[client?.industry ?? ""] ?? [],
    geography: "",
    budget: 25000,
    minFollowers: 5000,
    maxFollowers: 0,
    minEngagement: 2.5,
    contentTypes: ["Reels"],
    gender: client?.industry === "D2C / E-commerce" ? "Female-skewed" : "Any",
    ageBand: "",
  };
}

export function scoreCreator(i: Influencer, r: MatchRequirements, history: InfluencerEngagement[] = []): MatchResult {
  const f: MatchFactor[] = [];
  // Category fit (25)
  const catHit = r.categories.length === 0 || r.categories.includes(i.category);
  const adjacent = !catHit && i.category === "Lifestyle";
  f.push({ key: "category", label: "Category fit", max: 25, points: catHit ? 25 : adjacent ? 12 : 0, reason: catHit ? (r.categories.length ? `${i.category} is in the brief` : "Any category") : adjacent ? "Lifestyle — adjacent to the brief" : `${i.category} not in brief (${r.categories.join(", ")})` });
  // Geography (12)
  const geoCity = i.audience?.topCity;
  const geoHit = !r.geography || i.location === r.geography || geoCity === r.geography;
  f.push({ key: "geo", label: "Geography", max: 12, points: geoHit ? 12 : 4, reason: !r.geography ? "Any geography" : geoHit ? `${i.location === r.geography ? "Based in" : "Top audience city"} ${r.geography}` : `Based in ${i.location}${geoCity ? `, top audience ${geoCity}` : ""}` });
  // ER vs tier benchmark (18)
  const tier = tierOf(i.followers);
  const bench = ER_BENCHMARK[tier];
  const ratio = i.engagement / bench;
  const erPts = Math.round(Math.min(1, ratio / 1.5) * 18);
  f.push({ key: "er", label: "Engagement vs tier", max: 18, points: i.engagement < r.minEngagement ? Math.min(erPts, 5) : erPts, reason: `${i.engagement}% vs ${bench}% ${tier} benchmark (${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%)${i.engagement < r.minEngagement ? ` · below ${r.minEngagement}% minimum` : ""}` });
  // Budget fit (15)
  const within = !r.budget || i.pricePerPost <= r.budget;
  const over = r.budget ? (i.pricePerPost - r.budget) / r.budget : 0;
  f.push({ key: "budget", label: "Budget fit", max: 15, points: within ? 15 : Math.max(0, Math.round(15 - over * 20)), reason: within ? `₹${i.pricePerPost.toLocaleString("en-IN")} within ₹${r.budget.toLocaleString("en-IN")}` : `₹${i.pricePerPost.toLocaleString("en-IN")} is ${Math.round(over * 100)}% over budget` });
  // Followers / audience fit (10)
  const inRange = i.followers >= r.minFollowers && (!r.maxFollowers || i.followers <= r.maxFollowers);
  let audPts = inRange ? 6 : 0;
  const audNotes: string[] = [inRange ? `${Math.round(i.followers / 1000)}K in range` : `${Math.round(i.followers / 1000)}K outside follower range`];
  if (i.audience) {
    const genderOk = r.gender === "Any" || (r.gender === "Female-skewed" ? i.audience.femalePct >= 55 : i.audience.femalePct <= 45);
    const ageOk = !r.ageBand || i.audience.ageBand === r.ageBand;
    audPts += (genderOk ? 2 : 0) + (ageOk ? 2 : 0);
    audNotes.push(`${i.audience.femalePct}% female · ${i.audience.ageBand}`);
  } else {
    audPts += r.gender === "Any" && !r.ageBand ? 4 : 1;
    audNotes.push("no audience data — ask for insights screenshot");
  }
  const ctHit = r.contentTypes.length === 0 || r.contentTypes.some((c) => i.contentTypes.includes(c));
  f.push({ key: "audience", label: "Audience & content", max: 10, points: ctHit ? audPts : Math.max(0, audPts - 4), reason: `${audNotes.join(" · ")}${ctHit ? "" : ` · doesn't make ${r.contentTypes.join("/")}`}` });
  // Availability (8)
  f.push({ key: "availability", label: "Availability", max: 8, points: i.availability === "Available" ? 8 : i.availability === "Busy" ? 3 : 0, reason: i.availability });
  // Past performance (7)
  const past = history.filter((e) => e.influencerId === i.id && e.results);
  const pastNote = past.length ? `${past.length} past campaign(s) with results` : i.previousProjects.length ? `Worked with ${i.previousProjects.slice(0, 2).join(", ")}` : "No past campaigns with us";
  f.push({ key: "performance", label: "Past performance", max: 7, points: Math.round((i.performanceScore / 10) * 7), reason: `${i.performanceScore}/10 · ${pastNote}` });
  // Verification (5)
  f.push({ key: "verification", label: "Verification", max: 5, points: i.verification === "Verified" ? 5 : i.verification === "Pending" ? 2 : 0, reason: i.verification });
  const total = Math.max(0, Math.min(100, f.reduce((a, x) => a + x.points, 0)));
  return { total, factors: f, excluded: i.availability === "Unavailable" ? "Unavailable" : undefined };
}

export function rankCreators(influencers: Influencer[], r: MatchRequirements, history: InfluencerEngagement[] = []) {
  return influencers.map((i) => ({ i, m: scoreCreator(i, r, history) })).sort((a, b) => b.m.total - a.m.total);
}

export function matchSummary(ranked: { i: Influencer; m: MatchResult }[], r: MatchRequirements): InsightItem[] {
  const top = ranked.slice(0, 5);
  if (!top.length) return [];
  const avg = top.reduce((a, x) => a + x.m.total, 0) / top.length;
  const cost = top.reduce((a, x) => a + x.i.pricePerPost, 0);
  const reach = top.reduce((a, x) => a + x.i.followers, 0);
  const out: InsightItem[] = [
    { kind: "data", text: `Top 5 average match ${avg.toFixed(0)}/100 · combined followers ${reach.toLocaleString("en-IN")} · rate-card cost ₹${cost.toLocaleString("en-IN")}.`, source: "Creator database" },
  ];
  const noAud = top.filter((x) => !x.i.audience).length;
  if (noAud) out.push({ kind: "assumption", text: `${noAud} of the top 5 have no audience demographics on file — gender/age fit is unverified; request insights screenshots.` });
  out.push({ kind: "assumption", text: "Engagement benchmarks are industry tier averages, not platform-verified; confirm with the creator's recent posts." });
  if (r.budget && cost > r.budget * 5) out.push({ kind: "recommendation", text: "Top 5 exceeds 5× the per-creator budget — mix in micro creators or negotiate bundle rates." });
  out.push({ kind: "recommendation", text: "Shortlist 6–8 creators to allow for declines; send outreach to the top 4 first." });
  return out;
}

// ---------- Engagement helpers ----------
export function defaultDeliverables(contentTypes: string[], startIso: string) {
  const start = new Date(startIso).getTime();
  const day = 86_400_000;
  const items = (contentTypes.length ? contentTypes : ["Reels"]).slice(0, 2);
  return [
    { label: "Brief sign-off", due: new Date(start + 3 * day).toISOString(), done: false },
    ...items.map((c, i) => ({ label: `${c === "Reels" ? "1 Reel" : c === "Stories" ? "3 Stories" : `1 × ${c}`} — draft for approval`, due: new Date(start + (10 + i * 4) * day).toISOString(), done: false })),
    { label: "Go live + share insights", due: new Date(start + 21 * day).toISOString(), done: false },
  ];
}

export function engagementEconomics(e: Pick<InfluencerEngagement, "agreedFee" | "results">) {
  const r = e.results;
  if (!r) return null;
  return {
    cpe: r.engagements ? e.agreedFee / r.engagements : 0,
    cpv: r.views ? e.agreedFee / r.views : 0,
    cpc: r.clicks ? e.agreedFee / r.clicks : 0,
    cpa: r.sales ? e.agreedFee / r.sales : 0,
    er: r.views ? (r.engagements / r.views) * 100 : 0,
  };
}

export function draftOutreach(i: Influencer, opts: { client?: Client; campaign?: Campaign; knowledge?: ClientKnowledge; fee?: number; agency: string }) {
  const first = i.name.split(" ")[0];
  const brand = opts.client?.company ?? "our client";
  const product = opts.knowledge?.products?.[0];
  const voice = opts.knowledge?.toneWords?.slice(0, 2).join(" & ");
  const deliver = i.contentTypes.includes("Reels") ? "1 Reel + 3 Stories" : `1 ${i.contentTypes[0] ?? "post"}`;
  return [
    `Hi ${first},`,
    ``,
    `I'm reaching out from ${opts.agency} on behalf of ${brand}. We've been following your ${i.category.toLowerCase()} content${i.instagram ? ` on ${i.instagram}` : ""} and think your audience would genuinely connect with ${product ? `${product.name} (${product.usp})` : brand}.`,
    ``,
    `The idea: ${deliver} for ${opts.campaign?.name ?? "an upcoming campaign"}${voice ? ` — the brand voice is ${voice}, so your natural style fits well` : ""}. Creative freedom on the concept; we'll share a short brief with the must-haves.`,
    ``,
    opts.fee ? `Our budget for this is around ₹${opts.fee.toLocaleString("en-IN")} — happy to discuss.` : `Could you share your current rate card and availability for the next 3–4 weeks?`,
    ``,
    `All sponsored content will be labelled as a paid partnership, per ASCI guidelines.`,
    ``,
    `Thanks!`,
  ].join("\n");
}
