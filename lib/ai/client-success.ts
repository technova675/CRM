import type { AdRow, Campaign, Client, Conversation, InsightItem, Invoice, Lead, Message, ScoreFactor, Service, Task } from "../types";
import { recommendServices } from "./research";
import { DAY } from "../utils";

// Client Success agent — local engine (pure). Scores client health from real store data
// and explains every factor. No store imports so it can be used anywhere.

export interface HealthData {
  campaigns: Campaign[];
  invoices: Invoice[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Message[];
}

export interface UpsellOpportunity {
  service?: Service;
  title: string;
  reason: string;
  kind: "service" | "headroom";
}

export interface HealthResult {
  score: number;
  band: Client["health"];
  factors: ScoreFactor[];
  insights: InsightItem[];
  upsell: UpsellOpportunity[];
  churnReasons: string[];
  metrics: { spend30: number; revenue30: number; roas30: number; roas14: number; roasPrev14: number; outstanding: number; overdueInvoices: number; overdueTasks: number; openTasks: number; daysSinceReport: number | null; onboardingPct: number };
}

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

function window(campaigns: Campaign[], from: number, to?: number) {
  let spend = 0;
  let revenue = 0;
  let conversions = 0;
  campaigns.forEach((c) =>
    c.metrics.slice(from, to).forEach((m) => {
      spend += m.spend;
      revenue += m.revenue;
      conversions += m.conversions;
    }),
  );
  return { spend, revenue, conversions, roas: spend ? revenue / spend : 0 };
}

export function clientTasks(clientId: string, tasks: Task[], campaigns: Campaign[]) {
  const campIds = new Set(campaigns.filter((c) => c.clientId === clientId).map((c) => c.id));
  return tasks.filter((t) => (t.related?.type === "client" && t.related.id === clientId) || (t.related?.type === "campaign" && campIds.has(t.related.id)));
}

export function clientHealth(client: Client, data: HealthData, now = Date.now()): HealthResult {
  const campaigns = data.campaigns.filter((c) => c.clientId === client.id);
  const paid = campaigns.filter((c) => c.status !== "Planning" && c.metrics.length);
  const last30 = window(paid, -30);
  const r14 = window(paid, -14);
  const p14 = window(paid, -28, -14);
  const invoices = data.invoices.filter((i) => i.clientId === client.id);
  const overdueInv = invoices.filter((i) => i.status === "Overdue");
  const outstanding = invoices.reduce((a, i) => a + (i.status === "Paid" ? 0 : i.amount - i.paid), 0);
  const tasks = clientTasks(client.id, data.tasks, data.campaigns);
  const open = tasks.filter((t) => t.status !== "Done");
  const overdueTasks = open.filter((t) => new Date(t.dueDate).getTime() < now);
  const daysSinceReport = client.lastReportAt ? Math.floor((now - new Date(client.lastReportAt).getTime()) / DAY) : null;
  const onboardingPct = client.onboarding.length ? client.onboarding.filter((o) => o.done).length / client.onboarding.length : 1;
  const convIds = new Set(data.conversations.filter((c) => c.clientId === client.id).map((c) => c.id));
  const inbound = data.messages.filter((m) => convIds.has(m.conversationId) && m.direction === "inbound" && m.sentiment);
  const pos = inbound.filter((m) => m.sentiment === "positive").length;
  const neg = inbound.filter((m) => m.sentiment === "negative").length;

  const factors: ScoreFactor[] = [];
  const insights: InsightItem[] = [];
  const churn: string[] = [];

  // 1. Performance vs KPI (25)
  const ratios = campaigns.flatMap((c) =>
    c.kpis.filter((k) => k.target > 0).map((k) => clamp(/CPA|CPC|CPL/i.test(k.label) ? (k.actual ? k.target / k.actual : 0) : k.actual / k.target, 0, 1.3)),
  );
  const attain = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  const perfPts = attain == null ? 15 : Math.round(clamp((attain - 0.6) / 0.5) * 25);
  factors.push({ key: "kpi", label: "Performance vs KPI", points: perfPts, max: 25, reason: attain == null ? "No KPI targets set — neutral score" : `${Math.round(attain * 100)}% average KPI attainment across ${ratios.length} KPI${ratios.length > 1 ? "s" : ""}` });
  if (attain != null && attain < 0.85) churn.push(`KPIs under target (${Math.round(attain * 100)}% attainment)`);

  // 2. ROAS trend (15)
  let trendPts = 10;
  let trendReason = "No paid media spend in the last 28 days — neutral score";
  if (r14.spend > 0 && p14.spend > 0 && p14.roas > 0) {
    const change = (r14.roas - p14.roas) / p14.roas;
    trendPts = Math.round(clamp(0.5 + change * 2.5) * 15);
    trendReason = `ROAS ${r14.roas.toFixed(2)}x last 14d vs ${p14.roas.toFixed(2)}x prior 14d (${change >= 0 ? "+" : ""}${Math.round(change * 100)}%)`;
    if (change <= -0.12) churn.push(`ROAS falling ${Math.round(change * 100)}% period-on-period`);
  }
  factors.push({ key: "roas", label: "ROAS trend", points: trendPts, max: 15, reason: trendReason });

  // 3. Billing (15)
  const billPts = overdueInv.length ? Math.max(0, 5 - (overdueInv.length - 1) * 5) : outstanding > 0 ? 12 : 15;
  factors.push({ key: "billing", label: "Invoices", points: billPts, max: 15, reason: overdueInv.length ? `${overdueInv.length} overdue invoice${overdueInv.length > 1 ? "s" : ""} · ₹${outstanding.toLocaleString("en-IN")} outstanding` : outstanding > 0 ? `₹${outstanding.toLocaleString("en-IN")} pending, nothing overdue` : "All invoices paid" });
  if (overdueInv.length) churn.push(`${overdueInv.length} overdue invoice${overdueInv.length > 1 ? "s" : ""}`);

  // 4. Delivery — overdue tasks (10)
  const taskPts = Math.max(0, 10 - overdueTasks.length * 3);
  factors.push({ key: "tasks", label: "Open tasks overdue", points: taskPts, max: 10, reason: `${overdueTasks.length} overdue of ${open.length} open task${open.length === 1 ? "" : "s"}` });
  if (overdueTasks.length >= 2) churn.push(`${overdueTasks.length} overdue deliverables`);

  // 5. Reporting cadence (10)
  const repPts = daysSinceReport == null ? 0 : daysSinceReport <= 14 ? 10 : daysSinceReport <= 30 ? 6 : daysSinceReport <= 45 ? 3 : 0;
  factors.push({ key: "report", label: "Days since last report", points: repPts, max: 10, reason: daysSinceReport == null ? "No report sent yet" : `Last report ${daysSinceReport} day${daysSinceReport === 1 ? "" : "s"} ago` });
  if (daysSinceReport == null || daysSinceReport > 30) churn.push(daysSinceReport == null ? "Never received a report" : `No report in ${daysSinceReport} days`);

  // 6. Onboarding (10)
  const obPts = Math.round(onboardingPct * 10);
  factors.push({ key: "onboarding", label: "Onboarding completion", points: obPts, max: 10, reason: `${Math.round(onboardingPct * 100)}% of onboarding steps done` });
  if (onboardingPct < 0.7) churn.push(`Onboarding stalled at ${Math.round(onboardingPct * 100)}%`);

  // 7. Communication sentiment (15)
  const sentPts = inbound.length ? Math.round(clamp(0.5 + (pos - neg) / (2 * inbound.length)) * 15) : 10;
  factors.push({ key: "sentiment", label: "Communication sentiment", points: sentPts, max: 15, reason: inbound.length ? `${pos} positive · ${neg} negative of ${inbound.length} classified client messages` : "No classified client messages — neutral score" });
  if (neg > pos) churn.push("More negative than positive client messages");

  const score = Math.round(factors.reduce((a, f) => a + f.points, 0));
  const band: Client["health"] = score >= 75 ? "Healthy" : score >= 55 ? "At Risk" : "Churn Risk";

  // Upsell: services that fit the industry but aren't bought + ROAS headroom on live campaigns.
  const upsell: UpsellOpportunity[] = [];
  const fit = recommendServices({ industry: client.industry, services: [] as Service[], website: client.website } as Lead).filter((s) => !client.services.includes(s));
  fit.slice(0, 3).forEach((s) => upsell.push({ kind: "service", service: s, title: `Add ${s}`, reason: `${s} is a core channel for ${client.industry} and ${client.company} doesn't buy it yet.` }));
  campaigns
    .filter((c) => c.status === "Active" && c.metrics.length)
    .forEach((c) => {
      const w = window([c], -30);
      const target = c.kpis.find((k) => k.label === "ROAS")?.target ?? 3;
      if (w.spend > 0 && w.roas >= target * 1.15) upsell.push({ kind: "headroom", service: c.service, title: `Scale ${c.service}`, reason: `ROAS ${w.roas.toFixed(2)}x vs ${target}x target over 30 days — room to raise the ₹${c.budget.toLocaleString("en-IN")} budget.` });
    });

  insights.push({ kind: "data", text: `Health ${score}/100 (${band}).`, source: "Client Success engine" });
  if (last30.spend) insights.push({ kind: "data", text: `Last 30 days: ₹${Math.round(last30.spend).toLocaleString("en-IN")} spend, ₹${Math.round(last30.revenue).toLocaleString("en-IN")} revenue, ${last30.roas.toFixed(2)}x ROAS.`, source: "Ad platforms · last 30 days" });
  factors
    .filter((f) => f.points / f.max < 0.5)
    .forEach((f) => insights.push({ kind: "data", text: `${f.label}: ${f.reason}.`, source: f.key === "billing" ? "Invoices" : f.key === "tasks" ? "Tasks" : f.key === "sentiment" ? "Inbox" : f.key === "report" ? "Reports" : "Campaign KPIs" }));
  if (churn.length) insights.push({ kind: "assumption", text: `Churn risk signals: ${churn.slice(0, 3).join("; ")}. Combined signals — not a prediction.` });
  if (overdueInv.length) insights.push({ kind: "recommendation", text: "Resolve billing before the next QBR — send a reminder and align on the payment schedule." });
  if (daysSinceReport == null || daysSinceReport > 30) insights.push({ kind: "recommendation", text: "Send a performance report this week — reporting gaps are a common churn trigger." });
  if (attain != null && attain < 0.85) insights.push({ kind: "recommendation", text: "Book a performance review call with a recovery plan for under-target KPIs." });
  upsell.slice(0, 2).forEach((u) => insights.push({ kind: "recommendation", text: `${u.title}: ${u.reason}` }));

  return {
    score,
    band,
    factors,
    insights,
    upsell,
    churnReasons: churn,
    metrics: { spend30: last30.spend, revenue30: last30.revenue, roas30: last30.roas, roas14: r14.roas, roasPrev14: p14.roas, outstanding, overdueInvoices: overdueInv.length, overdueTasks: overdueTasks.length, openTasks: open.length, daysSinceReport, onboardingPct },
  };
}

// ---------- Performance memory (auto-derived, read-only block of the knowledge base) ----------
export interface PerformanceMemory {
  bestChannel?: { service: string; roas: number };
  avgCpa?: number;
  topHooks: { hook: string; roas: number; ctr: number; spend: number }[];
  items: InsightItem[];
}

export function performanceMemory(clientId: string, campaigns: Campaign[], ads: AdRow[]): PerformanceMemory {
  const mine = campaigns.filter((c) => c.clientId === clientId && c.metrics.length);
  const byChannel = mine
    .map((c) => ({ service: c.service, ...window([c], -60) }))
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.roas - a.roas);
  const all = window(mine, -60);
  const avgCpa = all.conversions ? all.spend / all.conversions : undefined;
  const hookMap = new Map<string, { spend: number; revenue: number; clicks: number; impressions: number }>();
  ads
    .filter((a) => a.clientId === clientId && a.hook)
    .forEach((a) => {
      const h = hookMap.get(a.hook!) ?? { spend: 0, revenue: 0, clicks: 0, impressions: 0 };
      [a.prev, a.curr].forEach((s) => {
        h.spend += s.spend;
        h.revenue += s.revenue;
        h.clicks += s.clicks;
        h.impressions += s.impressions;
      });
      hookMap.set(a.hook!, h);
    });
  const topHooks = [...hookMap.entries()]
    .map(([hook, h]) => ({ hook, roas: h.spend ? h.revenue / h.spend : 0, ctr: h.impressions ? (h.clicks / h.impressions) * 100 : 0, spend: h.spend }))
    .filter((h) => h.spend > 0)
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 3);
  const items: InsightItem[] = [];
  const best = byChannel[0];
  if (best) items.push({ kind: "data", text: `Best channel by ROAS: ${best.service} at ${best.roas.toFixed(2)}x.`, source: "Campaign metrics · last 60 days" });
  if (avgCpa) items.push({ kind: "data", text: `Average CPA ₹${Math.round(avgCpa).toLocaleString("en-IN")} across ${mine.length} campaign${mine.length > 1 ? "s" : ""}.`, source: "Campaign metrics · last 60 days" });
  topHooks.forEach((h, i) => items.push({ kind: "data", text: `Top hook #${i + 1}: “${h.hook}” — ${h.roas.toFixed(2)}x ROAS, ${h.ctr.toFixed(2)}% CTR.`, source: "Ad-level data · last 14 days" }));
  if (!items.length) items.push({ kind: "assumption", text: "No campaign history yet — performance memory fills in automatically once campaigns run." });
  return { bestChannel: best ? { service: best.service, roas: best.roas } : undefined, avgCpa, topHooks, items };
}

// Knowledge completeness (0..100) for the AI memory meter.
export function knowledgeCompleteness(k: { brandVoice: string; toneWords: string[]; products: unknown[]; audience: string; competitors: string[]; approvedMessaging: string[]; rejectedConcepts: string[]; preferences: string[]; guidelines: string; history: string[] } | undefined) {
  if (!k) return { pct: 0, missing: ["Everything"] };
  const checks: [string, boolean][] = [
    ["Brand voice", !!k.brandVoice.trim()],
    ["Tone words", k.toneWords.length >= 2],
    ["Products", k.products.length > 0],
    ["Audience", !!k.audience.trim()],
    ["Competitors", k.competitors.length > 0],
    ["Approved messaging", k.approvedMessaging.length > 0],
    ["Rejected concepts", k.rejectedConcepts.length > 0],
    ["Preferences", k.preferences.length > 0],
    ["Brand guidelines", !!k.guidelines.trim()],
    ["Campaign history", k.history.length > 0],
  ];
  return { pct: Math.round((checks.filter((c) => c[1]).length / checks.length) * 100), missing: checks.filter((c) => !c[1]).map((c) => c[0]) };
}
