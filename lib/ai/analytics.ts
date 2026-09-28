// Analytics Engine + AI Analytics Agent — PURE (no store imports).
// 1. Unified metrics: one normalised row shape across ad platforms and campaign feeds.
// 2. Explore: pivot by any dimension with period comparison.
// 3. detectAnomalies / investigate: What happened → Why → What next → What to test.
import type { AdRow, AdStats, Campaign, Client, Deal, InsightItem, Lead, Recommendation } from "../types";
import { money } from "../utils";
import { EMPTY_STATS, PLATFORM_LABEL, SERVICE_PLATFORM, addStats, change, derive, fmtChange, sumStats, type AdPlatform, type Metrics } from "./media";

const DAY = 86_400_000;

// ---------- Unified metric model ----------
export interface UnifiedRow {
  date: string; // YYYY-MM-DD (period start for weekly ad rows)
  grain: "day" | "week";
  period: "curr" | "prev";
  clientId: string;
  client: string;
  platform: string;
  campaignId: string;
  campaign: string;
  adId?: string;
  ad?: string;
  creative?: string; // format · hook
  audience?: string;
  geography?: string;
  product: string; // proxy: campaign service · objective
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
}

export const DIMENSIONS = ["Client", "Platform", "Campaign", "Ad", "Creative", "Audience", "Geography", "Product", "Date"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const AD_LEVEL_DIMS: Dimension[] = ["Ad", "Creative", "Audience", "Geography"];

export type MetricKey = "spend" | "impressions" | "clicks" | "leads" | "conversions" | "revenue" | "ctr" | "cpc" | "cpm" | "cpa" | "roas" | "cvr";
export const METRIC_DEFS: { key: MetricKey; label: string; kind: "money" | "count" | "pct" | "x"; lowerBetter?: boolean }[] = [
  { key: "spend", label: "Spend", kind: "money" },
  { key: "impressions", label: "Impressions", kind: "count" },
  { key: "clicks", label: "Clicks", kind: "count" },
  { key: "leads", label: "Leads", kind: "count" },
  { key: "conversions", label: "Conversions", kind: "count" },
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "ctr", label: "CTR", kind: "pct" },
  { key: "cpc", label: "CPC", kind: "money", lowerBetter: true },
  { key: "cpm", label: "CPM", kind: "money", lowerBetter: true },
  { key: "cpa", label: "CPA", kind: "money", lowerBetter: true },
  { key: "roas", label: "ROAS", kind: "x" },
  { key: "cvr", label: "CVR", kind: "pct" },
];
export const metricDef = (k: MetricKey) => METRIC_DEFS.find((m) => m.key === k)!;

export const platformOfCampaign = (c: Campaign): string => {
  const p = SERVICE_PLATFORM[c.service];
  return p ? PLATFORM_LABEL[p] : c.service;
};
export const productOf = (c: Campaign) => `${c.service} · ${c.objective}`;

const toStats = (r: Pick<UnifiedRow, "spend" | "impressions" | "clicks" | "leads" | "conversions" | "revenue">): AdStats => ({
  spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads, conversions: r.conversions, revenue: r.revenue,
});

export interface UnifiedInput {
  campaigns: Campaign[];
  ads: AdRow[];
  clients: Client[];
  clientId?: string; // "All" / undefined = every client
}

/** Daily rows from campaign metrics: current window = last `days`, previous = the `days` before it. */
export function buildDailyRows(input: UnifiedInput, days: number): { rows: UnifiedRow[]; prevComplete: boolean } {
  const name = new Map(input.clients.map((c) => [c.id, c.company]));
  const rows: UnifiedRow[] = [];
  let prevComplete = true;
  for (const c of input.campaigns) {
    if (input.clientId && input.clientId !== "All" && c.clientId !== input.clientId) continue;
    if (!c.metrics.length) continue;
    const curr = c.metrics.slice(-days);
    const prev = c.metrics.slice(-2 * days, -days);
    if (prev.length < days) prevComplete = false;
    const base = { clientId: c.clientId, client: name.get(c.clientId) ?? c.clientId, platform: platformOfCampaign(c), campaignId: c.id, campaign: c.name, product: productOf(c), grain: "day" as const };
    for (const m of curr) rows.push({ ...base, date: m.date, period: "curr", spend: m.spend, impressions: m.impressions, clicks: m.clicks, leads: m.leads, conversions: m.conversions, revenue: m.revenue });
    for (const m of prev) rows.push({ ...base, date: m.date, period: "prev", spend: m.spend, impressions: m.impressions, clicks: m.clicks, leads: m.leads, conversions: m.conversions, revenue: m.revenue });
  }
  return { rows, prevComplete };
}

/** Weekly ad-level rows (this week = curr, last week = prev) straight from the ad platforms. */
export function buildAdRows(input: UnifiedInput, asOf: string): UnifiedRow[] {
  const name = new Map(input.clients.map((c) => [c.id, c.company]));
  const camp = new Map(input.campaigns.map((c) => [c.id, c]));
  const end = new Date(asOf).getTime();
  const currStart = new Date(end - 6 * DAY).toISOString().slice(0, 10);
  const prevStart = new Date(end - 13 * DAY).toISOString().slice(0, 10);
  const rows: UnifiedRow[] = [];
  for (const a of input.ads) {
    if (input.clientId && input.clientId !== "All" && a.clientId !== input.clientId) continue;
    const c = camp.get(a.campaignId);
    const base = {
      grain: "week" as const,
      clientId: a.clientId,
      client: name.get(a.clientId) ?? a.clientId,
      platform: PLATFORM_LABEL[a.platform],
      campaignId: a.campaignId,
      campaign: c?.name ?? a.campaignId,
      adId: a.id,
      ad: a.name,
      creative: `${a.format}${a.hook ? ` · ${a.hook}` : ""}`,
      audience: a.audience,
      geography: a.geography,
      product: c ? productOf(c) : "—",
    };
    rows.push({ ...base, date: currStart, period: "curr", ...a.curr });
    rows.push({ ...base, date: prevStart, period: "prev", ...a.prev });
  }
  return rows;
}

// ---------- Explore (pivot) ----------
export interface PivotRow {
  key: string;
  curr: Metrics;
  prev: Metrics;
}
export interface ExploreResult {
  rows: PivotRow[];
  total: { curr: Metrics; prev: Metrics };
  series: { label: string; curr: number; prev: number }[]; // chart series for the selected metric
  grain: "day" | "week";
  prevAvailable: boolean;
  notes: string[];
  unified: UnifiedRow[]; // the normalised rows behind the view (for CSV export)
}

const keyFor = (r: UnifiedRow, d: Dimension): string => {
  switch (d) {
    case "Client": return r.client;
    case "Platform": return r.platform;
    case "Campaign": return r.campaign;
    case "Ad": return r.ad ?? "—";
    case "Creative": return r.creative ?? "—";
    case "Audience": return r.audience ?? "—";
    case "Geography": return r.geography ?? "—";
    case "Product": return r.product;
    case "Date": return r.date;
  }
};

export function explore(input: UnifiedInput & { dimension: Dimension; metric: MetricKey; days: number; asOf: string }): ExploreResult {
  const adLevel = AD_LEVEL_DIMS.includes(input.dimension);
  const notes: string[] = [];
  let unified: UnifiedRow[];
  let prevAvailable = true;
  if (adLevel) {
    unified = buildAdRows(input, input.asOf);
    notes.push("Ad-level dimensions come from ad-platform rows, which are reported as two 7-day periods (this week vs last week). The date range is fixed to 7 days for this view.");
  } else {
    const d = buildDailyRows(input, input.days);
    unified = d.rows;
    prevAvailable = d.prevComplete;
    if (!prevAvailable) notes.push(`Only 60 days of history are synced, so the previous ${input.days}-day period is incomplete — deltas are hidden.`);
  }
  if (input.dimension === "Product") notes.push("Product uses campaign service · objective as a proxy — no product-catalogue feed is connected.");

  const groups = new Map<string, { curr: AdStats; prev: AdStats }>();
  let tc = EMPTY_STATS;
  let tp = EMPTY_STATS;
  for (const r of unified) {
    const s = toStats(r);
    if (r.period === "curr") tc = addStats(tc, s);
    else tp = addStats(tp, s);
    if (input.dimension === "Date") continue;
    const k = keyFor(r, input.dimension);
    const g = groups.get(k) ?? { curr: EMPTY_STATS, prev: EMPTY_STATS };
    if (r.period === "curr") g.curr = addStats(g.curr, s);
    else g.prev = addStats(g.prev, s);
    groups.set(k, g);
  }

  let rows: PivotRow[];
  let series: ExploreResult["series"];
  if (input.dimension === "Date") {
    // Align previous-period days to current-period days by position.
    const currDates = [...new Set(unified.filter((r) => r.period === "curr").map((r) => r.date))].sort();
    const prevDates = [...new Set(unified.filter((r) => r.period === "prev").map((r) => r.date))].sort();
    const by = (period: "curr" | "prev", date: string) => sumStats(unified.filter((r) => r.period === period && r.date === date).map(toStats));
    const offset = prevDates.length - currDates.length;
    rows = currDates.map((d, i) => {
      const pd = prevDates[i + offset];
      return { key: d, curr: derive(by("curr", d)), prev: derive(pd ? by("prev", pd) : EMPTY_STATS) };
    });
    series = rows.map((r) => ({ label: r.key.slice(5), curr: r.curr[input.metric], prev: r.prev[input.metric] }));
  } else {
    rows = [...groups.entries()].map(([key, g]) => ({ key, curr: derive(g.curr), prev: derive(g.prev) }));
    rows.sort((a, b) => b.curr.spend - a.curr.spend || b.curr[input.metric] - a.curr[input.metric]);
    series = [...rows].sort((a, b) => b.curr[input.metric] - a.curr[input.metric]).slice(0, 12).map((r) => ({ label: r.key.length > 28 ? `${r.key.slice(0, 27)}…` : r.key, curr: r.curr[input.metric], prev: r.prev[input.metric] }));
  }
  return { rows, total: { curr: derive(tc), prev: derive(tp) }, series, grain: adLevel ? "week" : "day", prevAvailable, notes, unified };
}

// ---------- CRM metrics (from leads / deals) ----------
export function crmMetrics(leads: Lead[], deals: Deal[], days: number, asOf = Date.now()) {
  const inWindow = (iso: string, from: number, to: number) => {
    const t = new Date(iso).getTime();
    return t > from && t <= to;
  };
  const cur = [asOf - days * DAY, asOf] as const;
  const prv = [asOf - 2 * days * DAY, asOf - days * DAY] as const;
  const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  return {
    newLeads: leads.filter((l) => inWindow(l.createdAt, ...cur)).length,
    newLeadsPrev: leads.filter((l) => inWindow(l.createdAt, ...prv)).length,
    dealsCreated: deals.filter((d) => inWindow(d.createdAt, ...cur)).length,
    wonDeals: deals.filter((d) => d.stage === "Won").length,
    wonValue: deals.filter((d) => d.stage === "Won").reduce((a, d) => a + d.value, 0),
    pipelineValue: open.reduce((a, d) => a + d.value, 0),
    weightedPipeline: open.reduce((a, d) => a + (d.value * d.probability) / 100, 0),
  };
}

// ---------- Anomaly detection ----------
export type AnomalyMetric = "CPA" | "ROAS" | "CTR" | "CPC" | "CPM" | "CVR" | "Spend" | "Conversions";
const METRIC_KEY: Record<AnomalyMetric, keyof Metrics> = { CPA: "cpa", ROAS: "roas", CTR: "ctr", CPC: "cpc", CPM: "cpm", CVR: "cvr", Spend: "spend", Conversions: "conversions" };
export const ANOMALY_THRESHOLDS: Record<AnomalyMetric, number> = { CPA: 20, ROAS: 20, CTR: 15, CPC: 20, CPM: 20, CVR: 20, Spend: 30, Conversions: 25 };
const LOWER_BETTER: AnomalyMetric[] = ["CPA", "CPC", "CPM"];

export interface Anomaly {
  id: string;
  scope: "client" | "campaign";
  clientId: string;
  campaignId?: string;
  label: string;
  metric: AnomalyMetric;
  prev: number;
  curr: number;
  changePct: number;
  tone: "worse" | "better" | "neutral";
  severity: "High" | "Medium" | "Low";
  basis: "ads" | "daily";
  source: string;
  spend: number;
  headline: string;
}

export const fmtMetric = (m: AnomalyMetric | MetricKey, v: number) => {
  const k = (m in METRIC_KEY ? METRIC_KEY[m as AnomalyMetric] : m) as string;
  if (k === "spend" || k === "cpa" || k === "cpc" || k === "cpm" || k === "revenue") return money(v);
  if (k === "ctr" || k === "cvr") return `${v.toFixed(2)}%`;
  if (k === "roas") return `${v.toFixed(2)}x`;
  return Math.round(v).toLocaleString("en-IN");
};

function windowStats(c: Campaign, from: number, len: number): AdStats {
  const end = Math.max(0, c.metrics.length - from);
  const slice = c.metrics.slice(Math.max(0, end - len), end);
  return slice.reduce<AdStats>((a, m) => addStats(a, { spend: m.spend, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions, revenue: m.revenue, leads: m.leads }), EMPTY_STATS);
}

function platformsOf(ads: AdRow[]): AdPlatform[] {
  return [...new Set(ads.map((a) => a.platform))];
}

function scan(out: Anomaly[], base: Omit<Anomaly, "id" | "metric" | "prev" | "curr" | "changePct" | "tone" | "severity" | "headline" | "spend">, prev: Metrics, curr: Metrics) {
  if (curr.spend < 1000 && prev.spend < 1000) return;
  (Object.keys(ANOMALY_THRESHOLDS) as AnomalyMetric[]).forEach((metric) => {
    const k = METRIC_KEY[metric];
    const p = prev[k];
    const c = curr[k];
    if ((metric === "CPA" || metric === "CVR") && (!prev.conversions || !curr.conversions)) return;
    const ch = change(p, c);
    if (!Number.isFinite(ch) || Math.abs(ch) < ANOMALY_THRESHOLDS[metric]) return;
    const up = ch > 0;
    const tone: Anomaly["tone"] = metric === "Spend" ? "neutral" : LOWER_BETTER.includes(metric) === up ? "worse" : "better";
    const ratio = Math.abs(ch) / ANOMALY_THRESHOLDS[metric];
    let severity: Anomaly["severity"] = ratio >= 2 ? "High" : ratio >= 1.4 ? "Medium" : "Low";
    if (tone !== "worse") severity = severity === "High" ? "Medium" : "Low";
    out.push({
      ...base,
      id: `an_${base.scope}_${base.campaignId ?? base.clientId}_${metric}`,
      metric,
      prev: p,
      curr: c,
      changePct: ch,
      tone,
      severity,
      spend: curr.spend,
      headline: `${metric} ${up ? "increased" : "decreased"} ${Math.abs(ch).toFixed(0)}%`,
    });
  });
}

/** Metric changes beyond thresholds, per campaign (and per client when it spans several campaigns). */
export function detectAnomalies(campaigns: Campaign[], ads: AdRow[], clients: Client[]): Anomaly[] {
  const out: Anomaly[] = [];
  const name = new Map(clients.map((c) => [c.id, c.company]));
  const adsByCampaign = new Map<string, AdRow[]>();
  for (const a of ads) adsByCampaign.set(a.campaignId, [...(adsByCampaign.get(a.campaignId) ?? []), a]);

  for (const c of campaigns) {
    if (c.status === "Planning") continue;
    const list = adsByCampaign.get(c.id);
    if (list?.length) {
      const src = platformsOf(list).map((p) => PLATFORM_LABEL[p]).join(" + ");
      scan(out, { scope: "campaign", clientId: c.clientId, campaignId: c.id, label: c.name, basis: "ads", source: `${src} · this week vs last week` }, derive(sumStats(list.map((a) => a.prev))), derive(sumStats(list.map((a) => a.curr))));
    } else if (c.metrics.length >= 14) {
      scan(out, { scope: "campaign", clientId: c.clientId, campaignId: c.id, label: c.name, basis: "daily", source: `${c.platform} · last 7 days vs previous 7 (campaign feed)` }, derive(windowStats(c, 7, 7)), derive(windowStats(c, 0, 7)));
    }
  }
  const byClient = new Map<string, AdRow[]>();
  for (const a of ads) byClient.set(a.clientId, [...(byClient.get(a.clientId) ?? []), a]);
  for (const [clientId, list] of byClient) {
    if (new Set(list.map((a) => a.campaignId)).size < 2) continue;
    scan(out, { scope: "client", clientId, label: `${name.get(clientId) ?? clientId} (all paid media)`, basis: "ads", source: "All ad platforms · this week vs last week" }, derive(sumStats(list.map((a) => a.prev))), derive(sumStats(list.map((a) => a.curr))));
  }
  const sev = { High: 0, Medium: 1, Low: 2 } as const;
  const tone = { worse: 0, neutral: 1, better: 2 } as const;
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || tone[a.tone] - tone[b.tone] || b.spend - a.spend);
}

// ---------- Investigation ----------
export interface DriverRow {
  key: string;
  spendPrev: number;
  spendCurr: number;
  valuePrev: number;
  valueCurr: number;
  contribution: number; // additive contribution to the change in the anomaly metric (metric units)
  share: number; // % of the total change explained
  ads: number; // ads in this group
}
export interface Investigation {
  anomaly: Anomaly;
  whatHappened: InsightItem[];
  why: InsightItem[];
  next: InsightItem[];
  tests: InsightItem[];
  decomposition: { label: string; prev: string; curr: string; change: number; note?: string }[];
  componentNote?: string;
  drivers: { dimension: string; rows: DriverRow[] }[];
  checks: { factor: string; status: "Contributing" | "Not a driver" | "Unverified"; evidence: string; kind: InsightItem["kind"] }[];
  findings: { finding: string; evidence: string; recommendation: string; priority: "High" | "Medium" | "Low" }[];
  recommendation: Omit<Recommendation, "id" | "createdAt">;
}

// Ratio metrics as numerator / denominator (scaled) so contributions sum exactly to the total change.
const RATIO: Partial<Record<AnomalyMetric, { n: (s: AdStats) => number; d: (s: AdStats) => number; scale: number }>> = {
  CPA: { n: (s) => s.spend, d: (s) => s.conversions, scale: 1 },
  ROAS: { n: (s) => s.revenue, d: (s) => s.spend, scale: 1 },
  CTR: { n: (s) => s.clicks, d: (s) => s.impressions, scale: 100 },
  CPC: { n: (s) => s.spend, d: (s) => s.clicks, scale: 1 },
  CPM: { n: (s) => s.spend, d: (s) => s.impressions, scale: 1000 },
  CVR: { n: (s) => s.conversions, d: (s) => s.clicks, scale: 100 },
};

function contribution(metric: AnomalyMetric, s0: AdStats, s1: AdStats, T0: AdStats, T1: AdStats) {
  const r = RATIO[metric];
  if (!r) {
    const k = METRIC_KEY[metric] as keyof AdStats;
    return s1[k] - s0[k];
  }
  const M0 = r.d(T0) ? r.n(T0) / r.d(T0) : 0;
  const a = r.d(T1) ? (r.n(s1) - M0 * r.d(s1)) / r.d(T1) : 0;
  const b = r.d(T0) ? (r.n(s0) - M0 * r.d(s0)) / r.d(T0) : 0;
  return (a - b) * r.scale;
}

export interface InvestigationData {
  campaigns: Campaign[];
  ads: AdRow[];
  clients: Client[];
  connected?: string[]; // connected integration keys (e.g. "ga4")
}

export function investigate(an: Anomaly, data: InvestigationData): Investigation {
  const camp = an.campaignId ? data.campaigns.find((c) => c.id === an.campaignId) : undefined;
  const scopeCampaigns = camp ? [camp] : data.campaigns.filter((c) => c.clientId === an.clientId);
  const scopeAds = data.ads.filter((a) => (camp ? a.campaignId === camp.id : a.clientId === an.clientId));
  const useAds = an.basis === "ads" && scopeAds.length > 0;
  const T0: AdStats = useAds ? sumStats(scopeAds.map((a) => a.prev)) : camp ? windowStats(camp, 7, 7) : EMPTY_STATS;
  const T1: AdStats = useAds ? sumStats(scopeAds.map((a) => a.curr)) : camp ? windowStats(camp, 0, 7) : EMPTY_STATS;
  const P = derive(T0);
  const C = derive(T1);
  const mk = METRIC_KEY[an.metric];
  const totalDelta = C[mk] - P[mk];
  const worseIsUp = LOWER_BETTER.includes(an.metric) || an.metric === "Spend";
  const src = an.source;

  // --- Decomposition of the core funnel metrics
  const dRow = (label: string, k: keyof Metrics, note?: string) => ({ label, prev: fmtMetric(k as MetricKey, P[k]), curr: fmtMetric(k as MetricKey, C[k]), change: change(P[k], C[k]), note });
  const decomposition = [
    dRow("Spend", "spend"),
    dRow("Impressions", "impressions"),
    dRow("CPM", "cpm", "Cost of reach — auction / audience pressure"),
    dRow("CTR", "ctr", "Creative attention"),
    dRow("CPC", "cpc", "= CPM ÷ (1000 × CTR)"),
    dRow("CVR", "cvr", "Post-click conversion (landing page / offer / tracking)"),
    dRow("CPA", "cpa", "= CPC ÷ CVR"),
    dRow("Conversions", "conversions"),
    dRow("ROAS", "roas", "= AOV × CVR ÷ CPC"),
  ];
  const lr = (a: number, b: number) => (a > 0 && b > 0 ? Math.log(b / a) : 0);
  let componentNote: string | undefined;
  let postClickLed = false;
  if (an.metric === "CPA" || an.metric === "ROAS" || an.metric === "Conversions" || an.metric === "CVR") {
    const cpc = lr(P.cpc, C.cpc);
    const cvr = -lr(P.cvr, C.cvr); // lower CVR raises CPA
    const tot = Math.abs(cpc) + Math.abs(cvr) || 1;
    postClickLed = Math.abs(cvr) > Math.abs(cpc);
    componentNote = `CPA = CPC ÷ CVR: CPC moved ${fmtChange(change(P.cpc, C.cpc))} and CVR moved ${fmtChange(change(P.cvr, C.cvr))} — ${((Math.abs(postClickLed ? cvr : cpc) / tot) * 100).toFixed(0)}% of the movement is ${postClickLed ? "post-click (conversion rate)" : "pre-click (cost per click)"}.`;
  } else if (an.metric === "CPC" || an.metric === "CTR" || an.metric === "CPM") {
    const cpm = lr(P.cpm, C.cpm);
    const ctr = -lr(P.ctr, C.ctr);
    const tot = Math.abs(cpm) + Math.abs(ctr) || 1;
    const cpmLed = Math.abs(cpm) > Math.abs(ctr);
    componentNote = `CPC = CPM ÷ CTR: CPM moved ${fmtChange(change(P.cpm, C.cpm))} and CTR moved ${fmtChange(change(P.ctr, C.ctr))} — ${((Math.abs(cpmLed ? cpm : ctr) / tot) * 100).toFixed(0)}% of the movement comes from ${cpmLed ? "the cost of reach (CPM)" : "creative engagement (CTR)"}.`;
  }

  // --- Drivers: which ads / audiences / placements contributed most
  const drivers: Investigation["drivers"] = [];
  if (useAds) {
    const dims: { dimension: string; key: (a: AdRow) => string }[] = [
      { dimension: "Ad", key: (a) => a.name },
      { dimension: "Audience", key: (a) => a.audience },
      { dimension: "Placement", key: (a) => a.placement },
      { dimension: "Creative format", key: (a) => a.format },
      { dimension: "Geography", key: (a) => a.geography },
      ...(camp ? [] : [{ dimension: "Platform", key: (a: AdRow) => PLATFORM_LABEL[a.platform] }]),
    ];
    for (const dim of dims) {
      const g = new Map<string, { p: AdStats; c: AdStats; n: number }>();
      for (const a of scopeAds) {
        const k = dim.key(a);
        const cur = g.get(k) ?? { p: EMPTY_STATS, c: EMPTY_STATS, n: 0 };
        g.set(k, { p: addStats(cur.p, a.prev), c: addStats(cur.c, a.curr), n: cur.n + 1 });
      }
      if (g.size < 2 && dim.dimension !== "Ad") continue;
      const rows = [...g.entries()].map(([key, v]) => {
        const contributionV = contribution(an.metric, v.p, v.c, T0, T1);
        return { key, spendPrev: v.p.spend, spendCurr: v.c.spend, valuePrev: derive(v.p)[mk], valueCurr: derive(v.c)[mk], contribution: contributionV, share: totalDelta ? (contributionV / totalDelta) * 100 : 0, ads: v.n };
      });
      rows.sort((a, b) => (totalDelta >= 0 ? b.contribution - a.contribution : a.contribution - b.contribution));
      drivers.push({ dimension: dim.dimension, rows: rows.slice(0, 5) });
    }
  }
  const top = (dim: string) => drivers.find((d) => d.dimension === dim)?.rows[0];

  // --- Factor checks
  const checks: Investigation["checks"] = [];
  const dCtr = change(P.ctr, C.ctr);
  const dCvr = change(P.cvr, C.cvr);
  const dCpm = change(P.cpm, C.cpm);
  const dSpend = change(P.spend, C.spend);
  const fatigued = scopeAds.filter((a) => a.frequency >= 3.5 && change(derive(a.prev).ctr, derive(a.curr).ctr) <= -20);
  const avgFreq = scopeAds.length ? scopeAds.reduce((s, a) => s + a.frequency * a.curr.impressions, 0) / Math.max(1, T1.impressions) : 0;
  checks.push({
    factor: "Creative",
    status: dCtr <= -10 || fatigued.length ? "Contributing" : "Not a driver",
    evidence: `CTR ${fmtChange(dCtr)} (${P.ctr.toFixed(2)}% → ${C.ctr.toFixed(2)}%)${fatigued.length ? `; ${fatigued.length} ad(s) show fatigue (frequency ≥ 3.5 with CTR down ≥ 20%)` : ""}.`,
    kind: "data",
  });
  const aud = top("Audience");
  checks.push({
    factor: "Audience",
    status: aud && aud.share >= 40 ? (aud.ads > 1 ? "Contributing" : "Unverified") : useAds ? "Not a driver" : "Unverified",
    evidence: aud ? `"${aud.key}" explains ${aud.share.toFixed(0)}% of the change (${fmtMetric(an.metric, aud.valuePrev)} → ${fmtMetric(an.metric, aud.valueCurr)})${aud.ads === 1 ? " — but it maps to a single ad, so the audience effect can't be separated from that ad's creative" : ""}. Weighted frequency now ${avgFreq.toFixed(1)} (no prior-period frequency reported).` : "No audience-level breakdown for this source.",
    kind: aud ? (aud.ads > 1 ? "data" : "assumption") : "assumption",
  });
  const plc = top("Placement");
  checks.push({
    factor: "Placement",
    status: plc && plc.share >= 40 ? (plc.ads > 1 ? "Contributing" : "Unverified") : useAds ? "Not a driver" : "Unverified",
    evidence: plc ? `"${plc.key}" explains ${plc.share.toFixed(0)}% of the change; spend ${money(plc.spendPrev)} → ${money(plc.spendCurr)}${plc.ads === 1 ? " (single ad — confounded with that ad)" : ""}.` : "No placement breakdown for this source.",
    kind: plc ? (plc.ads > 1 ? "data" : "assumption") : "assumption",
  });
  const pacingNote = scopeCampaigns.map((c) => `${c.name.split(" · ").pop()}: ${money(c.budget)}/mo`).slice(0, 3).join(", ");
  checks.push({
    factor: "Budget",
    status: Math.abs(dSpend) >= 20 ? "Contributing" : "Not a driver",
    evidence: `Spend ${fmtChange(dSpend)} week over week (${money(P.spend)} → ${money(C.spend)}). Budgets: ${pacingNote || "—"}.`,
    kind: "data",
  });
  const lpc0 = T0.leads ? (T0.conversions / T0.leads) * 100 : 0;
  const lpc1 = T1.leads ? (T1.conversions / T1.leads) * 100 : 0;
  const dLpc = change(lpc0, lpc1);
  checks.push({
    factor: "Funnel",
    status: dLpc <= -15 ? "Contributing" : "Not a driver",
    evidence: `Lead → conversion rate ${lpc0.toFixed(1)}% → ${lpc1.toFixed(1)}% (${fmtChange(dLpc)}); leads ${T0.leads.toLocaleString("en-IN")} → ${T1.leads.toLocaleString("en-IN")}.`,
    kind: "data",
  });
  const lp = scopeCampaigns.find((c) => c.landingPage)?.landingPage;
  const ga4 = data.connected?.includes("ga4");
  checks.push({
    factor: "Landing page",
    status: dCvr <= -15 && dCtr >= -10 ? "Contributing" : "Unverified",
    evidence: `${lp ?? "Landing page"}: click → conversion ${fmtChange(dCvr)} while CTR ${fmtChange(dCtr)}. ${dCvr <= -15 && dCtr >= -10 ? "Clicks held up but conversions didn't — points post-click." : "No clear post-click signal."} ${ga4 ? "Confirm in GA4 landing-page report." : "No web-analytics feed connected to verify page speed / errors."}`,
    kind: dCvr <= -15 && dCtr >= -10 ? "data" : "assumption",
  });
  checks.push({
    factor: "Conversion rate",
    status: Math.abs(dCvr) >= 15 ? "Contributing" : "Not a driver",
    evidence: `CVR ${P.cvr.toFixed(2)}% → ${C.cvr.toFixed(2)}% (${fmtChange(dCvr)}).`,
    kind: "data",
  });
  // Competition: CPM inflation — only evidenced if it's platform-wide across other clients.
  const plats = platformsOf(scopeAds);
  const others = data.ads.filter((a) => plats.includes(a.platform) && a.clientId !== an.clientId);
  const oCpm = change(derive(sumStats(others.map((a) => a.prev))).cpm, derive(sumStats(others.map((a) => a.curr))).cpm);
  const otherClients = new Set(others.map((a) => a.clientId)).size;
  const platformWide = others.length > 0 && oCpm >= 10 && dCpm >= 10;
  checks.push({
    factor: "Competition",
    status: platformWide ? "Contributing" : "Unverified",
    evidence: platformWide
      ? `CPM ${fmtChange(dCpm)} here and ${fmtChange(oCpm)} across ${otherClients} other client(s) on the same platform(s) — consistent with auction-wide inflation.`
      : `CPM ${fmtChange(dCpm)} here vs ${others.length ? fmtChange(oCpm) : "n/a"} on the same platform(s) for other clients. Competition is an assumption — no auction-insights feed is connected.`,
    kind: platformWide ? "data" : "assumption",
  });
  // Historical: campaign daily feed, 60 days.
  const hist = sumStats(scopeCampaigns.map((c) => windowStats(c, 7, Math.max(0, c.metrics.length - 7))));
  const histM = derive(hist);
  checks.push({
    factor: "Historical performance",
    status: histM.spend ? (Math.abs(change(histM[mk], C[mk])) >= ANOMALY_THRESHOLDS[an.metric] ? "Contributing" : "Not a driver") : "Unverified",
    evidence: histM.spend ? `Current ${an.metric} ${fmtMetric(an.metric, C[mk])} vs ${fmtMetric(an.metric, histM[mk])} average over the prior ~${Math.max(0, (scopeCampaigns[0]?.metrics.length ?? 7) - 7)} days (campaign daily feed — reported separately from ad-level rows, so levels may differ).` : "No history synced.",
    kind: histM.spend ? "data" : "assumption",
  });

  // --- Four questions
  const whatHappened: InsightItem[] = [
    { kind: "data", text: `${an.headline} for ${an.label}: ${fmtMetric(an.metric, an.prev)} → ${fmtMetric(an.metric, an.curr)}.`, source: src },
    { kind: "data", text: `Spend ${money(P.spend)} → ${money(C.spend)} (${fmtChange(dSpend)}); conversions ${P.conversions.toLocaleString("en-IN")} → ${C.conversions.toLocaleString("en-IN")} (${fmtChange(change(P.conversions, C.conversions))}); revenue ${money(P.revenue)} → ${money(C.revenue)}.`, source: src },
  ];
  if (componentNote) whatHappened.push({ kind: "data", text: componentNote, source: src });

  const histCheck = checks.find((c) => c.factor === "Historical performance");
  if (histCheck && histCheck.kind === "data") whatHappened.push({ kind: "data", text: `Historical context: ${histCheck.evidence}`, source: "Campaign daily metrics" });
  const contributing = checks.filter((c) => c.status === "Contributing" && c.factor !== "Historical performance");
  const why: InsightItem[] = contributing.map((c) => ({ kind: c.kind, text: `${c.factor}: ${c.evidence}`, source: c.kind === "data" ? src : undefined }));
  const topAd = top("Ad");
  if (topAd && Math.abs(topAd.share) >= 25) why.unshift({ kind: "data", text: `"${topAd.key}" alone explains ${topAd.share.toFixed(0)}% of the change (${fmtMetric(an.metric, topAd.valuePrev)} → ${fmtMetric(an.metric, topAd.valueCurr)}).`, source: src });
  checks.filter((c) => c.status === "Unverified" && c.factor !== "Historical performance").forEach((c) => why.push({ kind: "assumption", text: `${c.factor} — ${c.evidence}` }));
  if (!why.length) why.push({ kind: "assumption", text: "No single factor stands out; the change is spread across ads and may be normal week-to-week variance." });

  const next: InsightItem[] = [];
  const tests: InsightItem[] = [];
  const findings: Investigation["findings"] = [];
  const bad = an.tone === "worse";
  if (bad && topAd && topAd.share >= 25) {
    next.push({ kind: "recommendation", text: `Cut or pause "${topAd.key}" and move its budget to the best-performing ad; it drives ${topAd.share.toFixed(0)}% of the decline.` });
    findings.push({ finding: `"${topAd.key}" drives ${topAd.share.toFixed(0)}% of the ${an.metric} change`, evidence: `${fmtMetric(an.metric, topAd.valuePrev)} → ${fmtMetric(an.metric, topAd.valueCurr)} on ${money(topAd.spendCurr)} spend`, recommendation: "Pause or cut budget; reallocate to the winner", priority: an.severity === "High" ? "High" : "Medium" });
  }
  if (contributing.some((c) => c.factor === "Creative")) {
    next.push({ kind: "recommendation", text: `Refresh creatives${fatigued.length ? ` for ${fatigued.map((a) => `"${a.name}"`).slice(0, 2).join(", ")}` : ""} — CTR is down ${Math.abs(dCtr).toFixed(0)}%.` });
    tests.push({ kind: "recommendation", text: "Test 2 new hooks (first 3 seconds) against the current best ad, same audience, 50/50 split for 5 days." });
    findings.push({ finding: "Creative engagement fell", evidence: `CTR ${P.ctr.toFixed(2)}% → ${C.ctr.toFixed(2)}%${fatigued.length ? `, ${fatigued.length} fatigued ad(s)` : ""}`, recommendation: "Brief new hooks / formats and rotate", priority: dCtr <= -25 ? "High" : "Medium" });
  }
  if (contributing.some((c) => c.factor === "Landing page" || c.factor === "Conversion rate") && dCvr < 0) {
    next.push({ kind: "recommendation", text: `Audit ${lp ?? "the landing page"} (speed, form, offer, tracking) — conversion rate is down ${Math.abs(dCvr).toFixed(0)}%.` });
    tests.push({ kind: "recommendation", text: "A/B test a shorter landing page / lead form against the current page." });
    findings.push({ finding: "Post-click conversion dropped", evidence: `CVR ${P.cvr.toFixed(2)}% → ${C.cvr.toFixed(2)}% with CTR ${fmtChange(dCtr)}`, recommendation: "Landing-page & tracking audit", priority: dCvr <= -30 ? "High" : "Medium" });
  }
  if (aud && contributing.some((c) => c.factor === "Audience")) {
    next.push({ kind: "recommendation", text: `Restructure or narrow "${aud.key}" — it explains ${aud.share.toFixed(0)}% of the change.` });
    tests.push({ kind: "recommendation", text: `Test a lookalike / broad audience against "${aud.key}" with the same creative.` });
    findings.push({ finding: `Audience "${aud.key}" underperforming`, evidence: `${fmtMetric(an.metric, aud.valuePrev)} → ${fmtMetric(an.metric, aud.valueCurr)}`, recommendation: "Reduce budget / test alternative audience", priority: "Medium" });
  }
  if (contributing.some((c) => c.factor === "Budget") && dSpend > 0 && bad) {
    next.push({ kind: "recommendation", text: `Spend rose ${dSpend.toFixed(0)}% — hold budget flat until efficiency recovers; scale only the winning ad sets.` });
    findings.push({ finding: "Budget increase pushed into less efficient inventory", evidence: `Spend ${fmtChange(dSpend)}`, recommendation: "Pause further scaling; scale winners in 15% steps", priority: "Medium" });
  }
  if (contributing.some((c) => c.factor === "Competition")) {
    next.push({ kind: "recommendation", text: "CPM inflation looks platform-wide — shift some budget to lower-CPM placements or platforms rather than cutting winners." });
  }
  if (!bad) {
    next.push({ kind: "recommendation", text: `This is a positive change — identify what drove it${topAd ? ` ("${topAd.key}")` : ""} and consider scaling carefully.` });
    tests.push({ kind: "recommendation", text: "Replicate the winning angle in 2 new variants to confirm it's not a one-week spike." });
  }
  if (!next.length) next.push({ kind: "recommendation", text: "Monitor for another week before acting; no single driver is strong enough to justify a change." });
  if (!tests.length) tests.push({ kind: "recommendation", text: "Run a 7-day holdout on the lowest-performing ad to confirm incremental impact." });
  if (!findings.length) findings.push({ finding: an.headline, evidence: `${fmtMetric(an.metric, an.prev)} → ${fmtMetric(an.metric, an.curr)} (${src})`, recommendation: next[0]!.text, priority: an.severity });

  const mainFactor = contributing[0]?.factor;
  const category: Recommendation["category"] =
    mainFactor === "Creative" ? "Creative" : mainFactor === "Audience" ? "Audience" : mainFactor === "Landing page" ? "Landing Page" : mainFactor === "Funnel" || mainFactor === "Conversion rate" ? "Funnel" : mainFactor === "Budget" ? "Budget" : "Anomaly";

  const recommendation: Omit<Recommendation, "id" | "createdAt"> = {
    agent: "analytics",
    clientId: an.clientId,
    campaignId: an.campaignId,
    title: `${an.headline} — ${an.label}`,
    category,
    finding: `${an.headline} (${fmtMetric(an.metric, an.prev)} → ${fmtMetric(an.metric, an.curr)}).`,
    why: why.filter((w) => w.kind === "data").map((w) => w.text).slice(0, 2).join(" ") || why[0]!.text,
    evidence: [
      { label: an.metric, value: `${fmtMetric(an.metric, an.prev)} → ${fmtMetric(an.metric, an.curr)}`, source: src },
      { label: "Spend", value: `${money(P.spend)} → ${money(C.spend)}`, source: src },
      { label: "CTR", value: `${P.ctr.toFixed(2)}% → ${C.ctr.toFixed(2)}%`, source: src },
      { label: "CVR", value: `${P.cvr.toFixed(2)}% → ${C.cvr.toFixed(2)}%`, source: src },
      ...(topAd ? [{ label: "Top driver", value: `${topAd.key} (${topAd.share.toFixed(0)}%)`, source: src }] : []),
    ],
    assumptions: why.filter((w) => w.kind === "assumption").map((w) => w.text).slice(0, 3),
    recommendation: next.map((n) => n.text).join(" "),
    test: tests[0]?.text,
    priority: an.severity,
    impact: bad && worseIsUp && an.metric === "CPA" && C.conversions ? `Estimate: returning to last week's CPA saves ~${money(Math.max(0, C.spend - C.conversions * P.cpa))}/week at current volume.` : "Estimate: impact depends on the fix — re-measure after 7 days.",
    status: "New",
    action: { type: "create_task", label: `Investigate & fix: ${an.headline} — ${an.label}` },
  };

  return { anomaly: an, whatHappened, why, next, tests, decomposition, componentNote, drivers, checks, findings, recommendation };
}

// ---------- This month vs last month ----------
export interface MonthCompareRow {
  clientId: string;
  client: string;
  curr: Metrics;
  prev: Metrics;
  summary: InsightItem[];
}

/** Last 30 days vs the previous 30, per client, from the campaign daily feed. */
export function compareMonths(campaigns: Campaign[], clients: Client[]): MonthCompareRow[] {
  return clients
    .map((cl) => {
      const cs = campaigns.filter((c) => c.clientId === cl.id && c.metrics.length);
      const curr = derive(sumStats(cs.map((c) => windowStats(c, 0, 30))));
      const prev = derive(sumStats(cs.map((c) => windowStats(c, 30, 30))));
      const summary: InsightItem[] = [];
      if (curr.spend) {
        const src = "Campaign daily metrics · last 30 vs previous 30 days";
        summary.push({ kind: "data", text: `Spend ${money(curr.spend)} (${fmtChange(change(prev.spend, curr.spend))}), revenue ${money(curr.revenue)} (${fmtChange(change(prev.revenue, curr.revenue))}), ROAS ${curr.roas.toFixed(2)}x vs ${prev.roas.toFixed(2)}x.`, source: src });
        summary.push({ kind: "data", text: `Leads ${curr.leads.toLocaleString("en-IN")} (${fmtChange(change(prev.leads, curr.leads))}), conversions ${curr.conversions.toLocaleString("en-IN")}, CPA ${money(curr.cpa)} (${fmtChange(change(prev.cpa, curr.cpa))}).`, source: src });
        const dCpa = change(prev.cpa, curr.cpa);
        const dRoas = change(prev.roas, curr.roas);
        if (dCpa >= 10 || dRoas <= -10) summary.push({ kind: "recommendation", text: "Efficiency slipped month over month — open AI Insights for this client to see which campaigns and ads drove it." });
        else if (dCpa <= -10 || dRoas >= 10) summary.push({ kind: "recommendation", text: "Efficiency improved — candidates for scaling are listed in Performance." });
        else summary.push({ kind: "assumption", text: "Performance is broadly stable month over month (within ±10% on CPA and ROAS)." });
      }
      return { clientId: cl.id, client: cl.company, curr, prev, summary };
    })
    .filter((r) => r.curr.spend > 0)
    .sort((a, b) => b.curr.spend - a.curr.spend);
}
