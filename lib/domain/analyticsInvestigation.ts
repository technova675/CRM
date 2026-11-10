import { z } from "zod";
import { campaignFacts, crmFacts, metrics, metricValue, type Fact, type Metric } from "./analyticsEngine.ts";
import { seoDate } from "./seoWorkspace.ts";
import type { CRMLibrary } from "./crmLibrary";

const day = 86400000;
const metricKeys = Object.keys(metrics) as [Metric, ...Metric[]];
export const investigationInput = z.object({
  source: z.string().min(1).max(300),
  clientId: z.string().max(180),
  metric: z.enum(metricKeys),
  days: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]),
  end: z.union([seoDate, z.literal("")]),
  explain: z.boolean(),
});
export type InvestigationInput = z.infer<typeof investigationInput>;
type Library = Pick<CRMLibrary, "clients" | "campaigns" | "ads" | "creatives" | "leads" | "deals" | "seoProjects" | "analyticsFeeds">;
const scoped = (selected: string, clientId: string) => selected === "All" || selected === clientId;

export function investigationSources(library: Pick<Library, "clients" | "campaigns" | "seoProjects" | "analyticsFeeds">, clientId: string) {
  const names = new Map(library.clients.map(client => [client.id, client.company]));
  const platforms = new Set(library.campaigns.filter(c => scoped(clientId, c.clientId)).flatMap(c => (c.performanceRows ?? []).map(r => r.platform)));
  const reports = (library.analyticsFeeds ?? []).filter(f => names.has(f.clientId) && scoped(clientId, f.clientId));
  const seo = library.seoProjects.filter(p => names.has(p.clientId) && scoped(clientId, p.clientId));
  return [
    ...reports.map(f => ({ id: f.id, label: [f.platform, f.report, names.get(f.clientId), f.account].join(" · ") })),
    ...[...platforms].sort().map(p => ({ id: "paid:" + p, label: "Performance · " + p })),
    ...seo.flatMap(p => [
      ...(p.workspace?.gsc?.daily.length ? [{ id: "gsc:" + p.id, label: "Search Console sync · " + p.domain }] : []),
      ...(p.workspace?.traffic.length ? [{ id: "seo:" + p.id, label: "SEO traffic import · " + p.domain }] : []),
    ]),
    { id: "crm", label: "CRM · Leads and deals created" },
  ];
}

const shift = (date: string, days: number) => new Date(Date.parse(date) + days * day).toISOString().slice(0, 10);
const change = (a: number | null, b: number | null) => a === null || b === null || b === 0 ? null : Math.round((a - b) / b * 1000) / 10;
type Window = { start: string; end: string };
function period(rows: Fact[], metric: Metric) {
  const reading = metricValue(rows, metric);
  const measuredDays = new Set(rows.filter(row => metricValue([row], metric).measured > 0).map(row => row.date)).size;
  return { ...reading, measuredDays, rows: rows.length };
}
type Reading = ReturnType<typeof period>;
export type Evidence = {
  id: string; topic: string; label: string; metric?: Metric; current?: Reading; previous?: Reading;
  delta?: number | null; detail?: string; grain?: string;
};
const topics = {
  creative: "Creative", audience: "Audience", placement: "Placement", landingPage: "Landing page",
} as const;
export type Brief = ReturnType<typeof buildInvestigation>;
const covers = (row: Fact, window: Window) => row.date >= window.start && row.date <= window.end;

export function resolveAnalyticsFeed(library: Library, input: Pick<InvestigationInput, "source" | "clientId">) {
  const source = investigationSources(library, input.clientId).find(item => item.id === input.source);
  if (!source) return null;
  const feed = library.analyticsFeeds?.find(f => f.id === source.id);
  const project = library.seoProjects.find(p => source.id === "gsc:" + p.id || source.id === "seo:" + p.id);
  const platform = source.id.startsWith("paid:") ? source.id.slice(5) : "";
  const campaigns = platform ? library.campaigns.filter(c => scoped(input.clientId, c.clientId) && (c.performanceRows ?? []).some(r => r.platform === platform)) : [];
  const currency = feed?.currency ?? (platform ? "INR" : undefined);
  const filter = (rows: Fact[]) => rows.filter(r => scoped(input.clientId, r.clientId) && (!platform || r.platform === platform));
  const rows = filter(feed ? feed.rows.map(row => ({ ...row, clientId: feed.clientId, platform: feed.platform, currency, origin: feed.method }))
    : project ? (source.id.startsWith("gsc:") ? project.workspace?.gsc?.daily ?? [] : project.workspace?.traffic ?? []).map(row => ({
      ...row, clientId: project.clientId, platform: "Search Console", origin: "Saved SEO data",
    }))
    : platform ? campaignFacts(campaigns, library.ads, library.creatives, false) : crmFacts(library.leads, library.deals));
  return { source, currency, rows, campaigns, project, detail: () => platform ? filter(campaignFacts(campaigns, library.ads, library.creatives, true)) : rows };
}

export function buildInvestigation(library: Library, input: InvestigationInput) {
  const feed = resolveAnalyticsFeed(library, input);
  if (!feed) return null;
  const { source, currency, rows, campaigns, project } = feed;
  const platform = source.id.startsWith("paid:");
  const end = input.end || rows.reduce((latest, row) => row.date > latest ? row.date : latest, "");
  if (!end) return { source, currency, reason: "No dated records for this feed and client." } as const;
  const current = { start: shift(end, 1 - input.days), end };
  const previous = { start: shift(end, 1 - input.days * 2), end: shift(end, -input.days) };
  const now = rows.filter(row => covers(row, current));
  const before = rows.filter(row => covers(row, previous));
  const evidence: Evidence[] = [];
  const gaps: string[] = [];
  const addMetric = (topic: string, label: string, metric: Metric, a = now, b = before, grain?: string) => {
    const recent = period(a, metric), prior = period(b, metric);
    if (!recent.measured && !prior.measured) return;
    const delta = recent.measuredDays === input.days && prior.measuredDays === input.days && recent.measured === recent.rows && prior.measured === prior.rows ? change(recent.value, prior.value) : null;
    evidence.push({ id: "E" + (evidence.length + 1), topic, label, metric, current: recent, previous: prior, delta, grain });
  };
  addMetric("Historical performance", metrics[input.metric], input.metric);
  const primary = evidence[0];
  const comparable = primary?.current?.value != null && primary?.previous?.value != null &&
    primary.current.measuredDays === input.days && primary.previous.measuredDays === input.days &&
    primary.current.measured === primary.current.rows && primary.previous.measured === primary.previous.rows;
  if (!comparable) gaps.push("The selected metric needs values in both windows with complete daily and row coverage to support a headline comparison.");
  const checks: [string, Metric[]][] = [
    ["Budget", ["spend", "cpm"]],
    ["Funnel", ["impressions", "clicks", "sessions", "leads", "conversions", "orders", "deals"]],
    ["Conversion rate", ["ctr", "cvr", "cpc", "cpa", "roas"]],
  ];
  for (const [topic, keys] of checks) {
    const start = evidence.length;
    for (const key of keys) addMetric(topic, metrics[key], key);
    if (evidence.length === start) gaps.push(topic + " metrics were unavailable in the selected feed and windows.");
  }

  const detail = feed.detail();
  for (const [key, topic] of Object.entries(topics) as [keyof typeof topics, string][]) {
    const groups = new Map<string, { now: Fact[]; before: Fact[] }>();
    for (const row of detail) {
      const name = row[key];
      if (!name || (!covers(row, current) && !covers(row, previous))) continue;
      const group = groups.get(name) ?? { now: [], before: [] };
      (covers(row, current) ? group.now : group.before).push(row);
      groups.set(name, group);
    }
    const eligible = [...groups].filter(([, group]) => group.now.length && group.before.length)
      .map(([name, group]) => ({ name, ...group, size: group.now.length + group.before.length }))
      .filter(group => metricValue(group.now, input.metric).value != null && metricValue(group.before, input.metric).value != null)
      .sort((a, b) => b.size - a.size).slice(0, 3);
    for (const group of eligible) addMetric(topic, group.name, input.metric, group.now, group.before, platform ? "Dated ad breakdown" : "Selected report breakdown");
    if (!eligible.length) gaps.push(topic + " lacks comparable breakdown data for the selected metric.");
  }
  const observedCampaigns = new Set([...now, ...before].map(row => row.dimensionIds?.campaign));
  const scopedCampaigns = campaigns.filter(c => observedCampaigns.has(c.id));
  const budget = scopedCampaigns.filter(c => c.budget > 0).length;
  const pages = scopedCampaigns.filter(c => c.landingPage?.trim()).length;
  if (budget) evidence.push({ id: "E" + (evidence.length + 1), topic: "Budget", label: "Planning context", detail: budget + " campaigns have a current planning budget. Historical budget changes are unavailable." });
  if (pages) evidence.push({ id: "E" + (evidence.length + 1), topic: "Landing page", label: "Campaign setup", detail: pages + " campaigns have a saved destination. Page-level results or change history are not implied." });
  const measuredClients = new Set([...now, ...before].map(row => row.clientId));
  const competitionProjects = project ? [project] : library.seoProjects.filter(p => measuredClients.has(p.clientId));
  const observations = competitionProjects.reduce((total, p) => total +
    (p.workspace?.competitors.filter(row => row.date >= previous.start && row.date <= current.end).length ?? 0), 0);
  if (observations) evidence.push({ id: "E" + (evidence.length + 1), topic: "Competition", label: "Saved SEO observations", detail: observations + " competitor keyword observations are dated within these windows. This is contextual SEO evidence only." });
  else gaps.push("Competition data is unavailable for this feed and period. Competitor activity remains unverified.");
  if (evidence.some(e => e.grain)) gaps.push("Segment evidence is observational and can cover a subset of the headline. The view shows up to three segments per topic by recorded row count.");
  if (evidence.some(e => e.current && (e.current.measured < e.current.rows || e.previous!.measured < e.previous!.rows))) gaps.push("Some metrics are measured in only part of the report. Read row and date coverage before interpreting changes.");
  return { source, currency, current, previous, primary, comparable: !!comparable, evidence, gaps } as const;
}

export const analyticsNarrative = z.object({
  hypotheses: z.array(z.object({ hypothesis: z.string().min(1).max(450), evidenceIds: z.array(z.string()).min(1).max(3), verification: z.string().min(1).max(320) })).min(1).max(4),
  actions: z.array(z.object({ recommendation: z.string().min(1).max(450), priority: z.enum(["High", "Medium", "Low"]), evidenceIds: z.array(z.string()).min(1).max(3) })).min(1).max(3),
  tests: z.array(z.object({ hypothesis: z.string().min(1).max(350), setup: z.string().min(1).max(420), metric: z.string().min(1).max(120), decisionRule: z.string().min(1).max(320), evidenceIds: z.array(z.string()).min(1).max(3) })).min(1).max(3),
});
export type AnalyticsNarrative = z.infer<typeof analyticsNarrative>;
