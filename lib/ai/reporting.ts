import type { AdStats, CampaignKPI, DailyMetric, InsightItem } from "../types";

// Reporting agent — pure calculations shared by the Reports page (browser) and /api/ai/report (server).
// Every number in a report is computed here; the model only investigates and explains them.

export interface ReportCampaign {
  id: string;
  label: string;
  platform: string;
  status: string;
  kpis: CampaignKPI[];
  metrics: DailyMetric[];
}
export interface ReportAd {
  name: string;
  platform: string;
  format: string;
  frequency: number;
  prev: AdStats;
  curr: AdStats;
}
// The authorized, pre-filtered slice of one client's data that the browser sends to the agent.
export interface ReportDataset {
  client: { id: string; company: string; industry: string };
  days: number;
  campaigns: ReportCampaign[];
  ads: ReportAd[];
  recommendations: { title: string; recommendation: string; priority: "High" | "Medium" | "Low"; impact?: string }[];
  plannedTests: { week: string; test: string; hypothesis: string }[];
  focus?: string;
}

export interface ReportWindow {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  days: number;
}
export interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  ctr: number; // %
  cpc: number;
  cpl: number;
  cpa: number;
  roas: number;
}
export interface ReportFacts {
  client: string;
  window: ReportWindow;
  daysWithData: number;
  current: Totals;
  previous: Totals | null; // null when there is no data for the previous window
  changePct: Record<keyof Totals, number | null> | null;
  campaigns: {
    name: string;
    platform: string;
    status: string;
    spend: number;
    revenue: number;
    leads: number;
    conversions: number;
    ctr: number;
    cpa: number;
    roas: number;
    spendSharePct: number;
    revenueSharePct: number;
    roasChangePct: number | null;
    cpaChangePct: number | null;
  }[];
  weekly: { weekStarting: string; days: number; spend: number; revenue: number; leads: number; conversions: number; cpa: number; roas: number }[];
  anomalies: { date: string; metric: string; value: number; typical: number; direction: "above" | "below" }[];
  goals: { campaign: string; kpi: string; target: number; actual: number; unit?: string; progressPct: number }[];
  creatives: { name: string; platform: string; format: string; spend: number; ctr: number; cpa: number; roas: number; roasChangePct: number | null; frequency: number }[];
  openRecommendations: ReportDataset["recommendations"];
  plannedTests: ReportDataset["plannedTests"];
}

export interface AgentReportContent {
  headline: string;
  summary: string;
  insights: InsightItem[];
  changes: InsightItem[];
  recommendations: { text: string; priority: "High" | "Medium" | "Low" }[];
  plan: string[];
  emailSubject: string;
  emailBody: string;
  facts: ReportFacts;
  steps: { tool: string; detail: string }[]; // what the agent did, in order
  mode: "ai" | "local";
  model?: string;
  note?: string; // e.g. why the local engine was used
}

const round = (n: number, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);
const change = (a: number, b: number) => (b ? round(((a - b) / b) * 100, 1) : null);

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The reporting window ends on the latest date that has data (uploads are rarely up to today),
// and is compared with the same number of days immediately before it.
export function reportWindow(campaigns: { metrics: DailyMetric[] }[], days: number): ReportWindow {
  let end = "";
  for (const c of campaigns) for (const m of c.metrics) if (m.date > end) end = m.date;
  if (!end) end = new Date().toISOString().slice(0, 10);
  const start = addDays(end, -(days - 1));
  return { start, end, prevStart: addDays(start, -days), prevEnd: addDays(start, -1), days };
}

export const inWindow = (metrics: DailyMetric[], from: string, to: string) => metrics.filter((m) => m.date >= from && m.date <= to);

export function sumMetrics(rows: DailyMetric[]): Totals {
  const t = { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, conversions: 0, revenue: 0 };
  for (const r of rows) {
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.reach += r.reach;
    t.clicks += r.clicks;
    t.leads += r.leads;
    t.conversions += r.conversions;
    t.revenue += r.revenue;
  }
  return {
    ...t,
    spend: round(t.spend),
    revenue: round(t.revenue),
    ctr: t.impressions ? round((t.clicks / t.impressions) * 100) : 0,
    cpc: t.clicks ? round(t.spend / t.clicks) : 0,
    cpl: t.leads ? round(t.spend / t.leads) : 0,
    cpa: t.conversions ? round(t.spend / t.conversions) : 0,
    roas: t.spend ? round(t.revenue / t.spend) : 0,
  };
}

function byDate(rows: DailyMetric[]) {
  const map = new Map<string, DailyMetric[]>();
  for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rs]) => ({ date, ...sumMetrics(rs) }));
}

// Days whose value sits 2+ standard deviations away from the window's average.
function findAnomalies(daily: ReturnType<typeof byDate>): ReportFacts["anomalies"] {
  if (daily.length < 7) return [];
  const out: (ReportFacts["anomalies"][number] & { z: number })[] = [];
  for (const metric of ["spend", "conversions", "cpa", "roas"] as const) {
    const xs = daily.filter((d) => metric === "spend" || d.spend > 0);
    const vals = xs.map((d) => d[metric]);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1));
    if (!sd) continue;
    for (const d of xs) {
      const z = (d[metric] - mean) / sd;
      if (Math.abs(z) >= 2) out.push({ date: d.date, metric, value: round(d[metric]), typical: round(mean), direction: z > 0 ? "above" : "below", z: Math.abs(z) });
    }
  }
  return out.sort((a, b) => b.z - a.z).slice(0, 6).map((a) => ({ date: a.date, metric: a.metric, value: a.value, typical: a.typical, direction: a.direction }));
}

export function buildFacts(ds: ReportDataset): ReportFacts {
  const w = reportWindow(ds.campaigns, ds.days);
  const cur = ds.campaigns.flatMap((c) => inWindow(c.metrics, w.start, w.end));
  const prev = ds.campaigns.flatMap((c) => inWindow(c.metrics, w.prevStart, w.prevEnd));
  const current = sumMetrics(cur);
  const previous = prev.length ? sumMetrics(prev) : null;
  const daily = byDate(cur);

  const campaigns = ds.campaigns
    .map((c) => {
      const t = sumMetrics(inWindow(c.metrics, w.start, w.end));
      const p = sumMetrics(inWindow(c.metrics, w.prevStart, w.prevEnd));
      return {
        name: c.label, platform: c.platform, status: c.status,
        spend: t.spend, revenue: t.revenue, leads: t.leads, conversions: t.conversions, ctr: t.ctr, cpa: t.cpa, roas: t.roas,
        spendSharePct: current.spend ? round((t.spend / current.spend) * 100, 1) : 0,
        revenueSharePct: current.revenue ? round((t.revenue / current.revenue) * 100, 1) : 0,
        roasChangePct: change(t.roas, p.roas),
        cpaChangePct: change(t.cpa, p.cpa),
      };
    })
    .filter((c) => c.spend > 0 || c.revenue > 0)
    .sort((a, b) => b.spend - a.spend);

  const weekly: ReportFacts["weekly"] = [];
  for (let from = w.start; from <= w.end; from = addDays(from, 7)) {
    const to = addDays(from, 6) > w.end ? w.end : addDays(from, 6);
    const rows = cur.filter((m) => m.date >= from && m.date <= to);
    const t = sumMetrics(rows);
    if (rows.length) weekly.push({ weekStarting: from, days: new Set(rows.map((r) => r.date)).size, spend: t.spend, revenue: t.revenue, leads: t.leads, conversions: t.conversions, cpa: t.cpa, roas: t.roas });
  }

  const goals = ds.campaigns.flatMap((c) =>
    c.kpis.map((k) => {
      const lowerIsBetter = /cpa|cpc|cpl|cost/i.test(k.label);
      const ratio = k.target ? (lowerIsBetter ? (k.actual ? k.target / k.actual : 0) : k.actual / k.target) * 100 : 0;
      return { campaign: c.label, kpi: k.label, target: k.target, actual: k.actual, unit: k.unit, progressPct: round(ratio, 0) };
    }),
  );

  const creatives = ds.ads
    .map((a) => {
      const roas = a.curr.spend ? a.curr.revenue / a.curr.spend : 0;
      const prevRoas = a.prev.spend ? a.prev.revenue / a.prev.spend : 0;
      return {
        name: a.name, platform: a.platform, format: a.format, spend: round(a.curr.spend),
        ctr: a.curr.impressions ? round((a.curr.clicks / a.curr.impressions) * 100) : 0,
        cpa: a.curr.conversions ? round(a.curr.spend / a.curr.conversions) : 0,
        roas: round(roas), roasChangePct: change(roas, prevRoas), frequency: round(a.frequency, 1),
      };
    })
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 10);

  const keys = Object.keys(current) as (keyof Totals)[];
  return {
    client: ds.client.company,
    window: w,
    daysWithData: daily.length,
    current,
    previous,
    changePct: previous ? (Object.fromEntries(keys.map((k) => [k, change(current[k], previous[k])])) as ReportFacts["changePct"]) : null,
    campaigns,
    weekly,
    anomalies: findAnomalies(daily),
    goals,
    creatives,
    openRecommendations: ds.recommendations.slice(0, 6),
    plannedTests: ds.plannedTests.slice(0, 4),
  };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
export const windowLabel = (w: ReportWindow) => `${w.start} to ${w.end} (${w.days} days)`;

// Deterministic report used when no AI provider is configured, or when the model call fails.
export function localReport(facts: ReportFacts, note?: string): AgentReportContent {
  const { current: t, changePct: d, campaigns } = facts;
  const src = `Campaign daily metrics · ${facts.window.start} to ${facts.window.end}`;
  const withSpend = campaigns.filter((c) => c.spend > 0);
  const best = [...withSpend].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...withSpend].sort((a, b) => a.roas - b.roas)[0];
  const insights: InsightItem[] = [];
  const changes: InsightItem[] = [];
  const recommendations: AgentReportContent["recommendations"] = [];
  const plan: string[] = [];

  if (best) insights.push({ kind: "data", text: `${best.name} is the strongest campaign at ${best.roas.toFixed(2)}x ROAS, driving ${best.revenueSharePct}% of revenue on ${best.spendSharePct}% of spend.`, source: src });
  if (worst && best && worst.name !== best.name) insights.push({ kind: "data", text: `${worst.name} is the weakest at ${worst.roas.toFixed(2)}x ROAS and ${inr(worst.cpa)} CPA.`, source: src });
  if (t.impressions) insights.push(t.ctr < 1.2 ? { kind: "assumption", text: `CTR is ${t.ctr.toFixed(2)}%, below the ~1.2% we'd expect; creative fatigue or weak hooks are the likely cause.` } : { kind: "data", text: `CTR is ${t.ctr.toFixed(2)}% at ${inr(t.cpc)} CPC.`, source: src });
  facts.anomalies.slice(0, 2).forEach((a) => insights.push({ kind: "data", text: `${a.metric.toUpperCase()} on ${a.date} was ${a.value.toLocaleString("en-IN")}, well ${a.direction} the typical ${a.typical.toLocaleString("en-IN")}.`, source: src }));

  if (d) {
    (["spend", "revenue", "leads", "conversions", "cpa", "roas", "ctr"] as const).forEach((k) => {
      const v = d[k];
      if (v !== null && Math.abs(v) >= 5) changes.push({ kind: "data", text: `${k === "cpa" || k === "roas" || k === "ctr" ? k.toUpperCase() : k[0]!.toUpperCase() + k.slice(1)} ${v >= 0 ? "up" : "down"} ${Math.abs(v).toFixed(0)}% vs the previous ${facts.window.days} days.`, source: src });
    });
    campaigns.forEach((c) => { if (c.roasChangePct !== null && Math.abs(c.roasChangePct) >= 15) changes.push({ kind: "data", text: `${c.name} ROAS moved ${signed(c.roasChangePct)} to ${c.roas.toFixed(2)}x.`, source: src }); });
    if (!changes.length) changes.push({ kind: "data", text: "No headline metric moved more than 5%; performance was stable.", source: src });
  } else {
    changes.push({ kind: "data", text: `There is no data for the previous ${facts.window.days} days, so no comparison is available.`, source: src });
  }

  facts.openRecommendations.slice(0, 3).forEach((r) => recommendations.push({ text: `${r.title}: ${r.recommendation}${r.impact ? ` (est. ${r.impact})` : ""}`, priority: r.priority }));
  if (worst && best && worst.name !== best.name && worst.roas < 2) recommendations.push({ text: `Shift budget from ${worst.name} (${worst.roas.toFixed(2)}x) toward ${best.name} (${best.roas.toFixed(2)}x).`, priority: "High" });
  if (t.impressions && t.ctr < 1.2) recommendations.push({ text: "Refresh creatives: test 3 new hooks and a UGC-style variant.", priority: "Medium" });
  if (!recommendations.length) recommendations.push({ text: "Keep the current allocation and scale the best performer gradually (+10–15% a week) while CPA holds.", priority: "Medium" });

  if (best) plan.push(`Scale ${best.name} in controlled steps while CPA stays below ${inr(t.cpa * 1.1)}.`);
  if (facts.creatives[0]) plan.push(`Build 3 iterations of the top creative (${facts.creatives[0].name}).`);
  facts.plannedTests.slice(0, 2).forEach((x) => plan.push(`${x.week}: ${x.test} — ${x.hypothesis}`));
  facts.goals.filter((g) => g.progressPct < 90).slice(0, 2).forEach((g) => plan.push(`Close the gap on ${g.campaign} ${g.kpi} (${g.actual} vs target ${g.target}).`));
  if (!plan.length) plan.push("Agree next month's detailed plan in the monthly review call.");

  const summary = t.spend || t.revenue
    ? `${inr(t.spend)} was invested across ${withSpend.length} campaign(s), returning ${inr(t.revenue)} in revenue at ${t.roas.toFixed(2)}x ROAS. The account generated ${t.leads.toLocaleString("en-IN")} leads and ${t.conversions.toLocaleString("en-IN")} conversions at ${inr(t.cpa)} CPA${d?.cpa != null ? ` (${signed(d.cpa)} vs the previous period)` : ""}.${best ? ` ${best.name} was the best performer.` : ""}`
    : "There is no performance data for this period.";

  return {
    headline: `${facts.client}: ${t.roas.toFixed(2)}x ROAS on ${inr(t.spend)} spend`,
    summary,
    insights,
    changes,
    recommendations,
    plan,
    emailSubject: `${facts.client} performance report: ${facts.window.start} to ${facts.window.end}`,
    emailBody: `Hi,\n\nHere is your performance report for ${facts.window.start} to ${facts.window.end}.\n\n${summary}\n\nNext steps:\n${recommendations.slice(0, 3).map((r) => `- ${r.text}`).join("\n")}\n\nThe full report is attached. Happy to walk through it on a call.\n\nBest,\nAdbibe`,
    facts,
    steps: [
      { tool: "get_overview", detail: `Totalled ${facts.daysWithData} day(s) of data and compared with the previous ${facts.window.days} days` },
      { tool: "get_campaign_breakdown", detail: `Ranked ${campaigns.length} campaign(s)` },
      { tool: "find_anomalies", detail: `${facts.anomalies.length} unusual day(s) found` },
    ],
    mode: "local",
    note,
  };
}
