// AI Performance Marketing (Media) engine — PURE: no store / "use client" imports so it can
// run in seeds, on the server or in the browser. Every number it emits is derived from the
// ad-platform rows (`ads`) and campaign daily metrics; anything inferred is labelled as an
// assumption or estimate.
import type { AdRow, AdStats, Campaign, Client, Recommendation } from "../types";
import { money } from "../utils";

export type AdPlatform = AdRow["platform"];

export const AD_PLATFORMS: AdPlatform[] = ["Meta", "Google", "LinkedIn", "Programmatic", "Amazon", "Blinkit"];

export const PLATFORM_LABEL: Record<AdPlatform, string> = {
  Meta: "Meta Ads",
  Google: "Google Ads",
  LinkedIn: "LinkedIn Ads",
  Programmatic: "Programmatic (DV360)",
  Amazon: "Retail media (Amazon Ads)",
  Blinkit: "Quick commerce (Blinkit / Zepto)",
};

// Integration registry key that backs each ad platform.
export const PLATFORM_INTEGRATION: Record<AdPlatform, string> = {
  Meta: "meta",
  Google: "google_ads",
  LinkedIn: "linkedin_ads",
  Programmatic: "dv360",
  Amazon: "amazon_ads",
  Blinkit: "blinkit",
};

export const SERVICE_PLATFORM: Partial<Record<Campaign["service"], AdPlatform>> = {
  "Meta Ads": "Meta",
  "Google Ads": "Google",
  "LinkedIn Ads": "LinkedIn",
  Programmatic: "Programmatic",
  "Retail Media": "Amazon",
  "Quick Commerce": "Blinkit",
};

// ---------- Metric helpers ----------
export const EMPTY_STATS: AdStats = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, leads: 0 };

export function addStats(a: AdStats, b: AdStats): AdStats {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    conversions: a.conversions + b.conversions,
    revenue: a.revenue + b.revenue,
    leads: a.leads + b.leads,
  };
}
export const sumStats = (xs: AdStats[]) => xs.reduce(addStats, EMPTY_STATS);

export interface Metrics extends AdStats {
  reach: number; // impressions / frequency (only when frequency is known)
  ctr: number; // %
  cpc: number;
  cpm: number;
  cpa: number; // 0 when there are no conversions
  roas: number;
  cvr: number; // click → conversion, %
}

export function derive(s: AdStats, frequency?: number): Metrics {
  return {
    ...s,
    reach: frequency && frequency > 0 ? Math.round(s.impressions / frequency) : 0,
    ctr: s.impressions ? (s.clicks / s.impressions) * 100 : 0,
    cpc: s.clicks ? s.spend / s.clicks : 0,
    cpm: s.impressions ? (s.spend / s.impressions) * 1000 : 0,
    cpa: s.conversions ? s.spend / s.conversions : 0,
    roas: s.spend ? s.revenue / s.spend : 0,
    cvr: s.clicks ? (s.conversions / s.clicks) * 100 : 0,
  };
}

/** % change prev → curr. NaN when there is no baseline (renders as "—"). */
export const change = (prev: number, curr: number) => (prev ? ((curr - prev) / Math.abs(prev)) * 100 : curr ? NaN : 0);
export const fmtChange = (v: number, d = 0) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(d)}%` : "—");

// Cost metrics: an increase is bad.
export const LOWER_IS_BETTER = new Set(["cpa", "cpc", "cpm"]);

// ---------- Ad-level analysis ----------
export type AdSignal = "Winner" | "Loser" | "Fatigue" | "Rising CPA" | "Scaling";

export interface AdAnalysis {
  ad: AdRow;
  prev: Metrics;
  curr: Metrics;
  d: { spend: number; ctr: number; cpc: number; cpm: number; cpa: number; roas: number; cvr: number; conversions: number };
  signals: AdSignal[];
  campaignCpa: number; // this week, all ads in the campaign
  campaignRoas: number;
  campaignSpend: number;
}

export function analyzeAds(ads: AdRow[]): AdAnalysis[] {
  const byCampaign = new Map<string, AdStats>();
  for (const a of ads) byCampaign.set(a.campaignId, addStats(byCampaign.get(a.campaignId) ?? EMPTY_STATS, a.curr));
  return ads.map((ad) => {
    const prev = derive(ad.prev, ad.frequency);
    const curr = derive(ad.curr, ad.frequency);
    const camp = derive(byCampaign.get(ad.campaignId) ?? EMPTY_STATS);
    const d = {
      spend: change(prev.spend, curr.spend),
      ctr: change(prev.ctr, curr.ctr),
      cpc: change(prev.cpc, curr.cpc),
      cpm: change(prev.cpm, curr.cpm),
      cpa: prev.conversions && curr.conversions ? change(prev.cpa, curr.cpa) : curr.conversions ? -100 : prev.conversions ? Infinity : 0,
      roas: change(prev.roas, curr.roas),
      cvr: change(prev.cvr, curr.cvr),
      conversions: change(prev.conversions, curr.conversions),
    };
    const signals: AdSignal[] = [];
    const fatigue = ad.frequency >= 3.5 && d.ctr <= -20;
    // Fatigue explains a decline on its own, so it takes precedence over "Loser".
    const loser =
      !fatigue && curr.spend > 0 &&
      ((curr.conversions === 0 && curr.spend >= 2000) || d.cpa >= 110 || (d.cpa >= 60 && (d.ctr <= -15 || (camp.cpa > 0 && curr.cpa >= 1.5 * camp.cpa))));
    const rising = !loser && d.cpa >= 25;
    const winner =
      !loser && !fatigue && curr.conversions >= 3 &&
      ((d.cpa <= -15 && d.ctr >= 0) || (camp.roas > 0 && curr.roas >= 1.4 * camp.roas && d.cpa <= -5));
    if (winner) signals.push("Winner");
    if (winner && ad.frequency < 3 && ad.status === "Active") signals.push("Scaling");
    if (loser) signals.push("Loser");
    if (fatigue) signals.push("Fatigue");
    if (rising) signals.push("Rising CPA");
    return { ad, prev, curr, d, signals, campaignCpa: camp.cpa, campaignRoas: camp.roas, campaignSpend: camp.spend };
  });
}

// ---------- Budget pacing ----------
export interface Pacing {
  budget: number;
  mtdSpend: number;
  expectedMtd: number;
  projected: number;
  pct: number; // projected month-end spend as % of monthly budget
  day: number;
  daysInMonth: number;
  last30: number;
  state: "Under" | "On track" | "Over" | "No data";
}

export function campaignPacing(c: Campaign): Pacing {
  const last = c.metrics[c.metrics.length - 1]?.date;
  const last30 = c.metrics.slice(-30).reduce((a, m) => a + m.spend, 0);
  if (!last) return { budget: c.budget, mtdSpend: 0, expectedMtd: 0, projected: 0, pct: 0, day: 0, daysInMonth: 30, last30, state: "No data" };
  const month = last.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = Number(last.slice(8, 10));
  const mtdSpend = c.metrics.filter((x) => x.date.startsWith(month)).reduce((a, x) => a + x.spend, 0);
  const expectedMtd = (c.budget * day) / daysInMonth;
  const projected = day ? (mtdSpend / day) * daysInMonth : 0;
  const pct = c.budget ? (projected / c.budget) * 100 : 0;
  const state = pct > 110 ? "Over" : pct < 85 ? "Under" : "On track";
  return { budget: c.budget, mtdSpend, expectedMtd, projected, pct, day, daysInMonth, last30, state };
}

// ---------- Recommendations ----------
export interface AnalyzeOptions {
  now?: string; // createdAt for generated recommendations
  idPrefix?: string; // make ids unique per run
  connectedPlatforms?: string[]; // integration keys that are connected; others are labelled sample data
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const n0 = (v: number) => Math.round(v).toLocaleString("en-IN");
const p2 = (v: number) => `${v.toFixed(2)}%`;
const x2 = (v: number) => `${v.toFixed(2)}x`;
const cpaStr = (m: Metrics) => (m.conversions ? money(m.cpa) : "no conversions");
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;

/**
 * Media agent: finds winners, losers, fatigue, scaling opportunities, budget inefficiencies,
 * audience, creative and funnel problems, and proposes actions. Nothing here executes —
 * the store routes approved actions through the approval modes.
 */
export function analyzeMedia(ads: AdRow[], campaigns: Campaign[], clients: Client[], opts: AnalyzeOptions = {}): Recommendation[] {
  const now = opts.now ?? new Date().toISOString();
  const prefix = opts.idPrefix ?? "rec_";
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Client";
  const sampleNote = (p: AdPlatform) => (opts.connectedPlatforms && !opts.connectedPlatforms.includes(PLATFORM_INTEGRATION[p]) ? " (sample data — not connected)" : "");
  const wow = (p: AdPlatform) => `${PLATFORM_LABEL[p]} · this week vs last week${sampleNote(p)}`;
  const week = (p: AdPlatform) => `${PLATFORM_LABEL[p]} · last 7 days${sampleNote(p)}`;

  const analyses = analyzeAds(ads);
  const active = analyses.filter((a) => a.ad.status === "Active" && campaignById.get(a.ad.campaignId)?.status !== "Completed");
  const byCampaign = new Map<string, AdAnalysis[]>();
  for (const a of analyses) byCampaign.set(a.ad.campaignId, [...(byCampaign.get(a.ad.campaignId) ?? []), a]);

  const out: (Recommendation & { _stake: number })[] = [];
  const push = (r: Omit<Recommendation, "id" | "agent" | "status" | "createdAt"> & { _stake: number; key: string }) => {
    const { key, ...rest } = r;
    out.push({ ...rest, id: `${prefix}${slug(r.category)}_${key}`, agent: "media", status: "New", createdAt: now });
  };

  const bestIn = (campaignId: string, exclude: string) =>
    (byCampaign.get(campaignId) ?? [])
      .filter((x) => x.ad.id !== exclude && x.ad.status === "Active" && x.curr.conversions > 0)
      .sort((a, b) => b.curr.roas - a.curr.roas)[0];

  // 1. Ad-level: losers, fatigue, rising CPA (creative / audience / funnel diagnosis).
  for (const a of active) {
    const { ad, prev, curr, d } = a;
    const camp = campaignById.get(ad.campaignId);
    const share = a.campaignSpend ? (curr.spend / a.campaignSpend) * 100 : 0;
    const baseEvidence = [
      { label: "Spend (7d)", value: `${money(curr.spend)} · ${share.toFixed(0)}% of campaign`, source: week(ad.platform) },
      { label: "CPA", value: `${cpaStr(prev)} → ${cpaStr(curr)} (${Number.isFinite(d.cpa) ? (d.cpa >= 0 ? "+" : "") + d.cpa.toFixed(0) + "%" : "new"})`, source: wow(ad.platform) },
    ];

    if (a.signals.includes("Loser")) {
      const best = bestIn(ad.campaignId, ad.id);
      const extraConv = a.campaignCpa ? curr.spend / a.campaignCpa - curr.conversions : 0;
      push({
        key: ad.id,
        clientId: ad.clientId,
        campaignId: ad.campaignId,
        adId: ad.id,
        title: `Pause "${ad.name}" — CPA ${Number.isFinite(d.cpa) ? `up ${d.cpa.toFixed(0)}%` : "with no conversions"}`,
        category: "Loser",
        finding: `CPA moved from ${cpaStr(prev)} to ${cpaStr(curr)} week over week while conversions went ${n0(prev.conversions)} → ${n0(curr.conversions)}. The campaign's average CPA this week is ${a.campaignCpa ? money(a.campaignCpa) : "—"}.`,
        why: `Conversion rate ${d.cvr < 0 ? "fell" : "moved"} ${Math.abs(d.cvr).toFixed(0)}% and CTR ${d.ctr < 0 ? "fell" : "moved"} ${Math.abs(d.ctr).toFixed(0)}% — ${Math.abs(d.cvr) > Math.abs(d.ctr) ? "the ad is converting worse after the click (message/offer mismatch is the likely cause)" : "fewer people are clicking (the hook is losing attention)"}.`,
        evidence: [
          ...baseEvidence,
          { label: "Campaign avg CPA (7d)", value: a.campaignCpa ? money(a.campaignCpa) : "—", source: week(ad.platform) },
          { label: "CVR", value: `${p2(prev.cvr)} → ${p2(curr.cvr)}`, source: wow(ad.platform) },
          { label: "CTR", value: `${p2(prev.ctr)} → ${p2(curr.ctr)}`, source: wow(ad.platform) },
          { label: "ROAS", value: `${x2(prev.roas)} → ${x2(curr.roas)}`, source: wow(ad.platform) },
        ],
        assumptions: ["Conversion tracking fired consistently in both weeks (not independently verified).", "No landing-page or offer change happened between the two periods."],
        recommendation: `Pause the ad and move its ~${money(curr.spend)}/week to ${best ? `"${best.ad.name}" (ROAS ${x2(best.curr.roas)})` : "the best-performing ad in the campaign"}.`,
        test: `Keep the concept alive with one new-hook variant on the same audience (${ad.audience}) for 5 days at ≤ ${money(curr.spend * 0.3)}.`,
        priority: share >= 20 || d.cpa >= 100 ? "High" : "Medium",
        impact: `Estimate: ~${money(curr.spend)}/week freed${extraConv > 0 ? `; at the campaign's average CPA that's ≈ ${extraConv.toFixed(0)} extra conversions/week if reallocated` : ""}.`,
        action: { type: "pause_ad", label: `Pause ${ad.name}` },
        _stake: curr.spend * 2,
      });
      continue;
    }

    if (a.signals.includes("Fatigue")) {
      push({
        key: ad.id,
        clientId: ad.clientId,
        campaignId: ad.campaignId,
        adId: ad.id,
        title: `Creative fatigue — refresh "${ad.name}"`,
        category: "Fatigue",
        finding: `Frequency is ${ad.frequency.toFixed(1)} and CTR dropped ${Math.abs(d.ctr).toFixed(0)}% (${p2(prev.ctr)} → ${p2(curr.ctr)}) week over week.`,
        why: "The same audience has seen this creative many times; declining CTR at high frequency is the classic fatigue pattern.",
        evidence: [
          { label: "Frequency (7d)", value: ad.frequency.toFixed(1), source: week(ad.platform) },
          { label: "CTR", value: `${p2(prev.ctr)} → ${p2(curr.ctr)}`, source: wow(ad.platform) },
          { label: "CPM", value: `${money(prev.cpm)} → ${money(curr.cpm)}`, source: wow(ad.platform) },
          ...baseEvidence,
          ...(ad.hook ? [{ label: "Hook", value: ad.hook, source: "Ad creative" }] : []),
        ],
        assumptions: ["Audience size is limited enough that frequency will keep rising if nothing changes."],
        recommendation: `Brief 2–3 new ${ad.format.toLowerCase()} variants with fresh hooks for ${ad.audience}; rotate them in and cap frequency.`,
        test: `Test a new opening 3 seconds vs the current hook${ad.hook ? ` ("${ad.hook}")` : ""} — same offer, same audience, 50/50 budget split.`,
        priority: ad.frequency >= 5 || share >= 25 ? "High" : "Medium",
        impact: `Estimate: restoring last week's CTR would lower CPC by ~${Math.max(0, d.cpc).toFixed(0)}% on this ad.`,
        action: { type: "refresh_creative", label: `Refresh creative — ${ad.name}` },
        _stake: curr.spend * 1.5,
      });
      continue;
    }

    if (a.signals.includes("Rising CPA")) {
      // CPA = CPC / CVR → which component moved?
      const cvrDrop = -d.cvr;
      const cpcRise = d.cpc;
      const cpmRise = d.cpm;
      let category: Recommendation["category"] = "Creative";
      let why = `CPC rose ${cpcRise.toFixed(0)}% driven by CTR falling ${Math.abs(d.ctr).toFixed(0)}% — the creative is earning fewer clicks.`;
      let rec = `Refresh the creative angle for "${ad.name}" and shift budget towards the stronger ads in the campaign.`;
      let test = `A/B test a new hook and thumbnail against the current version for 5 days.`;
      let action: Recommendation["action"] = { type: "refresh_creative", label: `New creative variants — ${ad.name}` };
      if (cvrDrop > Math.max(cpcRise, 0)) {
        category = "Funnel";
        why = `Clicks are costing about the same (CPC ${cpcRise >= 0 ? "+" : ""}${cpcRise.toFixed(0)}%) but conversion rate fell ${cvrDrop.toFixed(0)}% — the problem is after the click (landing page, offer or tracking).`;
        rec = `Audit the post-click journey${camp?.landingPage ? ` (${camp.landingPage})` : ""}: page speed, form friction, offer consistency and conversion tracking.`;
        test = `A/B test a shorter landing page / lead form against the current one.`;
        action = { type: "create_task", label: `Audit landing page & tracking — ${camp?.name ?? ad.name}` };
      } else if (cpmRise >= 15) {
        category = "Audience";
        why = `CPM rose ${cpmRise.toFixed(0)}% — the audience (${ad.audience}) is getting more expensive to reach, which pushes CPC and CPA up.`;
        rec = `Broaden or refresh the audience for "${ad.name}" (new lookalike seed or broad targeting) and exclude recent converters.`;
        test = `Test broad targeting vs ${ad.audience} with the same creative.`;
        action = { type: "create_task", label: `Refresh audience — ${ad.audience}` };
      }
      push({
        key: ad.id,
        clientId: ad.clientId,
        campaignId: ad.campaignId,
        adId: ad.id,
        title: `Rising CPA on "${ad.name}" (+${d.cpa.toFixed(0)}%)`,
        category,
        finding: `CPA rose ${d.cpa.toFixed(0)}% week over week (${cpaStr(prev)} → ${cpaStr(curr)}) on ${money(curr.spend)} of spend.`,
        why,
        evidence: [
          ...baseEvidence,
          { label: "CPC", value: `${money(prev.cpc)} → ${money(curr.cpc)}`, source: wow(ad.platform) },
          { label: "CVR", value: `${p2(prev.cvr)} → ${p2(curr.cvr)}`, source: wow(ad.platform) },
          { label: "CPM", value: `${money(prev.cpm)} → ${money(curr.cpm)}`, source: wow(ad.platform) },
          { label: "Placement / geo", value: `${ad.placement} · ${ad.geography}`, source: "Ad settings" },
        ],
        assumptions: category === "Audience" ? ["Auction competition may also be contributing — no auction-insights feed is connected to confirm."] : ["No tracking or attribution-window change between the two weeks."],
        recommendation: rec,
        test,
        priority: d.cpa >= 45 && share >= 15 ? "High" : "Medium",
        impact: `Estimate: returning to last week's CPA would save ~${money(Math.max(0, curr.spend - curr.conversions * prev.cpa))}/week at the current volume.`,
        action,
        _stake: curr.spend,
      });
    }
  }

  // 2. Campaign-level: scaling, budget inefficiency, funnel / landing page.
  for (const [campaignId, list] of byCampaign) {
    const c = campaignById.get(campaignId);
    if (!c || c.status !== "Active") continue;
    const platform = list[0]!.ad.platform;
    const activeList = list.filter((x) => x.ad.status === "Active");
    const prev = derive(sumStats(list.map((x) => x.ad.prev)));
    const curr = derive(sumStats(list.map((x) => x.ad.curr)));
    const pacing = campaignPacing(c);
    const scalers = activeList.filter((x) => x.signals.includes("Scaling")).sort((a, b) => b.curr.roas - a.curr.roas);
    const wasteful = activeList.filter((x) => x.signals.includes("Loser") || x.signals.includes("Rising CPA"));
    const wasteSpend = wasteful.reduce((s, x) => s + x.curr.spend, 0);
    const wasteShare = curr.spend ? (wasteSpend / curr.spend) * 100 : 0;
    const pacingEv = { label: "Pacing (month to date)", value: `${money(pacing.mtdSpend)} of ${money(c.budget)} · projected ${pacing.pct.toFixed(0)}%`, source: "Campaign daily metrics · month to date" };

    if (scalers.length && pacing.pct < 115) {
      const best = scalers[0]!;
      const newBudget = Math.round((c.budget * 1.15) / 1000) * 1000;
      const addWeekly = (newBudget - c.budget) / 4.3;
      push({
        key: campaignId,
        clientId: c.clientId,
        campaignId,
        title: `Scale ${c.name}: +15% budget to ${money(newBudget)}/mo`,
        category: "Scaling",
        finding: `${scalers.length} ad${scalers.length > 1 ? "s are" : " is"} improving with headroom — best is "${best.ad.name}" at ROAS ${x2(best.curr.roas)} and CPA ${cpaStr(best.curr)} (${fmtChange(best.d.cpa)} WoW) with frequency ${best.ad.frequency.toFixed(1)}.`,
        why: "Efficiency is improving while frequency is still low, so the audience is not saturated yet.",
        evidence: [
          { label: "Best ad ROAS (7d)", value: `${x2(best.prev.roas)} → ${x2(best.curr.roas)}`, source: wow(platform) },
          { label: "Best ad CPA", value: `${cpaStr(best.prev)} → ${cpaStr(best.curr)}`, source: wow(platform) },
          { label: "Frequency", value: best.ad.frequency.toFixed(1), source: week(platform) },
          { label: "Campaign ROAS (7d)", value: `${x2(prev.roas)} → ${x2(curr.roas)}`, source: wow(platform) },
          pacingEv,
        ],
        assumptions: ["Returns stay roughly linear for a +15% step (diminishing returns not yet observed).", "Increase is concentrated on the winning ad set(s), not spread evenly."],
        recommendation: `Raise the monthly budget from ${money(c.budget)} to ${money(newBudget)} and point the increase at ${scalers.map((x) => `"${x.ad.name}"`).slice(0, 2).join(" and ")}. Re-check CPA after 3–4 days before the next step.`,
        test: "Scale in 15% steps every 3–4 days; hold back one step if CPA rises more than 15%.",
        priority: best.curr.roas >= 3 ? "High" : "Medium",
        impact: `Estimate: ≈ ${best.curr.cpa ? (addWeekly / best.curr.cpa).toFixed(0) : "—"} extra conversions/week at the winning ad's current CPA.`,
        action: { type: "budget_change", value: newBudget, label: `Budget → ${money(newBudget)}/mo` },
        _stake: addWeekly,
      });
    } else if (wasteShare >= 35 || (curr.roas > 0 && curr.roas < 1 && change(prev.roas, curr.roas) <= -15)) {
      const newBudget = Math.round((c.budget * 0.85) / 1000) * 1000;
      push({
        key: campaignId,
        clientId: c.clientId,
        campaignId,
        title: `Budget inefficiency in ${c.name} — trim to ${money(newBudget)}/mo`,
        category: "Budget",
        finding: `${wasteShare.toFixed(0)}% of this week's spend (${money(wasteSpend)}) went to ads with rising or losing CPA. Campaign ROAS moved ${x2(prev.roas)} → ${x2(curr.roas)}.`,
        why: "Budget is flowing to ads whose efficiency is deteriorating while no ad qualifies for scaling.",
        evidence: [
          { label: "Spend on losing / rising-CPA ads", value: `${money(wasteSpend)} (${wasteShare.toFixed(0)}%)`, source: week(platform) },
          { label: "Campaign CPA", value: `${cpaStr(prev)} → ${cpaStr(curr)}`, source: wow(platform) },
          { label: "Campaign ROAS", value: `${x2(prev.roas)} → ${x2(curr.roas)}`, source: wow(platform) },
          pacingEv,
        ],
        assumptions: ["Trimming budget will cut the least efficient inventory first (platform delivery behaviour)."],
        recommendation: `Reduce the monthly budget from ${money(c.budget)} to ${money(newBudget)} until the losing ads are fixed or replaced; restore once CPA recovers.`,
        test: "Run the fixed creatives on 15% of budget for a week before restoring spend.",
        priority: wasteShare >= 50 ? "High" : "Medium",
        impact: `Estimate: ~${money((c.budget - newBudget) / 4.3)}/week less spend on inefficient delivery.`,
        action: { type: "budget_change", value: newBudget, label: `Budget → ${money(newBudget)}/mo` },
        _stake: wasteSpend,
      });
    } else if (pacing.state === "Over") {
      push({
        key: campaignId,
        clientId: c.clientId,
        campaignId,
        title: `${c.name} is over-pacing (${pacing.pct.toFixed(0)}% projected)`,
        category: "Budget",
        finding: `Month-to-date spend is ${money(pacing.mtdSpend)} vs ${money(pacing.expectedMtd)} expected by day ${pacing.day}; projected month-end ${money(pacing.projected)} against a ${money(c.budget)} budget.`,
        evidence: [pacingEv],
        recommendation: "Review daily caps so the campaign lands within budget.",
        priority: "Medium",
        impact: `Estimate: avoids ~${money(pacing.projected - c.budget)} overspend this month.`,
        action: { type: "create_task", label: `Review pacing — ${c.name}` },
        _stake: pacing.projected - c.budget,
      });
    }

    // Funnel / landing page: clicks steady, conversion rate down across the campaign.
    const dCtr = change(prev.ctr, curr.ctr);
    const dCvr = change(prev.cvr, curr.cvr);
    if (dCtr >= -5 && dCvr <= -20 && curr.clicks > 100) {
      push({
        key: campaignId,
        clientId: c.clientId,
        campaignId,
        title: `Post-click drop on ${c.name} — conversion rate ${dCvr.toFixed(0)}%`,
        category: "Landing Page",
        finding: `CTR is stable (${fmtChange(dCtr)}) but click→conversion rate fell from ${p2(prev.cvr)} to ${p2(curr.cvr)} across the campaign.`,
        why: "When clicks hold up and conversions don't, the issue is usually the landing page, offer or tracking rather than the ads.",
        evidence: [
          { label: "CTR", value: `${p2(prev.ctr)} → ${p2(curr.ctr)}`, source: wow(platform) },
          { label: "CVR", value: `${p2(prev.cvr)} → ${p2(curr.cvr)}`, source: wow(platform) },
          { label: "Landing page", value: c.landingPage ?? "—", source: "Campaign settings" },
          { label: "Tracking", value: c.tracking ?? "—", source: "Campaign settings" },
        ],
        assumptions: ["No page-speed / uptime monitor is connected — landing-page cause is inferred, not verified."],
        recommendation: `Check ${c.landingPage ?? "the landing page"} for speed, broken forms and tracking; compare GA4 landing-page conversion rate for the two weeks.`,
        test: "A/B test a simplified page (fewer fields, offer above the fold) against the current page.",
        priority: dCvr <= -30 ? "High" : "Medium",
        impact: `Estimate: recovering last week's CVR ≈ ${Math.max(0, curr.clicks * (prev.cvr - curr.cvr) / 100).toFixed(0)} more conversions/week.`,
        action: { type: "create_task", label: `Landing-page & tracking audit — ${c.name}` },
        _stake: curr.spend * 0.8,
      });
    }
  }

  // 3. Client-level audience problems: worst audience vs client average.
  const byClient = new Map<string, AdAnalysis[]>();
  for (const a of active) byClient.set(a.ad.clientId, [...(byClient.get(a.ad.clientId) ?? []), a]);
  for (const [clientId, list] of byClient) {
    const total = derive(sumStats(list.map((x) => x.ad.curr)));
    if (!total.conversions) continue;
    const groups = new Map<string, AdAnalysis[]>();
    for (const a of list) groups.set(a.ad.audience, [...(groups.get(a.ad.audience) ?? []), a]);
    if (groups.size < 2) continue;
    const worst = [...groups.entries()]
      .map(([aud, xs]) => ({ aud, xs, m: derive(sumStats(xs.map((x) => x.ad.curr))) }))
      .filter((g) => g.m.spend >= total.spend * 0.15 && (g.m.conversions === 0 || g.m.cpa >= 1.5 * total.cpa))
      .sort((a, b) => b.m.spend - a.m.spend)[0];
    if (!worst) continue;
    const platform = worst.xs[0]!.ad.platform;
    push({
      key: `${clientId}_${slug(worst.aud)}`,
      clientId,
      title: `Audience problem for ${clientName(clientId)}: "${worst.aud}"`,
      category: "Audience",
      finding: `"${worst.aud}" took ${((worst.m.spend / total.spend) * 100).toFixed(0)}% of spend at a CPA of ${cpaStr(worst.m)} vs ${money(total.cpa)} across the client's active ads.`,
      why: "This audience converts materially worse than the rest of the account at similar creative.",
      evidence: [
        { label: "Audience spend (7d)", value: money(worst.m.spend), source: week(platform) },
        { label: "Audience CPA", value: cpaStr(worst.m), source: week(platform) },
        { label: "Client CPA (active ads)", value: money(total.cpa), source: "All connected ad platforms · last 7 days" },
        { label: "Ads using it", value: String(worst.xs.length), source: "Ad settings" },
      ],
      assumptions: ["Creative quality is comparable across audiences."],
      recommendation: `Cut bids/budget on "${worst.aud}" and test a narrower or lookalike alternative; exclude existing customers.`,
      test: `Test a 1% purchaser lookalike vs "${worst.aud}" with the same creative for 7 days.`,
      priority: worst.m.spend >= total.spend * 0.3 ? "High" : "Medium",
      impact: `Estimate: bringing it to the account-average CPA ≈ ${worst.m.conversions ? Math.max(0, worst.m.spend / total.cpa - worst.m.conversions).toFixed(0) : "—"} more conversions/week.`,
      action: { type: "create_task", label: `Restructure audience "${worst.aud}" — ${clientName(clientId)}` },
      _stake: worst.m.spend,
    });
  }

  return out
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b._stake - a._stake)
    .map(({ _stake, ...r }) => {
      void _stake;
      return r;
    });
}
