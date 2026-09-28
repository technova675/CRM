// Creative Agent — deterministic local engine.
// Pure module (no store / React imports): concept generation, creative intelligence
// over ad-level data, and helpers shared by seeds and the Creative Studio UI.

import type { AdRow, Campaign, Client, ClientKnowledge, Creative, CreativeConcept, InsightItem, StrategyDoc } from "../types";
import { money } from "../utils";
import { playbookFor } from "./strategy";

export const SWATCHES = ["#f97316", "#ec4899", "#8b5cf6", "#0ea5e9", "#14b8a6", "#84cc16", "#eab308", "#ef4444", "#6366f1", "#10b981"];

export interface CreativeInputs {
  brand: string;
  product: string;
  audience: string;
  offer: string;
  platform: string;
  objective: string;
  existing: string; // existing creatives / what's running
}

const KB = "Client knowledge base";
const ADS = "Ad platforms · last 7 days vs prior 7";

const ctrOf = (s: { clicks: number; impressions: number }) => (s.impressions ? (s.clicks / s.impressions) * 100 : 0);
const cpaOf = (s: { spend: number; conversions: number }) => (s.conversions ? s.spend / s.conversions : 0);
const roasOf = (s: { spend: number; revenue: number }) => (s.spend ? s.revenue / s.spend : 0);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹ ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
export const overlaps = (a: string, b: string) => {
  const A = new Set(words(a));
  const B = words(b);
  if (!A.size || !B.length) return false;
  const hit = B.filter((w) => A.has(w)).length;
  return hit / Math.min(A.size, B.length) >= 0.5;
};
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// ---------- Inputs from the client record ----------
export function deriveCreativeInputs(src: { client?: Pick<Client, "company" | "industry">; knowledge?: ClientKnowledge; campaigns: Campaign[]; creatives: Creative[]; ads: AdRow[] }): CreativeInputs {
  const pb = playbookFor(src.client?.industry);
  const k = src.knowledge;
  const hero = k?.products?.[0];
  const live = src.creatives.filter((c) => c.status === "Live").map((c) => c.title);
  const hooks = [...new Set(src.ads.map((a) => a.hook).filter(Boolean))].slice(0, 3);
  const meta = src.campaigns.find((c) => c.service === "Meta Ads");
  return {
    brand: src.client?.company ?? "",
    product: hero ? `${hero.name}${hero.price ? ` (${hero.price})` : ""} — ${hero.usp}` : pb.product,
    audience: k?.audience || src.campaigns.find((c) => c.audience)?.audience || pb.audience,
    offer: pb.goal === "sales" ? "Launch bundle — free shipping over ₹999" : "Free consultation / demo",
    platform: meta || !src.campaigns.length ? "Meta (Instagram + Facebook)" : src.campaigns[0]!.platform,
    objective: pb.goal === "sales" ? "Sales" : "Lead generation",
    existing: [...live, ...hooks.map((h) => `Hook: ${h}`)].join("; "),
  };
}

export function creativeContextUsed(k?: ClientKnowledge, extra: { ads?: number; strategy?: string } = {}): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (k?.brandVoice) out.push({ label: "Brand voice", value: k.brandVoice });
  if (k?.toneWords?.length) out.push({ label: "Tone words", value: k.toneWords.join(", ") });
  if (k?.products?.length) out.push({ label: "Products", value: k.products.map((p) => p.name).join(", ") });
  if (k?.audience) out.push({ label: "Audience", value: k.audience });
  if (k?.approvedMessaging?.length) out.push({ label: "Approved messaging", value: k.approvedMessaging.join(" · ") });
  if (k?.rejectedConcepts?.length) out.push({ label: "Rejected concepts (avoided)", value: k.rejectedConcepts.join(" · ") });
  if (k?.guidelines) out.push({ label: "Guidelines", value: k.guidelines });
  if (extra.ads) out.push({ label: "Ad performance", value: `${extra.ads} ad(s) analysed for winning hooks` });
  if (extra.strategy) out.push({ label: "Approved strategy", value: extra.strategy });
  if (!k) out.push({ label: "Knowledge base", value: "Not filled yet — industry playbook assumptions used instead" });
  return out;
}

// ---------- Concept generation ----------
type Kind = CreativeConcept["kind"];
const HOOKS = [
  (a: string, aud: string) => `Stop scrolling if you're ${aud} — ${a.toLowerCase()} changes everything`,
  (a: string) => `POV: you finally found ${a.toLowerCase()} that actually works`,
  (a: string, _aud: string, cat: string) => `3 things nobody tells you about ${cat}`,
  (a: string, _aud: string, _c: string, brand: string) => `I tried ${brand} for 30 days — here's the honest truth`,
  (a: string, _aud: string, _c: string, _b: string, pain: string) => `The real reason ${pain.toLowerCase()}`,
  (a: string) => `${a}: before vs after in one scroll`,
  (a: string, _aud: string, _c: string, brand: string) => `Why 10,000+ people switched to ${brand}`,
  (a: string, _aud: string, cat: string) => `Don't choose a ${cat} until you see this`,
];
const kindsFor = (platform: string): Kind[] =>
  /google|youtube|search/i.test(platform) ? ["Video", "Static", "Video", "Carousel"] : /linkedin/i.test(platform) ? ["Static", "Carousel", "Video", "Static"] : ["Video", "UGC", "Static", "Carousel"];
const ctaFor = (objective: string) => (/sale|purchase|shop|convers/i.test(objective) ? "Shop now" : /lead|demo|consult|book|trial/i.test(objective) ? "Book now" : /install/i.test(objective) ? "Install now" : "Learn more");
const formatFor = (k: Kind, platform: string) => (k === "Video" || k === "UGC" ? (/youtube|google/i.test(platform) ? "16:9 + 9:16 Shorts" : "9:16 Reel") : k === "Carousel" ? "4:5 Carousel" : /linkedin/i.test(platform) ? "1.91:1 Static" : "1:1 Static");

export interface GenerateConceptsOpts {
  inputs: CreativeInputs;
  clientId: string;
  industry?: string;
  knowledge?: ClientKnowledge;
  strategy?: StrategyDoc;
  ads?: AdRow[]; // client's ads (for winning hooks)
  count: number;
  now?: string;
  idPrefix: string;
}

export function generateConcepts(o: GenerateConceptsOpts): { concepts: CreativeConcept[]; skipped: string[] } {
  const { inputs, knowledge: k } = o;
  const pb = playbookFor(o.industry);
  const intel = o.ads?.length ? analyzeCreatives({ ads: o.ads, creatives: [] }) : undefined;
  const winning = intel?.hooks.filter((h) => h.ctr > 0).slice(0, 2) ?? [];
  const pillarAngles = o.strategy?.sections.find((s) => s.key === "pillars")?.items.map((i) => i.text.split(" — ")[0]!) ?? [];
  // Angle pool: approved messaging (data) → strategy pillars → playbook angles (assumption).
  const pool: { angle: string; src: "kb" | "strategy" | "playbook" }[] = [
    ...(k?.approvedMessaging ?? []).map((a) => ({ angle: a, src: "kb" as const })),
    ...pillarAngles.map((a) => ({ angle: a, src: "strategy" as const })),
    ...pb.angles.map((a) => ({ angle: a, src: "playbook" as const })),
  ];
  const skipped: string[] = [];
  const angles = pool.filter((a, i) => {
    if (pool.findIndex((b) => b.angle.toLowerCase() === a.angle.toLowerCase()) !== i) return false;
    const rej = k?.rejectedConcepts?.find((r) => overlaps(r, a.angle));
    if (rej) skipped.push(`${a.angle} (matches rejected: "${rej}")`);
    return !rej;
  });
  if (!angles.length) angles.push({ angle: "Problem → solution", src: "playbook" });

  const kinds = kindsFor(inputs.platform);
  const brand = inputs.brand || "the brand";
  const aud = (inputs.audience.split(/[,;(]/)[0] ?? "").trim().toLowerCase() || "our audience";
  const productName = inputs.product.split(/[—(]/)[0]!.trim() || "the product";
  const category = productName.toLowerCase();
  const pains = pb.personas.flatMap((p) => p.pains);
  const tone = k?.toneWords?.length ? k.toneWords.join(", ") : "clear, confident";
  const cta = ctaFor(inputs.objective);
  const now = o.now ?? new Date().toISOString();
  const start = hash(o.clientId + inputs.platform) % HOOKS.length;
  const out: CreativeConcept[] = [];

  for (let i = 0; i < Math.max(1, Math.min(20, o.count)); i++) {
    const a = angles[i % angles.length]!;
    const kind = kinds[i % kinds.length]!;
    const pain = pains[i % Math.max(1, pains.length)] ?? "results are inconsistent";
    let hook = HOOKS[(start + i) % HOOKS.length]!(a.angle, aud, category, brand, pain);
    const riffOnWinner = winning[i % Math.max(1, winning.length)];
    if (riffOnWinner && i % 4 === 3) hook = `${riffOnWinner.hook.replace(/…$/, "")} ${category}`;
    if (k?.rejectedConcepts?.some((r) => overlaps(r, hook))) hook = `${a.angle} — see why ${aud} are switching`;
    const headline = kind === "Static" || kind === "Carousel" ? `${a.angle}. ${inputs.offer ? inputs.offer.split("—")[0]!.trim() : cta}.` : `${a.angle} with ${brand}`;
    const video = kind === "Video" || kind === "UGC";
    const script = video
      ? [
          `0–3s HOOK: "${hook}" (on-screen text + ${kind === "UGC" ? "creator to camera, handheld" : "bold product close-up"})`,
          `3–10s PROBLEM: ${pain} — show the frustration ${aud} feel`,
          `10–20s PROOF: ${productName} — ${a.angle.toLowerCase()}; ${pb.proof}`,
          `20–30s OFFER + CTA: ${inputs.offer || "Try it today"} → "${cta}"`,
          `Tone: ${tone}. Captions on; brand logo last 2s.`,
        ].join("\n")
      : undefined;
    const storyboard = video
      ? [`Frame 1 — Hook text over ${kind === "UGC" ? "creator selfie shot" : "product macro"}`, `Frame 2 — Pain moment (${pain.toLowerCase()})`, `Frame 3 — ${productName} in use`, `Frame 4 — Proof: ${pb.proof.split(",")[0]}`, `Frame 5 — Offer card + "${cta}" button`]
      : kind === "Carousel"
        ? [`Card 1 — ${hook}`, `Card 2 — The problem: ${pain}`, `Card 3 — ${a.angle}`, `Card 4 — Proof / reviews`, `Card 5 — ${inputs.offer || cta}`]
        : undefined;
    const rationale: InsightItem[] = [];
    if (a.src === "kb") rationale.push({ kind: "data", source: KB, text: `Built on approved messaging: "${a.angle}"` });
    else if (a.src === "strategy") rationale.push({ kind: "data", source: "Approved strategy · content pillars", text: `Maps to the "${a.angle}" pillar` });
    else rationale.push({ kind: "assumption", text: `"${a.angle}" is a proven angle in ${o.industry ?? "this category"} — not yet validated for ${brand}` });
    if (riffOnWinner && i % 4 === 3) rationale.push({ kind: "data", source: ADS, text: `Riffs on winning hook "${riffOnWinner.hook}" (CTR ${riffOnWinner.ctr.toFixed(2)}%, ${riffOnWinner.ads} ad(s))` });
    if (k?.brandVoice) rationale.push({ kind: "data", source: KB, text: `Voice: ${k.brandVoice.split(".")[0]}` });
    rationale.push({ kind: "recommendation", text: `Test as ${kind.toLowerCase()} on ${inputs.platform} for ${inputs.objective.toLowerCase()}; judge on hook rate & CTR after ₹${Math.round(5000 + (i % 3) * 2500).toLocaleString("en-IN")} spend` });
    out.push({
      id: `${o.idPrefix}_${i + 1}`,
      clientId: o.clientId,
      kind,
      platform: `${inputs.platform} · ${formatFor(kind, inputs.platform)}`,
      title: `${kind === "UGC" ? "UGC" : kind} — ${a.angle}`,
      angle: a.angle,
      hook,
      headline,
      script,
      storyboard,
      cta,
      rationale,
      createdAt: now,
    });
  }
  return { concepts: out, skipped };
}

export function conceptToCreative(c: CreativeConcept, o: { id: string; ownerId: string; now?: string; campaignId?: string }): Creative {
  const now = o.now ?? new Date().toISOString();
  const type: Creative["type"] = c.kind === "Static" ? "Image" : c.kind === "Carousel" ? "Carousel" : "Video";
  return {
    id: o.id,
    clientId: c.clientId,
    campaignId: o.campaignId,
    title: c.title,
    type,
    platform: c.platform.split(" · ")[0]!,
    format: c.platform.split(" · ")[1] ?? (type === "Video" ? "9:16 Reel" : "1:1 Static"),
    status: "Draft",
    angle: c.angle,
    hook: c.hook,
    versions: [{ v: 1, note: "Generated from AI concept", createdAt: now, createdBy: "ai", headline: c.headline, body: c.script ?? [c.hook, ...(c.storyboard ?? [])].join("\n"), cta: c.cta, swatch: SWATCHES[hash(c.id) % SWATCHES.length] }],
    comments: [],
    ownerId: o.ownerId,
    tags: ["ai-concept", c.kind.toLowerCase()],
    aiGenerated: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- Creative intelligence ----------
export interface HookStat { hook: string; ads: number; spend: number; ctr: number; ctrPrev: number; cpa: number; roas: number; conversions: number }
export interface FormatStat { format: string; ads: number; spend: number; ctr: number; cpa: number; roas: number }
export interface WeakAd { adId: string; name: string; clientId: string; hook?: string; format: string; ctr: number; benchmark: number; spend: number }
export interface FatiguedAd { adId: string; name: string; clientId: string; campaignId: string; hook?: string; format: string; frequency: number; ctrPrev: number; ctrCurr: number; drop: number; spend: number }
export interface Gap { angle: string; clientId: string; source: string }
export interface CreativeIntel {
  totals: { ads: number; spend: number; ctr: number; cpa: number };
  hooks: HookStat[];
  formats: FormatStat[];
  weak: WeakAd[];
  weakCreatives: { id: string; title: string; hookRate: number; ctr: number }[];
  fatigue: FatiguedAd[];
  gaps: Gap[];
  insights: Record<"hooks" | "formats" | "weak" | "fatigue" | "gaps" | "patterns", InsightItem[]>;
}

function sumStats(rows: AdRow[], key: "prev" | "curr") {
  return rows.reduce((a, r) => ({ spend: a.spend + r[key].spend, impressions: a.impressions + r[key].impressions, clicks: a.clicks + r[key].clicks, conversions: a.conversions + r[key].conversions, revenue: a.revenue + r[key].revenue }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
}
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const HOOK_TYPES: [string, RegExp][] = [
  ["POV / relatable", /^pov|stop scrolling/i],
  ["List / mistakes", /^\d|mistakes|things/i],
  ["Personal story", /i tried|founder|story/i],
  ["Proof / before-after", /before|after|unboxing|review/i],
  ["Offer / price", /₹|offer|gets you|price/i],
  ["Warning / contrarian", /don't|real reason|isn't/i],
];
const hookType = (h: string) => HOOK_TYPES.find(([, re]) => re.test(h))?.[0] ?? "Other";

export function analyzeCreatives(o: { ads: AdRow[]; creatives: Creative[]; knowledge?: ClientKnowledge[]; strategies?: StrategyDoc[]; clientNames?: Record<string, string> }): CreativeIntel {
  const ads = o.ads.filter((a) => a.format !== "Search"); // creative analysis = social / video / display ads
  const name = (id: string) => o.clientNames?.[id] ?? id;
  const T = sumStats(ads, "curr");
  const totals = { ads: ads.length, spend: T.spend, ctr: ctrOf(T), cpa: cpaOf(T) };

  // Hooks.
  const byHook = new Map<string, AdRow[]>();
  ads.forEach((a) => a.hook && byHook.set(a.hook, [...(byHook.get(a.hook) ?? []), a]));
  const hooks: HookStat[] = [...byHook.entries()]
    .map(([hook, rows]) => {
      const c = sumStats(rows, "curr");
      const p = sumStats(rows, "prev");
      return { hook, ads: rows.length, spend: c.spend, ctr: ctrOf(c), ctrPrev: ctrOf(p), cpa: cpaOf(c), roas: roasOf(c), conversions: c.conversions };
    })
    .sort((a, b) => b.ctr - a.ctr);

  // Formats.
  const byFormat = new Map<string, AdRow[]>();
  ads.forEach((a) => byFormat.set(a.format, [...(byFormat.get(a.format) ?? []), a]));
  const formats: FormatStat[] = [...byFormat.entries()]
    .map(([format, rows]) => {
      const c = sumStats(rows, "curr");
      return { format, ads: rows.length, spend: c.spend, ctr: ctrOf(c), cpa: cpaOf(c), roas: roasOf(c) };
    })
    .sort((a, b) => (a.cpa || Infinity) - (b.cpa || Infinity));

  // Weak openings: CTR < 60% of the platform median.
  const medByPlatform = new Map<string, number>();
  [...new Set(ads.map((a) => a.platform))].forEach((p) => medByPlatform.set(p, median(ads.filter((a) => a.platform === p && a.curr.impressions > 0).map((a) => ctrOf(a.curr)))));
  const weak: WeakAd[] = ads
    .filter((a) => a.status === "Active" && a.curr.impressions >= 1000 && ctrOf(a.curr) < 0.6 * (medByPlatform.get(a.platform) ?? 0))
    .map((a) => ({ adId: a.id, name: a.name, clientId: a.clientId, hook: a.hook, format: a.format, ctr: ctrOf(a.curr), benchmark: medByPlatform.get(a.platform) ?? 0, spend: a.curr.spend }))
    .sort((a, b) => a.ctr / (a.benchmark || 1) - b.ctr / (b.benchmark || 1));
  const weakCreatives = o.creatives.filter((c) => c.performance && c.performance.hookRate > 0 && c.performance.hookRate < 25).map((c) => ({ id: c.id, title: c.title, hookRate: c.performance!.hookRate, ctr: c.performance!.ctr }));

  // Fatigue: frequency > 4 and CTR falling week over week.
  const fatigue: FatiguedAd[] = ads
    .filter((a) => a.frequency > 4 && ctrOf(a.curr) < ctrOf(a.prev))
    .map((a) => ({ adId: a.id, name: a.name, clientId: a.clientId, campaignId: a.campaignId, hook: a.hook, format: a.format, frequency: a.frequency, ctrPrev: ctrOf(a.prev), ctrCurr: ctrOf(a.curr), drop: ctrOf(a.prev) ? ((ctrOf(a.prev) - ctrOf(a.curr)) / ctrOf(a.prev)) * 100 : 0, spend: a.curr.spend }))
    .sort((a, b) => b.drop - a.drop);

  // Messaging gaps: approved messaging / strategy pillars not present in live ads or creatives.
  const gaps: Gap[] = [];
  const clientIds = [...new Set([...ads.map((a) => a.clientId), ...o.creatives.map((c) => c.clientId)])];
  clientIds.forEach((cid) => {
    const liveText = [
      ...ads.filter((a) => a.clientId === cid && a.status === "Active").map((a) => `${a.hook ?? ""} ${a.name}`),
      ...o.creatives.filter((c) => c.clientId === cid && (c.status === "Live" || c.status === "Approved")).map((c) => `${c.angle ?? ""} ${c.hook ?? ""} ${c.title}`),
    ].join(" ");
    const kb = o.knowledge?.find((k) => k.clientId === cid);
    const strat = o.strategies?.filter((s) => s.clientId === cid && s.status === "Approved").sort((a, b) => b.version - a.version)[0];
    const candidates = [
      ...(kb?.approvedMessaging ?? []).map((a) => ({ angle: a, source: KB })),
      ...(strat?.sections.find((s) => s.key === "pillars")?.items.map((i) => ({ angle: i.text.split(" — ")[0]!, source: `Strategy v${strat.version} · content pillars` })) ?? []),
    ];
    candidates.forEach((c) => {
      if (!overlaps(liveText, c.angle) && !words(c.angle).some((w) => w.length > 5 && liveText.toLowerCase().includes(w))) gaps.push({ angle: c.angle, clientId: cid, source: c.source });
    });
  });

  // Patterns by hook type.
  const byType = new Map<string, AdRow[]>();
  ads.forEach((a) => a.hook && byType.set(hookType(a.hook), [...(byType.get(hookType(a.hook)) ?? []), a]));
  const types = [...byType.entries()].map(([t, rows]) => ({ t, n: rows.length, ctr: ctrOf(sumStats(rows, "curr")), cpa: cpaOf(sumStats(rows, "curr")) })).sort((a, b) => b.ctr - a.ctr);

  const src = ADS;
  const insights: CreativeIntel["insights"] = { hooks: [], formats: [], weak: [], fatigue: [], gaps: [], patterns: [] };
  const topH = hooks.slice(0, 3);
  topH.forEach((h) => insights.hooks.push({ kind: "data", source: src, text: `"${h.hook}" — CTR ${h.ctr.toFixed(2)}% (prev ${h.ctrPrev.toFixed(2)}%), CPA ${h.cpa ? money(h.cpa) : "—"}, ROAS ${h.roas.toFixed(2)}x across ${h.ads} ad(s)` }));
  if (topH[0] && totals.ctr) insights.hooks.push({ kind: "recommendation", text: `Brief 3 new variations of "${topH[0].hook}" — it runs ${Math.round((topH[0].ctr / totals.ctr - 1) * 100)}% above the account CTR average (${totals.ctr.toFixed(2)}%).` });
  formats.slice(0, 3).forEach((f) => insights.formats.push({ kind: "data", source: src, text: `${f.format}: ${f.ads} ad(s), CTR ${f.ctr.toFixed(2)}%, CPA ${f.cpa ? money(f.cpa) : "—"}, ROAS ${f.roas.toFixed(2)}x` }));
  if (formats[0] && formats.length > 1) insights.formats.push({ kind: "recommendation", text: `Shift new production toward ${formats[0].format} (lowest CPA); keep ${formats[formats.length - 1]!.format} to ≤ 20% of new ads until it improves.` });
  weak.slice(0, 4).forEach((w) => insights.weak.push({ kind: "data", source: src, text: `${w.name} (${name(w.clientId)}) — CTR ${w.ctr.toFixed(2)}% vs ${w.benchmark.toFixed(2)}% platform median${w.hook ? ` · hook "${w.hook}"` : ""}` }));
  weakCreatives.slice(0, 3).forEach((c) => insights.weak.push({ kind: "data", source: "Creative performance", text: `${c.title} — hook rate ${c.hookRate.toFixed(1)}% (< 25%)` }));
  if (weak.length || weakCreatives.length) insights.weak.push({ kind: "recommendation", text: "Re-cut the first 3 seconds: open on the outcome or a pattern-interrupt instead of the logo / intro." });
  fatigue.slice(0, 4).forEach((f) => insights.fatigue.push({ kind: "data", source: src, text: `${f.name} (${name(f.clientId)}) — frequency ${f.frequency}, CTR ${f.ctrPrev.toFixed(2)}% → ${f.ctrCurr.toFixed(2)}% (−${f.drop.toFixed(0)}% WoW)` }));
  if (fatigue.length) insights.fatigue.push({ kind: "recommendation", text: `Refresh ${fatigue.length} fatigued ad(s): new hook + first frame on the same angle, then rotate out the old version.` });
  gaps.slice(0, 5).forEach((g) => insights.gaps.push({ kind: "data", source: g.source, text: `${name(g.clientId)}: "${g.angle}" is approved but not used in any live ad or creative` }));
  if (gaps.length) insights.gaps.push({ kind: "recommendation", text: "Generate concepts for the uncovered angles — they're pre-approved, so client review should be faster." });
  types.slice(0, 3).forEach((t) => insights.patterns.push({ kind: "data", source: src, text: `${t.t} hooks: ${t.n} ad(s), CTR ${t.ctr.toFixed(2)}%, CPA ${t.cpa ? money(t.cpa) : "—"}` }));
  if (types.length > 1) insights.patterns.push({ kind: "assumption", text: `${types[0]!.t} hooks likely win because they create immediate self-identification; ${types[types.length - 1]!.t} hooks underperform on cold audiences.` });
  const ugc = formats.find((f) => f.format === "UGC");
  const stat = formats.find((f) => f.format === "Static");
  if (ugc && stat && ugc.cpa && stat.cpa) insights.patterns.push({ kind: "data", source: src, text: `UGC CPA ${money(ugc.cpa)} vs Static ${money(stat.cpa)} (${ugc.cpa < stat.cpa ? "UGC cheaper" : "Static cheaper"})` });
  return { totals, hooks, formats, weak, weakCreatives, fatigue, gaps, insights };
}

// Creative brief for refreshing a fatigued ad.
export function refreshBrief(f: FatiguedAd, k?: ClientKnowledge) {
  return [
    `Ad: ${f.name} (${f.format})`,
    `Why: frequency ${f.frequency} and CTR fell ${f.ctrPrev.toFixed(2)}% → ${f.ctrCurr.toFixed(2)}% week over week (−${f.drop.toFixed(0)}%). Source: ad platform data.`,
    `Keep: the angle${f.hook ? ` behind "${f.hook}"` : ""} — it has proven demand.`,
    "Change: new opening 3 seconds, new first frame / thumbnail, fresh creator or setting; 2–3 variations.",
    k?.toneWords?.length ? `Tone: ${k.toneWords.join(", ")}.` : "",
    k?.rejectedConcepts?.length ? `Avoid: ${k.rejectedConcepts.join("; ")}.` : "",
    "Deliver: 9:16 + 1:1 cuts, captions burned in. Upload to Creative Studio for internal review.",
  ].filter(Boolean).join("\n");
}
