// Strategy Agent — deterministic local engine.
// Pure module (no store / React imports) so seeds and the UI share it.
// Every section line is tagged data / assumption / recommendation.

import type { Campaign, Client, ClientKnowledge, InsightItem, Service, StrategyDoc, StrategyInputs, StrategyPersona, StrategySection } from "../types";
import { SERVICES } from "../types";
import { compactMoney, money } from "../utils";

// ---------- Performance snapshot (last 30 days of connected campaign data) ----------
export interface ChannelPerf {
  service: Service;
  spend: number;
  leads: number;
  conversions: number;
  revenue: number;
  clicks: number;
  impressions: number;
  roas: number;
  cpa: number;
  ctr: number;
  campaigns: number;
}
export interface PerfSnapshot {
  spend: number;
  leads: number;
  conversions: number;
  revenue: number;
  clicks: number;
  impressions: number;
  roas: number;
  cpa: number;
  ctr: number;
  campaigns: number;
  byService: ChannelPerf[];
}

const ratio = (a: number, b: number) => (b ? a / b : 0);

export function performanceSnapshot(campaigns: Campaign[], days = 30): PerfSnapshot {
  const by = new Map<Service, ChannelPerf>();
  for (const c of campaigns) {
    const rows = c.metrics.slice(-days);
    if (!rows.length) continue;
    const cur = by.get(c.service) ?? { service: c.service, spend: 0, leads: 0, conversions: 0, revenue: 0, clicks: 0, impressions: 0, roas: 0, cpa: 0, ctr: 0, campaigns: 0 };
    cur.campaigns += 1;
    for (const m of rows) {
      cur.spend += m.spend;
      cur.leads += m.leads;
      cur.conversions += m.conversions;
      cur.revenue += m.revenue;
      cur.clicks += m.clicks;
      cur.impressions += m.impressions;
    }
    by.set(c.service, cur);
  }
  const byService = [...by.values()].map((x) => ({ ...x, roas: ratio(x.revenue, x.spend), cpa: ratio(x.spend, x.conversions), ctr: ratio(x.clicks, x.impressions) * 100 }));
  const t = byService.reduce(
    (a, x) => ({ spend: a.spend + x.spend, leads: a.leads + x.leads, conversions: a.conversions + x.conversions, revenue: a.revenue + x.revenue, clicks: a.clicks + x.clicks, impressions: a.impressions + x.impressions, campaigns: a.campaigns + x.campaigns }),
    { spend: 0, leads: 0, conversions: 0, revenue: 0, clicks: 0, impressions: 0, campaigns: 0 },
  );
  return { ...t, roas: ratio(t.revenue, t.spend), cpa: ratio(t.spend, t.conversions), ctr: ratio(t.clicks, t.impressions) * 100, byService: byService.sort((a, b) => b.spend - a.spend) };
}

export function describePerformance(p: PerfSnapshot) {
  if (!p.campaigns) return "No connected campaign data yet.";
  return `Last 30 days: ${compactMoney(p.spend)} spend · ${p.leads.toLocaleString("en-IN")} leads · ${p.conversions.toLocaleString("en-IN")} conversions · CPA ${money(p.cpa)} · ROAS ${p.roas.toFixed(2)}x across ${p.campaigns} campaign(s)`;
}

// ---------- Industry playbooks ----------
type Stage = StrategyDoc["funnel"][number]["stage"];
interface PersonaTpl {
  name: string;
  profile: string;
  pains: string[];
  motivations: string[];
  channels: string[];
}
interface Playbook {
  key: string;
  match: RegExp;
  goal: "leads" | "sales";
  weights: Partial<Record<Service, number>>;
  benchmarks: { cpa: number; ctr: number; cvr: number; roas?: number };
  product: string;
  audience: string;
  goals: string;
  personas: PersonaTpl[];
  pillars: string[];
  angles: string[];
  proof: string;
}

const PLAYBOOKS: Playbook[] = [
  {
    key: "d2c", match: /d2c|e-?commerce|retail|beauty|fashion/i, goal: "sales",
    weights: { "Meta Ads": 40, "Google Ads": 20, "Influencer Marketing": 15, "Retail Media": 10, "Social Media": 10, "Quick Commerce": 5 },
    benchmarks: { cpa: 650, ctr: 1.2, cvr: 2.5, roas: 3 },
    product: "Hero SKUs and bundles sold on the website and marketplaces", audience: "Women 24-40 in metros, wellness and clean-beauty interests", goals: "Grow profitable online revenue at ≥ 3x blended ROAS and build repeat purchase",
    personas: [
      { name: "The Conscious Urban Buyer", profile: "Working professional 26-35, reads labels, buys online monthly", pains: ["Unsure which products are genuinely clean", "Too many look-alike brands"], motivations: ["Ingredient transparency", "Visible results"], channels: ["Instagram Reels", "Google Search", "Creators"] },
      { name: "The Gifting Parent", profile: "Parent 32-45 buying for family, price-aware but loyal once convinced", pains: ["Worried about chemicals for kids", "Delivery reliability"], motivations: ["Safety certifications", "Bundles & value packs"], channels: ["Facebook", "WhatsApp", "Marketplaces"] },
      { name: "The Deal Hunter", profile: "Student / early-career 20-26, discovers via creators and sales", pains: ["Tight budget"], motivations: ["Offers", "Social proof"], channels: ["Instagram", "Quick-commerce apps"] },
    ],
    pillars: ["Ingredient education", "Real results & reviews", "Founder & sourcing story", "Rituals & how-to", "Offers & drops"],
    angles: ["Ingredient transparency", "Before / after results", "Founder story", "Value bundle", "Creator unboxing"], proof: "reviews, certifications and repeat-purchase rate",
  },
  {
    key: "realestate", match: /real ?estate|realty|property|housing/i, goal: "leads",
    weights: { "Google Ads": 35, "Meta Ads": 35, Programmatic: 10, "Social Media": 10, SEO: 10 },
    benchmarks: { cpa: 1800, ctr: 0.9, cvr: 1.2 },
    product: "Residential projects — site visits and bookings", audience: "In-market home buyers 30-50, top-20% income, metro", goals: "Generate qualified site-visit leads at a sustainable cost per qualified lead",
    personas: [
      { name: "The Upgrading Family", profile: "Couple 32-45 moving from rented / smaller home", pains: ["Delivery delays", "Hidden costs"], motivations: ["Possession date certainty", "Schools & connectivity"], channels: ["Google Search", "Property portals", "Facebook"] },
      { name: "The NRI Investor", profile: "Overseas professional 35-55 buying for investment or return", pains: ["Can't visit the site", "Trust in developer"], motivations: ["Rental yield", "Virtual walkthroughs"], channels: ["YouTube", "Meta", "WhatsApp"] },
    ],
    pillars: ["Project progress updates", "Neighbourhood & lifestyle", "Buyer testimonials", "Financing explainers", "Launch offers"],
    angles: ["Possession certainty", "Location advantage", "Price-lock offer", "Virtual site visit", "Customer testimonial"], proof: "RERA registration, construction progress and delivered projects",
  },
  {
    key: "education", match: /educat|academy|edtech|coaching|school|learning/i, goal: "leads",
    weights: { "Google Ads": 40, "Meta Ads": 30, SEO: 15, "Social Media": 10, Programmatic: 5 },
    benchmarks: { cpa: 900, ctr: 1.1, cvr: 3 },
    product: "Courses and test-prep programmes (demo class → enrolment)", audience: "Parents 35-50 and aspirants 18-24 with test-prep intent", goals: "Fill upcoming batches with demo-class bookings that convert to enrolments",
    personas: [
      { name: "The Anxious Parent", profile: "Parent 38-50 choosing coaching for a teen", pains: ["Unclear results claims", "Fee vs outcome"], motivations: ["Toppers & results", "Faculty credibility"], channels: ["Google Search", "YouTube", "WhatsApp"] },
      { name: "The Self-driven Aspirant", profile: "Student 17-24 researching options online", pains: ["Information overload", "Schedule clashes"], motivations: ["Free demo / mock test", "Flexible batches"], channels: ["Instagram", "YouTube Shorts"] },
    ],
    pillars: ["Results & toppers", "Free study hacks", "Faculty spotlights", "Exam calendar & deadlines", "Student stories"],
    angles: ["Free demo class", "Topper results", "Exam deadline urgency", "Faculty credibility", "Study hack"], proof: "results, rank holders and demo-class conversion",
  },
  {
    key: "hospitality", match: /hospitality|hotel|stay|travel|resort/i, goal: "sales",
    weights: { "Meta Ads": 35, "Google Ads": 25, "Influencer Marketing": 20, "Social Media": 15, SEO: 5 },
    benchmarks: { cpa: 1500, ctr: 1.3, cvr: 1.8, roas: 4 },
    product: "Room nights and experience packages booked direct", audience: "Couples & friends 25-40 with weekend-getaway intent, metro origin", goals: "Grow direct bookings and reduce OTA dependence",
    personas: [
      { name: "The Weekend Escaper", profile: "Couple 26-38 planning 2-3 night trips", pains: ["Photos don't match reality", "Hidden fees"], motivations: ["Aesthetic stays", "Best-price direct"], channels: ["Instagram Reels", "Creators", "Google Hotels"] },
      { name: "The Group Planner", profile: "Friends group organiser 24-34", pains: ["Coordinating budgets"], motivations: ["Packages & inclusions"], channels: ["Instagram", "WhatsApp"] },
    ],
    pillars: ["Experiences & views", "Guest stories", "Local guides", "Behind the scenes", "Seasonal offers"],
    angles: ["Book-direct perk", "Experience reel", "Creator stay vlog", "Limited-date offer", "Guest review"], proof: "guest reviews and ratings",
  },
  {
    key: "healthcare", match: /health|clinic|hospital|medical|pharma|wellness/i, goal: "leads",
    weights: { "Google Ads": 45, "Meta Ads": 25, SEO: 20, "Social Media": 10 },
    benchmarks: { cpa: 700, ctr: 2.5, cvr: 4 },
    product: "Consultations and diagnostic packages", audience: "Adults 30-60 within 10km of clinics, symptom-search intent", goals: "Increase booked consultations from high-intent local searches",
    personas: [
      { name: "The Symptom Searcher", profile: "Adult 30-55 searching symptoms and specialists nearby", pains: ["Long waits", "Trust in doctors"], motivations: ["Nearby, same-day slots", "Specialist credentials"], channels: ["Google Search", "Maps"] },
      { name: "The Family Caretaker", profile: "Adult 35-50 managing parents' health", pains: ["Coordinating tests"], motivations: ["Packages & home collection"], channels: ["Facebook", "WhatsApp"] },
    ],
    pillars: ["Doctor-led education", "Patient stories", "Preventive health", "Clinic facilities", "Health packages"],
    angles: ["Same-day appointment", "Doctor explains", "Preventive package", "Patient story", "Home sample collection"], proof: "doctor credentials and patient reviews (compliant with medical ad policies)",
  },
  {
    key: "fnb", match: /food|beverage|restaurant|kitchen|cafe|f&b/i, goal: "sales",
    weights: { "Meta Ads": 40, "Influencer Marketing": 20, "Social Media": 20, "Quick Commerce": 10, "Google Ads": 10 },
    benchmarks: { cpa: 250, ctr: 1.4, cvr: 4, roas: 3.5 },
    product: "Dine-in covers and delivery orders", audience: "Foodies 21-35, delivery-app users in the city", goals: "Increase orders and repeat visits in the core delivery radius",
    personas: [
      { name: "The Weeknight Orderer", profile: "Working professional 23-32 ordering 2-3x a week", pains: ["Same boring options", "Late deliveries"], motivations: ["Combos & offers", "Consistent taste"], channels: ["Instagram", "Delivery apps"] },
      { name: "The Weekend Explorer", profile: "Friends & couples 21-35 hunting new spots", pains: ["Overhyped places"], motivations: ["Creator recommendations", "Signature dishes"], channels: ["Reels", "Creators", "Google Maps"] },
    ],
    pillars: ["Signature dishes", "Kitchen behind the scenes", "Creator visits", "Offers & combos", "Customer reactions"],
    angles: ["Signature dish close-up", "Combo value", "Creator taste test", "Chef story", "Limited-time menu"], proof: "ratings on delivery apps and repeat orders",
  },
  {
    key: "fintech", match: /fintech|finance|bank|lending|insur|invest/i, goal: "leads",
    weights: { "Google Ads": 30, "Meta Ads": 25, Programmatic: 20, "LinkedIn Ads": 15, SEO: 10 },
    benchmarks: { cpa: 1100, ctr: 0.8, cvr: 2 },
    product: "Financial products — sign-ups and funded / activated accounts", audience: "Salaried professionals 25-45 with credit / investing intent", goals: "Acquire activated users at a CAC below lifetime value, with brand trust",
    personas: [
      { name: "The Young Investor", profile: "Salaried 25-32 starting to invest", pains: ["Jargon", "Fear of losing money"], motivations: ["Simple app", "Low minimums"], channels: ["YouTube", "Instagram", "Google Search"] },
      { name: "The Busy Professional", profile: "Manager 32-45 optimising taxes and credit", pains: ["Paperwork", "Trust & security"], motivations: ["Speed", "Regulated & secure"], channels: ["LinkedIn", "Programmatic news sites"] },
    ],
    pillars: ["Money explainers", "Product walkthroughs", "Trust & security", "User stories", "Market moments"],
    angles: ["Simple explainer", "Security & regulation", "Instant approval", "User success story", "Tax-season urgency"], proof: "regulatory status, security and app ratings",
  },
  {
    key: "fitness", match: /fitness|gym|yoga|sport/i, goal: "leads",
    weights: { "Meta Ads": 45, "Google Ads": 20, "Social Media": 20, "Influencer Marketing": 15 },
    benchmarks: { cpa: 500, ctr: 1.3, cvr: 3.5 },
    product: "Memberships and trial passes", audience: "Fitness-curious 22-38 with gym and home-workout interests", goals: "Drive trial sign-ups that convert to paid memberships",
    personas: [
      { name: "The Restarter", profile: "Professional 26-38 who has quit gyms before", pains: ["Intimidation", "Lack of time"], motivations: ["Coaching & community", "Short workouts"], channels: ["Instagram Reels", "WhatsApp"] },
      { name: "The Goal Chaser", profile: "Active 22-30 training for an event or physique goal", pains: ["Plateaus"], motivations: ["Expert programmes", "Progress tracking"], channels: ["Instagram", "YouTube", "Google Search"] },
    ],
    pillars: ["Transformations", "Quick workouts", "Coach tips", "Community & events", "Trial offers"],
    angles: ["Free trial week", "Transformation story", "15-minute workout", "Coach tip", "Community vibe"], proof: "member transformations and retention",
  },
];
const DEFAULT_PLAYBOOK: Playbook = {
  key: "default", match: /.*/, goal: "leads",
  weights: { "Meta Ads": 40, "Google Ads": 35, "Social Media": 15, SEO: 10 },
  benchmarks: { cpa: 900, ctr: 1.1, cvr: 2.5 },
  product: "Core offering", audience: "Primary buyers 25-45 in target cities", goals: "Grow qualified demand at an efficient cost per acquisition",
  personas: [
    { name: "The Active Evaluator", profile: "Decision maker comparing options online", pains: ["Unclear differentiation"], motivations: ["Proof & reviews"], channels: ["Google Search", "Meta"] },
    { name: "The Passive Browser", profile: "Potential buyer not yet in-market", pains: ["Low awareness"], motivations: ["Useful content"], channels: ["Instagram", "YouTube"] },
  ],
  pillars: ["Education", "Proof & testimonials", "Product in action", "Behind the scenes", "Offers"],
  angles: ["Problem → solution", "Testimonial", "Demo", "Offer", "Founder story"], proof: "reviews and case studies",
};

export const playbookFor = (industry?: string) => PLAYBOOKS.find((p) => p.match.test(industry ?? "")) ?? DEFAULT_PLAYBOOK;

// Channel roles in the funnel and campaign structures.
const ROLE: Partial<Record<Service, Stage[]>> = {
  "Meta Ads": ["Awareness", "Conversion"], "Google Ads": ["Conversion", "Consideration"], "LinkedIn Ads": ["Consideration"], Programmatic: ["Awareness"],
  "Retail Media": ["Conversion"], "Quick Commerce": ["Conversion"], SEO: ["Consideration"], "Social Media": ["Consideration", "Retention"], "Influencer Marketing": ["Awareness", "Consideration"],
  "AI Automation": ["Retention"], "Video Production": ["Awareness"], "Brand Strategy": ["Awareness"], Consulting: ["Consideration"],
};
const STRUCTURE: Partial<Record<Service, string>> = {
  "Meta Ads": "Prospecting (broad + 1% lookalikes, Advantage+) · Retargeting 7/30-day engagers & visitors · 3–5 creatives per ad set, CBO",
  "Google Ads": "Brand search (defend) · Generic high-intent search by theme · Performance Max with audience signals · Competitor terms (tested)",
  "LinkedIn Ads": "Job-title & company-size targeting · Document ads + lead-gen forms · Retarget video viewers",
  Programmatic: "Contextual + in-market segments on premium publishers · Frequency cap 3/week · Site-visit retargeting",
  "Retail Media": "Sponsored products on hero SKUs · Sponsored brand for category terms · Defend branded searches",
  "Quick Commerce": "Search ads on category keywords · Homepage banners during peak hours in top pin codes",
  SEO: "Technical fixes → money pages → cluster content around commercial keywords",
  "Social Media": "Organic calendar 4–5 posts/week across pillars · Boost top-performing posts to warm audiences",
  "Influencer Marketing": "Micro-creators (10–100K) for trust + 1–2 macro for reach · Whitelist best content as paid ads",
  "AI Automation": "WhatsApp lead nurture + CRM routing within 5 minutes of lead capture",
};
const PLATFORM_FOR: Partial<Record<Service, string>> = {
  "Meta Ads": "Meta (FB + IG)", "Google Ads": "Google Search + PMax", "LinkedIn Ads": "LinkedIn Campaign Manager", Programmatic: "DV360", "Retail Media": "Amazon Ads",
  "Quick Commerce": "Blinkit + Zepto Ads", SEO: "Organic Search", "Social Media": "Instagram + LinkedIn", "Influencer Marketing": "Instagram creators", "AI Automation": "WhatsApp + CRM",
};
export const platformForChannel = (ch: string) => PLATFORM_FOR[ch as Service] ?? ch;
export const isServiceChannel = (ch: string): ch is Service => (SERVICES as readonly string[]).includes(ch);
export const stageForChannel = (ch: string): Stage => ROLE[ch as Service]?.[0] ?? "Consideration";

// ---------- Inputs derived from the client record ----------
export interface StrategySource {
  client?: Pick<Client, "id" | "company" | "industry" | "location" | "services" | "monthlyAdSpend" | "retainer">;
  campaigns: Campaign[]; // this client's campaigns
  knowledge?: ClientKnowledge;
}

export function deriveStrategyInputs(src: StrategySource, budget?: number): StrategyInputs {
  const { client, campaigns, knowledge } = src;
  const pb = playbookFor(client?.industry);
  const perf = performanceSnapshot(campaigns);
  const active = campaigns.filter((c) => c.status === "Active");
  const activeBudget = active.reduce((a, c) => a + c.budget, 0);
  const products = knowledge?.products?.length ? knowledge.products.map((p) => `${p.name}${p.price ? ` (${p.price})` : ""} — ${p.usp}`).join("; ") : pb.product;
  const audience = knowledge?.audience || campaigns.find((c) => c.audience)?.audience || pb.audience;
  const channels = [...new Set([...(client?.services ?? []), ...active.map((c) => c.platform)])].join(", ");
  return {
    business: client ? `${client.company} — ${client.industry}, based in ${client.location}` : "",
    product: products,
    audience,
    geography: client ? `${client.location} + top metros (India)` : "India",
    goals: pb.goals,
    monthlyBudget: Math.round(budget || client?.monthlyAdSpend || activeBudget || 300000),
    currentPerformance: describePerformance(perf),
    competitors: knowledge?.competitors?.join(", ") ?? "",
    channels,
  };
}

// Which knowledge-base / client fields the engine used (shown in the "Context used" panel).
export function strategyContextUsed(src: StrategySource): { label: string; value: string }[] {
  const k = src.knowledge;
  const out: { label: string; value: string }[] = [];
  if (src.client) out.push({ label: "Client record", value: `${src.client.industry} · ${src.client.location} · ${src.client.services.join(", ")}` });
  const perf = performanceSnapshot(src.campaigns);
  if (perf.campaigns) out.push({ label: "Campaign performance (30d)", value: `${perf.campaigns} campaign(s) · ${compactMoney(perf.spend)} spend` });
  if (k?.brandVoice) out.push({ label: "Brand voice", value: k.brandVoice });
  if (k?.toneWords?.length) out.push({ label: "Tone words", value: k.toneWords.join(", ") });
  if (k?.products?.length) out.push({ label: "Products", value: k.products.map((p) => p.name).join(", ") });
  if (k?.audience) out.push({ label: "Audience", value: k.audience });
  if (k?.competitors?.length) out.push({ label: "Competitors", value: k.competitors.join(", ") });
  if (k?.approvedMessaging?.length) out.push({ label: "Approved messaging", value: `${k.approvedMessaging.length} line(s)` });
  if (k?.rejectedConcepts?.length) out.push({ label: "Rejected concepts (avoided)", value: `${k.rejectedConcepts.length} concept(s)` });
  if (k?.history?.length) out.push({ label: "Campaign learnings", value: `${k.history.length} learning(s)` });
  if (!k) out.push({ label: "Knowledge base", value: "Not filled yet — industry playbook assumptions used instead" });
  return out;
}

// ---------- Budget allocation ----------
// Integer percentages that sum to exactly 100 (largest remainder) and amounts that sum to the budget.
export function allocate(weights: { channel: string; w: number }[], total: number) {
  if (!weights.length) return [];
  if (weights.every((x) => x.w <= 0)) weights = weights.map((x) => ({ ...x, w: 1 }));
  const W = weights.reduce((a, x) => a + x.w, 0) || 1;
  const raw = weights.map((x) => (x.w / W) * 100);
  const pcts = raw.map(Math.floor);
  let rest = 100 - pcts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let j = 0; rest > 0; j = (j + 1) % order.length, rest--) pcts[order[j]!.i]! += 1;
  return withAmounts(weights.map((x, i) => ({ channel: x.channel, pct: pcts[i]! })), total);
}
export function withAmounts<T extends { pct: number }>(rows: T[], total: number): (T & { amount: number })[] {
  let used = 0;
  return rows.map((r, i) => {
    const amount = i === rows.length - 1 ? Math.round(total) - used : Math.round((total * r.pct) / 100);
    used += amount;
    return { ...r, amount };
  });
}
// Rescales edited percentages back to 100 (keeps proportions) and recomputes amounts.
export function normalizeBudget(rows: StrategyDoc["budget"], total: number): StrategyDoc["budget"] {
  const alloc = allocate(rows.map((r) => ({ channel: r.channel, w: Math.max(0, r.pct) })), total);
  return rows.map((r, i) => ({ ...r, pct: alloc[i]!.pct, amount: alloc[i]!.amount }));
}

// ---------- Generator ----------
export interface GenerateStrategyOpts {
  inputs: StrategyInputs;
  industry?: string;
  clientId?: string;
  leadId?: string;
  company?: string;
  campaigns?: Campaign[];
  knowledge?: ClientKnowledge;
  ownerId: string;
  id: string;
  version?: number;
  now?: string;
  status?: StrategyDoc["status"];
}

const DATA_SRC = "Connected ad platforms · last 30 days";
const KB_SRC = "Client knowledge base";
const IN_SRC = "Strategy inputs";

const splitList = (s: string) => s.split(/[,;+/]| and /i).map((x) => x.trim()).filter(Boolean);

export function generateStrategy(o: GenerateStrategyOpts): StrategyDoc {
  const { inputs, knowledge } = o;
  const pb = playbookFor(o.industry ?? inputs.business);
  const perf = performanceSnapshot(o.campaigns ?? []);
  const budget = Math.max(0, Math.round(inputs.monthlyBudget || 0));
  const name = o.company ?? (inputs.business.split(" — ")[0] || "Client");
  const geos = splitList(inputs.geography);
  const existing = inputs.channels.toLowerCase();
  const perfBy = new Map(perf.byService.map((p) => [p.service, p]));
  const bm = pb.benchmarks;

  // 1) Channel weights: playbook → budget-size pruning → current-performance adjustment.
  const notes = new Map<string, InsightItem[]>();
  const note = (ch: string, it: InsightItem) => notes.set(ch, [...(notes.get(ch) ?? []), it]);
  let weights = Object.entries(pb.weights).map(([channel, w]) => ({ channel, w: w! }));
  for (const x of weights) {
    const svc = x.channel as Service;
    const p = perfBy.get(svc);
    if (p && p.spend > 0) {
      const good = pb.goal === "sales" ? p.roas >= (bm.roas ?? 3) : p.cpa > 0 && p.cpa <= bm.cpa;
      const bad = pb.goal === "sales" ? p.roas < (bm.roas ?? 3) * 0.5 : p.cpa > bm.cpa * 1.6;
      if (good) x.w *= 1.2;
      if (bad) x.w *= 0.8;
      note(x.channel, { kind: "data", source: DATA_SRC, text: `${x.channel} currently: ${compactMoney(p.spend)} spend, CPA ${money(p.cpa)}, ROAS ${p.roas.toFixed(2)}x, CTR ${p.ctr.toFixed(2)}%` });
      if (good) note(x.channel, { kind: "recommendation", text: `Weight increased ~20% — beats the ${pb.goal === "sales" ? `${bm.roas ?? 3}x ROAS` : `${money(bm.cpa)} CPA`} industry benchmark` });
      if (bad) note(x.channel, { kind: "recommendation", text: `Weight reduced ~20% until efficiency recovers — trailing the industry benchmark` });
    } else if (existing.includes(x.channel.toLowerCase().split(" ")[0]!)) {
      x.w *= 1.1;
      note(x.channel, { kind: "assumption", text: `Already an existing channel per inputs — small continuity bonus, no 30-day data to judge efficiency` });
    }
  }
  weights.sort((a, b) => b.w - a.w);
  const maxChannels = budget < 150000 ? 2 : budget < 500000 ? 4 : 6;
  const minSpend = budget < 500000 ? 25000 : 60000;
  weights = weights.slice(0, maxChannels);
  const W = weights.reduce((a, x) => a + x.w, 0);
  weights = weights.filter((x, i) => i < 2 || (budget * x.w) / W >= minSpend);
  const alloc = allocate(weights, budget);
  const budgetRows: StrategyDoc["budget"] = alloc.map((r) => {
    const svc = r.channel as Service;
    const role = ROLE[svc]?.join(" + ") ?? "Consideration";
    const p = perfBy.get(svc);
    return { channel: r.channel, pct: r.pct, amount: r.amount, rationale: `${role}. ${p ? `Current ROAS ${p.roas.toFixed(2)}x / CPA ${money(p.cpa)} (data).` : "No history — benchmark-based (assumption)."}` };
  });

  // 2) KPI targets.
  const cpaTarget = perf.cpa > 0 ? Math.round(Math.min(perf.cpa * 0.9, bm.cpa * 1.2)) : bm.cpa;
  const conversions = cpaTarget ? Math.round(budget / cpaTarget) : 0;
  // Scaling spend usually dilutes ROAS: hold ~85% of today's ROAS when the plan scales > 20%, else aim +5%; never below benchmark.
  const scaling = perf.spend > 0 && budget > perf.spend * 1.2;
  const roasTarget = bm.roas ? Math.max(bm.roas, perf.roas ? +(perf.roas * (scaling ? 0.85 : 1.05)).toFixed(1) : 0) : undefined;
  const kpis: StrategyDoc["kpis"] = [
    { metric: "CTR (paid social)", target: `≥ ${bm.ctr.toFixed(1)}%`, stage: "Awareness" },
    { metric: "Thumb-stop / 3s hook rate", target: "≥ 30%", stage: "Awareness" },
    { metric: "Landing-page CVR", target: `≥ ${bm.cvr.toFixed(1)}%`, stage: "Consideration" },
    { metric: pb.goal === "sales" ? "Cost per purchase" : "Cost per qualified lead", target: `≤ ${money(cpaTarget)}`, stage: "Conversion" },
    { metric: pb.goal === "sales" ? "Purchases / month" : "Qualified leads / month", target: `≈ ${conversions.toLocaleString("en-IN")}`, stage: "Conversion" },
    ...(roasTarget ? [{ metric: "Blended ROAS", target: `≥ ${roasTarget.toFixed(1)}x`, stage: "Conversion" }] : []),
    { metric: pb.goal === "sales" ? "Repeat purchase rate (90d)" : "Lead → customer rate", target: pb.goal === "sales" ? "≥ 25%" : "≥ 12%", stage: "Retention" },
  ];

  // 3) Funnel.
  const stages: Stage[] = ["Awareness", "Consideration", "Conversion", "Retention"];
  const chFor = (s: Stage) => budgetRows.filter((b) => ROLE[b.channel as Service]?.includes(s)).map((b) => b.channel);
  const funnel: StrategyDoc["funnel"] = stages.map((stage) => ({
    stage,
    objective:
      stage === "Awareness" ? `Reach ${pb.personas[0]!.name.toLowerCase()} audiences in ${geos.slice(0, 2).join(" & ") || "target cities"}` :
      stage === "Consideration" ? `Build trust with ${pb.proof}` :
      stage === "Conversion" ? (pb.goal === "sales" ? "Convert warm traffic into purchases" : "Capture and qualify leads fast") :
      pb.goal === "sales" ? "Drive repeat purchase and referrals" : "Nurture leads to close and upsell",
    channels: chFor(stage).length ? chFor(stage) : stage === "Retention" ? ["Email / WhatsApp CRM"] : [budgetRows[0]?.channel ?? "Meta Ads"],
    kpi: kpis.find((k) => k.stage === stage)?.metric ?? "—",
  }));

  // 4) Personas — the first persona is grounded in the knowledge-base audience when present.
  const personas: StrategyPersona[] = pb.personas.map((p, i) => ({
    name: p.name,
    profile: i === 0 && knowledge?.audience ? `${knowledge.audience} (from knowledge base)` : `${p.profile}${geos[0] ? ` · ${geos[0]}` : ""}`,
    pains: p.pains,
    motivations: p.motivations,
    channels: p.channels,
  }));

  // 5) Testing roadmap.
  const angles = [...(knowledge?.approvedMessaging?.slice(0, 2) ?? []), ...pb.angles].slice(0, 4);
  const testing: StrategyDoc["testing"] = [
    { week: "Weeks 1–2", test: `Hook test: ${angles.slice(0, 3).join(" vs ")}`, hypothesis: `A proof-led hook lifts CTR ≥ 20% over the current average` },
    { week: "Weeks 2–3", test: "Audience: broad vs 1% lookalike vs interest stack", hypothesis: "Broad with strong creative matches LAL CPA at larger scale" },
    { week: "Weeks 3–4", test: "Landing page: long-form vs short form-first", hypothesis: `Short page lifts CVR above ${bm.cvr.toFixed(1)}% for mobile traffic` },
    { week: "Weeks 5–6", test: pb.goal === "sales" ? "Offer: bundle vs % discount vs free shipping" : "Lead form: instant form vs landing page vs WhatsApp", hypothesis: pb.goal === "sales" ? "Bundles protect margin while matching discount CVR" : "WhatsApp capture improves lead quality (contact rate)" },
    { week: "Weeks 7–8", test: `Scale the winner +20% every 3 days on ${budgetRows[0]?.channel ?? "the lead channel"}`, hypothesis: "CPA stays within 15% of target while spend scales" },
  ];

  // 6) Narrative sections.
  const S = (key: string, title: string, items: InsightItem[]): StrategySection => ({ key, title, items });
  const strategyItems: InsightItem[] = [
    { kind: "data", source: IN_SRC, text: `Goal: ${inputs.goals}. Budget ${money(budget)}/month across ${geos.join(", ") || "India"}.` },
    perf.campaigns ? { kind: "data", source: DATA_SRC, text: describePerformance(perf) } : { kind: "assumption", text: `No campaign history yet — targets are based on ${o.industry ?? "industry"} benchmarks (CPA ≈ ${money(bm.cpa)}, CTR ≈ ${bm.ctr}%).` },
    knowledge?.brandVoice ? { kind: "data", source: KB_SRC, text: `Brand voice: ${knowledge.brandVoice}${knowledge.toneWords.length ? ` (${knowledge.toneWords.join(", ")})` : ""}` } : { kind: "assumption", text: "Brand voice not yet captured in the knowledge base — confirm with the client before creative production." },
    { kind: "assumption", text: `${inputs.audience} is the highest-value segment; ${pb.personas.length} personas cover the core demand.` },
    { kind: "recommendation", text: `Position ${name} on ${pb.angles[0]!.toLowerCase()} backed by ${pb.proof}; lead spend on ${budgetRows[0]?.channel ?? "paid social"} (${budgetRows[0]?.pct ?? 0}%).` },
    { kind: "recommendation", text: `North-star metric: ${kpis[3]!.metric} ${kpis[3]!.target}; review weekly, re-plan monthly.` },
  ];
  if (inputs.competitors) strategyItems.splice(3, 0, { kind: knowledge?.competitors?.length ? "data" : "assumption", source: knowledge?.competitors?.length ? KB_SRC : undefined, text: `Competitors to differentiate against: ${inputs.competitors}` });

  const funnelItems: InsightItem[] = funnel.flatMap((f) => [{ kind: "recommendation" as const, text: `${f.stage}: ${f.objective} via ${f.channels.join(", ")} — KPI ${f.kpi}` }]);
  funnelItems.push({ kind: "assumption", text: "Stage budget split follows channel roles; retention is largely owned media (email / WhatsApp / social)." });

  const channelItems: InsightItem[] = budgetRows.flatMap((b) => [
    { kind: "recommendation" as const, text: `${b.channel}: ${b.pct}% (${money(b.amount)}/mo) — role: ${ROLE[b.channel as Service]?.join(" + ") ?? "Consideration"}` },
    ...(notes.get(b.channel) ?? [{ kind: "assumption" as const, text: `${b.channel} share is from the ${pb.key === "default" ? "general" : o.industry ?? ""} playbook — no historical data for this client` }]),
  ]);
  const dropped = Object.keys(pb.weights).filter((c) => !budgetRows.some((b) => b.channel === c));
  if (dropped.length) channelItems.push({ kind: "recommendation", text: `Hold ${dropped.join(", ")} until the budget allows ≥ ${compactMoney(minSpend)}/mo per channel — spreading thinner slows learning.` });

  const campaignItems: InsightItem[] = budgetRows.map((b) => ({ kind: "recommendation" as const, text: `${b.channel}: ${STRUCTURE[b.channel as Service] ?? "Always-on programme with monthly optimisation"}` }));
  campaignItems.push({ kind: "recommendation", text: `Naming: ${name.replace(/\s+/g, "")}_<channel>_<stage>_<audience>_<yyyymm>; UTMs on every link for GA4 attribution.` });

  const creativeItems: InsightItem[] = [
    ...(knowledge?.approvedMessaging?.slice(0, 3).map((m) => ({ kind: "data" as const, source: KB_SRC, text: `Approved message to build on: "${m}"` })) ?? []),
    ...(knowledge?.rejectedConcepts?.length ? [{ kind: "data" as const, source: KB_SRC, text: `Avoid previously rejected concepts: ${knowledge.rejectedConcepts.slice(0, 3).join("; ")}` }] : []),
    { kind: "recommendation", text: `Angles to test: ${angles.join(" · ")}` },
    { kind: "recommendation", text: "Format mix: 50% 9:16 video (UGC + demo), 30% static / carousel, 20% creator content whitelisted as ads." },
    { kind: "recommendation", text: "Produce 6–8 new ads per month; retire any ad with frequency > 4 and falling CTR week over week." },
    { kind: "assumption", text: `Proof (${pb.proof}) will outperform lifestyle-only creative for this category.` },
  ];

  const pillarItems: InsightItem[] = pb.pillars.map((p, i) => ({ kind: "recommendation" as const, text: `${p} — ${["educate & build authority", "social proof", "brand story", "product in use", "conversion moments"][i] ?? "supporting"}` }));

  const budgetItems: InsightItem[] = [
    { kind: "data", source: IN_SRC, text: `Total monthly budget: ${money(budget)} — allocation sums to 100% / ${money(budgetRows.reduce((a, b) => a + b.amount, 0))}.` },
    { kind: "recommendation", text: "Keep 10–15% of each channel for testing new creatives and audiences." },
    { kind: "recommendation", text: "Re-allocate monthly toward the channel with the best marginal CPA; changes > 20% require approval." },
  ];
  if (perf.spend) budgetItems.splice(1, 0, { kind: "data", source: DATA_SRC, text: `Current 30-day spend is ${compactMoney(perf.spend)} — the plan is ${budget >= perf.spend ? "+" : ""}${Math.round(((budget - perf.spend) / Math.max(1, perf.spend)) * 100)}% vs current run-rate.` });

  const kpiItems: InsightItem[] = [
    { kind: perf.cpa ? "data" : "assumption", source: perf.cpa ? DATA_SRC : undefined, text: perf.cpa ? `Baseline CPA ${money(perf.cpa)} → target ${money(cpaTarget)} (−10% or capped near benchmark)` : `CPA target ${money(cpaTarget)} is the industry benchmark (no baseline yet)` },
    { kind: "recommendation", text: "Track stage KPIs weekly in the performance dashboard; report monthly with what changed and next month's plan." },
    { kind: "assumption", text: "Targets assume pixel / conversion API and GA4 events are correctly configured." },
  ];

  const now = o.now ?? new Date().toISOString();
  return {
    id: o.id,
    clientId: o.clientId,
    leadId: o.leadId,
    title: `${name} — Marketing strategy`,
    status: o.status ?? "Draft",
    inputs,
    summary: `${name}: ${money(budget)}/month plan focused on ${pb.goal === "sales" ? "profitable sales" : "qualified leads"} in ${geos.slice(0, 2).join(" & ") || "India"}. ${budgetRows.map((b) => `${b.channel} ${b.pct}%`).join(", ")}. Target ${kpis[3]!.metric.toLowerCase()} ${kpis[3]!.target}${roasTarget ? ` and ROAS ≥ ${roasTarget.toFixed(1)}x` : ""}.`,
    sections: [
      S("strategy", "Marketing strategy", strategyItems),
      S("funnel", "Funnel", funnelItems),
      S("channels", "Channel strategy", channelItems),
      S("campaigns", "Campaign strategy", campaignItems),
      S("creative", "Creative strategy", creativeItems),
      S("pillars", "Content pillars", pillarItems),
      S("budget", "Budget allocation notes", budgetItems),
      S("kpis", "KPI framework notes", kpiItems),
    ],
    personas,
    funnel,
    budget: budgetRows,
    kpis,
    testing,
    ownerId: o.ownerId,
    version: o.version ?? 1,
    createdAt: now,
    updatedAt: now,
  };
}

// Campaign drafts from the budget allocation ("Create campaigns from strategy").
export function campaignDraftsFromStrategy(doc: StrategyDoc) {
  const personaAudience = doc.inputs.audience;
  return doc.budget
    .filter((b) => b.amount > 0)
    .map((b) => {
      const stage = stageForChannel(b.channel);
      const objective = stage === "Awareness" ? "Awareness" : stage === "Conversion" ? (/purchase|sales|revenue/i.test(doc.inputs.goals) ? "Sales" : "Lead generation") : "Traffic";
      return {
        channel: b.channel,
        service: (isServiceChannel(b.channel) ? b.channel : "Brand Strategy") as Service,
        platform: platformForChannel(b.channel),
        objective,
        budget: b.amount,
        audience: personaAudience,
        campaignType: (objective === "Awareness" ? "Brand Awareness" : objective === "Sales" ? "Conversion" : objective === "Traffic" ? "Traffic" : "Lead Generation") as Campaign["campaignType"],
      };
    });
}

// ---------- Export ----------
const kindLabel = (k: InsightItem["kind"]) => (k === "data" ? "DATA" : k === "assumption" ? "ASSUMPTION" : "RECOMMENDATION");
export function strategyToMarkdown(doc: StrategyDoc, clientName?: string) {
  const L: string[] = [];
  L.push(`# ${doc.title}`, "", `**Client:** ${clientName ?? "—"} · **Status:** ${doc.status} · **Version:** v${doc.version} · **Updated:** ${doc.updatedAt.slice(0, 10)}`, "", `> ${doc.summary}`, "");
  L.push("## Inputs", "", ...Object.entries({ Business: doc.inputs.business, Product: doc.inputs.product, Audience: doc.inputs.audience, Geography: doc.inputs.geography, Goals: doc.inputs.goals, "Monthly budget": money(doc.inputs.monthlyBudget), "Current performance": doc.inputs.currentPerformance, Competitors: doc.inputs.competitors || "—", "Existing channels": doc.inputs.channels || "—" }).map(([k, v]) => `- **${k}:** ${v}`), "");
  L.push("## Customer personas", "");
  doc.personas.forEach((p) => L.push(`### ${p.name}`, p.profile, "", `- Pains: ${p.pains.join("; ")}`, `- Motivations: ${p.motivations.join("; ")}`, `- Channels: ${p.channels.join(", ")}`, ""));
  L.push("## Funnel", "", "| Stage | Objective | Channels | KPI |", "|---|---|---|---|", ...doc.funnel.map((f) => `| ${f.stage} | ${f.objective} | ${f.channels.join(", ")} | ${f.kpi} |`), "");
  L.push("## Budget allocation", "", "| Channel | % | ₹ / month | Rationale |", "|---|---:|---:|---|", ...doc.budget.map((b) => `| ${b.channel} | ${b.pct}% | ${money(b.amount)} | ${b.rationale} |`), `| **Total** | **${doc.budget.reduce((a, b) => a + b.pct, 0)}%** | **${money(doc.budget.reduce((a, b) => a + b.amount, 0))}** | |`, "");
  doc.sections.forEach((s) => L.push(`## ${s.title}`, "", ...s.items.map((i) => `- [${kindLabel(i.kind)}] ${i.text}${i.source ? ` _(${i.source})_` : ""}`), ""));
  L.push("## Testing roadmap", "", "| When | Test | Hypothesis |", "|---|---|---|", ...doc.testing.map((t) => `| ${t.week} | ${t.test} | ${t.hypothesis} |`), "");
  L.push("## KPI framework", "", "| Metric | Target | Stage |", "|---|---|---|", ...doc.kpis.map((k) => `| ${k.metric} | ${k.target} | ${k.stage} |`), "");
  L.push("---", "Legend: DATA = from connected sources / knowledge base · ASSUMPTION = AI inference · RECOMMENDATION = suggested action. Targets are estimates until validated.");
  return L.join("\n");
}
