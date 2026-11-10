import { z } from "zod";
import { metricValue, metrics, type Fact, type Metric } from "./analyticsEngine.ts";
import { resolveAnalyticsFeed } from "./analyticsInvestigation.ts";
import { seoDate } from "./seoWorkspace.ts";
import type { CRMLibrary } from "./crmLibrary";

export const cadence = ["Weekly", "Monthly"] as const;
export const reportSelection = z.object({
  clientId: z.string().min(1).max(180), source: z.string().min(1).max(300), frequency: z.enum(cadence), date: seoDate,
  recipients: z.array(z.string().trim().toLowerCase().email().max(254)).max(10),
});
export type ReportSelection = z.infer<typeof reportSelection>;
export const copySchema = z.object({
  summary: z.string().min(1).max(1600),
  insights: z.array(z.object({ text: z.string().min(1).max(400), evidence: z.array(z.string()).min(1).max(3) })).min(1).max(5),
  recommendations: z.array(z.object({ text: z.string().min(1).max(400), priority: z.enum(["High", "Medium", "Low"]) })).min(1).max(4),
  plan: z.array(z.string().min(1).max(350)).min(1).max(4),
});
export type ReportCopy = z.infer<typeof copySchema>;
const stamp = (d: Date) => d.toISOString().slice(0, 10);
const shift = (date: string, days: number) => stamp(new Date(Date.parse(date) + days * 86400000));
export function reportWindow(date: string, frequency: ReportSelection["frequency"]) {
  const d = new Date(date);
  if (frequency === "Weekly") {
    const start = shift(date, -((d.getUTCDay() + 6) % 7));
    return { start, end: shift(start, 6), previousStart: shift(start, -7), previousEnd: shift(start, -1) };
  }
  d.setUTCDate(1);
  const start = stamp(d);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const previousStart = stamp(d);
  d.setUTCMonth(d.getUTCMonth() + 2);
  return { start, end: shift(stamp(d), -1), previousStart, previousEnd: shift(start, -1) };
}
export function clientDay(instant = new Date()) {
  return stamp(new Date(instant.getTime() + 19800000));
}
export function scheduledPeriod(due: string, frequency: ReportSelection["frequency"]) {
  const local = clientDay(new Date(due));
  return shift(reportWindow(local, frequency).start, -1);
}
export function nextClientReportDue(due: string, anchor: string, frequency: ReportSelection["frequency"]) {
  const d = new Date(Date.parse(due) + 19800000);
  if (frequency === "Weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const preferred = new Date(Date.parse(anchor) + 19800000).getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const last = new Date(d);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    d.setUTCDate(Math.min(preferred, last.getUTCDate()));
  }
  return new Date(d.getTime() - 19800000).toISOString();
}
const keys = ["spend", "reach", "sessions", "clicks", "leads", "conversions", "cpa", "roas", "revenue", "orders", "deals"] as const;
type ReportMetric = typeof keys[number];
const labels = { ...metrics, reach: "Reach (single row)", clicks: "Clicks", sessions: "Sessions" };
const dayCount = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000 + 1;
const fmt = (value: number | null) => value == null ? "Unavailable" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
const isMoney = (key: ReportMetric) => ["spend", "cpa", "revenue"].includes(key);
export function printMetric(value: number | null, key: ReportMetric, currency?: string) {
  return value == null ? fmt(value) : (isMoney(key) && currency ? currency + " " : "") + fmt(value) + (key === "roas" ? "×" : "");
}
function reading(rows: Fact[], key: ReportMetric) {
  if (key === "reach") return rows.length === 1 && rows[0].reach != null
    ? { value: rows[0].reach, measured: 1, dates: 1 } : { value: null, measured: 0, dates: 0 };
  const result = metricValue(rows, key as Metric);
  return { ...result, dates: new Set(rows.filter(r => metricValue([r], key as Metric).measured).map(r => r.date)).size };
}
function breakdown(rows: Fact[], dimension: "campaign" | "creative") {
  const groups = new Map<string, { name: string; rows: Fact[] }>();
  for (const row of rows) {
    const name = row[dimension];
    if (!name) continue;
    const key = row.dimensionIds?.[dimension] ?? name;
    const group = groups.get(key) ?? { name, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    name: group.name,
    spend: metricValue(group.rows, "spend").value, leads: metricValue(group.rows, "leads").value,
    conversions: metricValue(group.rows, "conversions").value, cpa: metricValue(group.rows, "cpa").value,
    roas: metricValue(group.rows, "roas").value, revenue: metricValue(group.rows, "revenue").value,
  })).sort((a,b) => (b.spend ?? -1) - (a.spend ?? -1) || a.name.localeCompare(b.name)).slice(0, 25);
}
export function reportFacts(library: CRMLibrary, input: ReportSelection) {
  const client = library.clients.find(c => c.id === input.clientId);
  const feed = resolveAnalyticsFeed(library, input);
  if (!client || !feed || input.clientId === "All") return null;
  const window = reportWindow(input.date, input.frequency);
  const inWindow = (r: Fact) => r.date >= window.start && r.date <= window.end;
  const current = feed.rows.filter(inWindow);
  const previous = feed.rows.filter(r => r.date >= window.previousStart && r.date <= window.previousEnd);
  if (!current.length) return null;
  const recordedCampaigns = new Set(current.map(row => row.dimensionIds?.campaign));
  const goals = feed.campaigns.filter(c => recordedCampaigns.has(c.id)).flatMap(c => c.kpis
    .filter(k => Number.isFinite(k.target))
    .map(k => ({ campaign: c.name, goal: k.label, target: k.target, unit: k.unit }))).slice(0, 30);
  const days = new Set(current.map(r => r.date)).size;
  const previousDays = new Set(previous.map(r => r.date)).size;
  const stats = keys.map(key => {
    const now = reading(current, key), before = reading(previous, key);
    const comparable = key !== "reach" && now.value !== null && before.value !== null && before.value !== 0 &&
      now.measured === current.length && before.measured === previous.length &&
      now.dates === dayCount(window.start, window.end) && before.dates === dayCount(window.previousStart, window.previousEnd);
    return { key, label: labels[key], current: now.value, previous: before.value, measured: now.measured, dates: now.dates,
      delta: comparable ? Math.round((now.value! / before.value! - 1) * 1000) / 10 : null };
  });
  return { company: client.company, source: feed.source.label, currency: feed.currency, window, days, previousDays, rowCount: current.length,
    stats, goals, campaigns: breakdown(current, "campaign"), creatives: breakdown(feed.detail().filter(inWindow), "creative") };
}
export type ClientReportFacts = NonNullable<ReturnType<typeof reportFacts>>;
export interface ClientReport {
  id: string; clientId: string; frequency: ReportSelection["frequency"]; createdAt: string;
  recipients: string[]; facts: ClientReportFacts; copy: ReportCopy; model?: string;
  status: "Draft" | "Approved" | "Rejected" | "Sending" | "Accepted" | "Delivery unknown";
  approved?: { by: string; at: string; hash: string }; due?: string; scheduleId?: string;
  receipt?: string; attemptedAt?: string;
}
export interface ClientReportSchedule {
  id: string; config: Omit<ReportSelection, "date">; anchor: string; due: string; enabled: boolean; error?: string;
  lease?: { id: string; expires: string };
}
export interface ClientReporting { reports: ClientReport[]; schedules: ClientReportSchedule[] }
export const emptyReporting = (): ClientReporting => ({ reports: [], schedules: [] });

export function reportSections(report: ClientReport): { title: string; rows: (string | number)[][] }[] {
  const { facts, copy } = report;
  const table = (items: ClientReportFacts["campaigns"]) => items.length ? [
    ["Name", "Spend", "Leads", "Conversions", "CPA", "ROAS", "Revenue"],
    ...items.map(item => [item.name, ...(["spend", "leads", "conversions", "cpa", "roas", "revenue"] as const).map(key => printMetric(item[key], key, facts.currency))]),
  ] : [["Breakdown unavailable for this source."]];
  return [
    { title: "Executive summary", rows: [[copy.summary], [facts.source], [facts.days + " dates observed · " + facts.rowCount + " rows · " + (report.model ? "AI draft" : "Measured summary")]] },
    { title: "Goals", rows: facts.goals.length ? [["Campaign", "Goal", "Target"], ...facts.goals.map(g => [g.campaign, g.goal, fmt(g.target) + (g.unit ? " " + g.unit : "")])] : [["No linked campaign goals in this source."]] },
    { title: "Metrics", rows: [["Metric", "Current", "Previous", "Measured rows"], ...facts.stats.map(s => [s.label, printMetric(s.current, s.key, facts.currency), printMetric(s.previous, s.key, facts.currency), s.measured + "/" + facts.rowCount]), ["Reach is the value from a single source row, not a deduplicated period total."]] },
    { title: "Campaign performance", rows: table(facts.campaigns) },
    { title: "Creative performance", rows: table(facts.creatives) },
    { title: "Key insights", rows: copy.insights.length ? copy.insights.map(i => [i.text, i.evidence.join(", ")]) : [["Review the measured values and row coverage."]] },
    { title: "What changed", rows: facts.stats.some(s => s.delta !== null) ? [["Metric", "Change"], ...facts.stats.filter(s => s.delta !== null).map(s => [s.label, (s.delta! > 0 ? "+" : "") + fmt(s.delta) + "%"])] : [["A percentage comparison needs measured values and complete coverage in both periods, with a nonzero baseline."]] },
    { title: "What we recommend next", rows: copy.recommendations.length ? copy.recommendations.map(r => [r.priority, r.text]) : [["Review tracking and coverage before acting."]] },
    { title: "Next month's plan", rows: copy.plan.length ? copy.plan.map(item => [item]) : [["Confirm targets, measurement and the next reporting window with the account team."]] },
  ];
}
