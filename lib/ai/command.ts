import type { CRMState } from "../store";
import type { AdStats, AgentId, Campaign, Client, DailyMetric, InsightItem, Lead, Priority, Recommendation, Service, TeamMember } from "../types";
import { SERVICES } from "../types";
import { can, type Module } from "../permissions";
import { routeToAgent } from "./agents";
import { recommendServices } from "./research";
import { effectiveScore } from "./scoring";
import { personalizeFirstMessage } from "./outreach";
import { answerLocally } from "./assistant";
import { compactMoney, DAY, fmtShort, isPast, startOfDay, sum, uid } from "../utils";

// =====================================================================
// Local AI Command Center engine.
// Deterministic: every number is computed from authorized store data
// (campaign metrics last 30 vs previous 30 days, ad rows this week vs last
// week, invoices, client health, tasks, leads, deals). Every line is tagged
// as data / assumption / recommendation. With an AI provider the model
// receives a compact, RBAC-filtered snapshot and its prose is merged with the
// deterministic items and links produced here.
// =====================================================================

export type CmdState = Pick<
  CRMState,
  | "leads" | "deals" | "proposals" | "clients" | "campaigns" | "ads" | "tasks" | "invoices" | "expenses" | "meetings" | "messages" | "conversations"
  | "recommendations" | "creatives" | "concepts" | "socialPosts" | "seoProjects" | "strategies" | "knowledge" | "assets" | "influencers" | "engagements"
  | "reports" | "aiTasks" | "approvals" | "automations" | "team" | "settings"
>;

export interface CommandTodo {
  text: string;
  clientId?: string;
  campaignId?: string;
  leadId?: string;
  priority?: Priority;
}
export interface CommandAction {
  label: string;
  href: string;
  primary?: boolean;
}
export interface CommandAnswer {
  agent: AgentId;
  content: string;
  steps: string[];
  insights: InsightItem[];
  items: { label: string; sub?: string; href?: string }[];
  actions?: CommandAction[];
  todos?: CommandTodo[];
  newRecommendations?: Recommendation[];
  clientId?: string;
  clarify?: { question: string; q: string; options: { id: string; label: string }[] };
}
export interface CommandOpts {
  agent?: AgentId; // pinned agent (undefined = auto-route)
  clientId?: string; // client picked in the composer ("this client")
}

export const COMMAND_EXAMPLES = [
  "Show me all leads that need follow-up.",
  "Which clients are underperforming?",
  "Which campaigns need attention?",
  "Create a strategy for this client.",
  "Analyze this client's Meta and Google Ads.",
  "Create 10 creative concepts.",
  "Create a monthly content calendar.",
  "Summarize this client.",
  "Create a client report.",
  "Which clients are at risk?",
  "Which clients can we upsell?",
  "What should the media team optimize today?",
  "Find campaigns with rising CPA.",
  "Create a proposal.",
  "Draft an email to this client.",
  "Create a performance summary.",
  "Compare this month's performance with last month.",
];

// ---------- RBAC scoping ----------
export interface CmdAccess {
  leads: boolean; pipeline: boolean; proposals: boolean; clients: boolean; media: boolean; payments: boolean; tasks: boolean; creative: boolean;
  social: boolean; seo: boolean; strategy: boolean; documents: boolean; influencers: boolean; inbox: boolean; reports: boolean; meetings: boolean; automations: boolean;
}
export interface Scoped extends CmdState {
  access: CmdAccess;
  me: TeamMember;
}

export function accessOf(me: TeamMember): CmdAccess {
  const c = (m: Module) => can(me.role, m);
  return {
    leads: c("leads"), pipeline: c("pipeline"), proposals: c("proposals"), clients: c("clients"),
    media: c("campaigns") || c("performance") || c("analytics"), payments: c("payments"), tasks: c("tasks"), creative: c("creative"),
    social: c("social"), seo: c("seo"), strategy: c("strategy"), documents: c("documents"), influencers: c("influencers"), inbox: c("inbox"),
    reports: c("reports"), meetings: c("meetings"), automations: c("automations"),
  };
}

// Returns only the records the current user is authorized to see. The engine and
// the model snapshot are both built from this view, never from the raw store.
export function scopeState(s: CmdState, me: TeamMember): Scoped {
  const acc = accessOf(me);
  const portal = me.role === "client";
  const own = <T extends { clientId?: string }>(xs: T[]) => (portal ? xs.filter((x) => x.clientId === me.clientId) : xs);
  const gate = <T,>(ok: boolean, xs: T[]) => (ok ? xs : []);
  const clients = gate(acc.clients || acc.media || acc.payments, portal ? s.clients.filter((c) => c.id === me.clientId) : s.clients);
  const convs = gate(acc.inbox, portal ? s.conversations.filter((c) => c.clientId === me.clientId) : s.conversations);
  const convIds = new Set(convs.map((c) => c.id));
  return {
    ...s,
    me,
    access: acc,
    leads: gate(acc.leads && !portal, s.leads),
    deals: gate(acc.pipeline && !portal, s.deals),
    proposals: gate(acc.proposals && !portal, s.proposals),
    clients,
    campaigns: gate(acc.media, own(s.campaigns)),
    ads: gate(acc.media, own(s.ads)),
    invoices: gate(acc.payments, own(s.invoices)),
    expenses: gate(acc.payments && !portal, s.expenses),
    tasks: gate(acc.tasks, portal ? s.tasks.filter((t) => t.related?.id === me.clientId) : s.tasks),
    meetings: gate(acc.meetings, own(s.meetings)),
    conversations: convs,
    messages: s.messages.filter((m) => convIds.has(m.conversationId)),
    recommendations: gate(acc.media || acc.clients, own(s.recommendations)),
    creatives: gate(acc.creative, own(s.creatives)),
    concepts: gate(acc.creative && !portal, own(s.concepts)),
    socialPosts: gate(acc.social, own(s.socialPosts)),
    seoProjects: gate(acc.seo, own(s.seoProjects)),
    strategies: gate(acc.strategy && !portal, own(s.strategies)),
    knowledge: gate(!portal, own(s.knowledge)),
    assets: gate(acc.documents, portal ? s.assets.filter((a) => a.clientId === me.clientId && a.clientVisible) : s.assets),
    influencers: gate(acc.influencers && !portal, s.influencers),
    engagements: gate(acc.influencers && !portal, own(s.engagements)),
    reports: gate(acc.reports, own(s.reports)),
    aiTasks: portal ? [] : s.aiTasks,
    approvals: portal ? [] : s.approvals,
    automations: gate(acc.automations, s.automations),
  };
}

// ---------- Metric helpers ----------
export interface Perf {
  spend: number; revenue: number; leads: number; conversions: number; clicks: number; impressions: number;
  roas: number; cpa: number; cpl: number; ctr: number;
}
const finish = (t: Omit<Perf, "roas" | "cpa" | "cpl" | "ctr">): Perf => ({
  ...t,
  roas: t.spend ? t.revenue / t.spend : 0,
  cpa: t.conversions ? t.spend / t.conversions : 0,
  cpl: t.leads ? t.spend / t.leads : 0,
  ctr: t.impressions ? (t.clicks / t.impressions) * 100 : 0,
});
export function perfOf(ms: DailyMetric[]): Perf {
  return finish({
    spend: sum(ms.map((m) => m.spend)), revenue: sum(ms.map((m) => m.revenue)), leads: sum(ms.map((m) => m.leads)),
    conversions: sum(ms.map((m) => m.conversions)), clicks: sum(ms.map((m) => m.clicks)), impressions: sum(ms.map((m) => m.impressions)),
  });
}
export function adPerf(a: AdStats): Perf {
  return finish({ spend: a.spend, revenue: a.revenue, leads: a.leads, conversions: a.conversions, clicks: a.clicks, impressions: a.impressions });
}
export const campPerf = (c: Campaign) => ({ curr: perfOf(c.metrics.slice(-30)), prev: perfOf(c.metrics.slice(-60, -30)) });
export function groupPerf(cs: Campaign[]) {
  return { curr: perfOf(cs.flatMap((c) => c.metrics.slice(-30))), prev: perfOf(cs.flatMap((c) => c.metrics.slice(-60, -30))) };
}
export const delta = (curr: number, prev: number) => (prev ? ((curr - prev) / prev) * 100 : 0);
const sgn = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`;
const x2 = (n: number) => `${n.toFixed(2)}x`;
const SRC_30 = "Campaign metrics · last 30 vs previous 30 days";
const SRC_WK = "Ad platforms · this week vs last week";

const d = (text: string, source: string): InsightItem => ({ text, kind: "data", source });
const as = (text: string): InsightItem => ({ text, kind: "assumption" });
const rc = (text: string): InsightItem => ({ text, kind: "recommendation" });

const kpiAttainment = (c: Campaign) =>
  c.kpis.map((k) => ({ k, pct: !k.target ? 100 : /cpa|cpc|cpl/i.test(k.label) ? (k.actual ? (k.target / k.actual) * 100 : 0) : (k.actual / k.target) * 100 }));

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function resolveClients(q: string, clients: Client[]): Client[] {
  const t = q.toLowerCase();
  const full = clients.filter((c) => t.includes(c.company.toLowerCase()));
  if (full.length) return full;
  return clients.filter((c) => {
    const w = c.company.split(/\s+/)[0]!.toLowerCase();
    return w.length >= 4 && new RegExp(`\\b${esc(w)}\\b`).test(t);
  });
}
function resolveLead(q: string, leads: Lead[]): Lead | undefined {
  const t = q.toLowerCase();
  return leads.find((l) => t.includes(l.company.toLowerCase())) ?? leads.find((l) => l.name.length > 5 && t.includes(l.name.toLowerCase()));
}

// ---------- Natural-language parsing (amounts, comparisons, metrics, trends) ----------
export function parseAmount(raw: string): number | null {
  const m = raw.toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b|thousand|mn\b|million|m\b|x\b|%)?/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  const u = m[2] ?? "";
  if (/^(lakh|lac|l$)/.test(u)) return n * 1e5;
  if (/^(crore|cr)/.test(u)) return n * 1e7;
  if (/^(k$|thousand)/.test(u)) return n * 1e3;
  if (/^(mn|million|m$)/.test(u)) return n * 1e6;
  return n;
}

export type NLMetric = "spend" | "roas" | "cpa" | "leads" | "retainer" | "revenue" | "conversions" | "budget";
export interface NLQuery {
  entity: "clients" | "campaigns";
  comparisons: { metric: NLMetric; op: ">" | "<"; value: number }[];
  trends: { metric: NLMetric; dir: "up" | "down" }[];
  industries: string[];
  services: Service[];
  health?: Client["health"];
}
const METRIC_WORDS: [RegExp, NLMetric][] = [
  [/spend(?:ing|s)?|spent/, "spend"], [/roas|return on ad spend/, "roas"], [/cpa|cost per (?:acquisition|conversion)/, "cpa"],
  [/leads?/, "leads"], [/retainers?|fees?/, "retainer"], [/revenue|sales/, "revenue"], [/conversions?/, "conversions"], [/budgets?/, "budget"],
];
const INDUSTRY_WORDS: [RegExp, string][] = [
  [/e-?commerce|d2c|ecom/, "D2C / E-commerce"], [/real estate|realty|property/, "Real Estate"], [/education|edtech|academy/, "Education"],
  [/hospitality|hotel|travel|stays/, "Hospitality"], [/health ?care|clinic|hospital/, "Healthcare"], [/food|restaurant|f&b|kitchen/, "Food & Beverage"],
  [/fintech|finance compan|financial services/, "Fintech"], [/fitness|gym/, "Fitness"], [/saas|software/, "SaaS"], [/fashion/, "Fashion"], [/beauty/, "Beauty"],
];
const metricRe = "(spend(?:ing|s)?|spent|roas|cpa|leads?|retainers?|revenue|conversions?|budgets?)";
const opRe = "(over|above|more than|greater than|at least|>=?|under|below|less than|at most|<=?)";
const amtRe = "((?:₹|rs\\.?|inr)?\\s*[\\d.,]+\\s*(?:lakhs?|lacs?|l\\b|crores?|cr\\b|k\\b|thousand|mn\\b|million|x\\b|%)?)";
const metricOf = (w: string): NLMetric => METRIC_WORDS.find(([re]) => re.test(w))?.[1] ?? "spend";
const opOf = (w: string): ">" | "<" => (/under|below|less|at most|</.test(w) ? "<" : ">");

export function parseNL(q: string): NLQuery {
  const t = q.toLowerCase();
  const out: NLQuery = { entity: /campaign/.test(t) && !/clients?\b/.test(t) ? "campaigns" : "clients", comparisons: [], trends: [], industries: [], services: [] };
  // "<metric> ... over <amount>"
  for (const m of t.matchAll(new RegExp(`${metricRe}[^.;]{0,24}?${opRe}\\s*${amtRe}`, "g"))) {
    const v = parseAmount(m[3]!);
    if (v !== null) out.comparisons.push({ metric: metricOf(m[1]!), op: opOf(m[2]!), value: v });
  }
  // "over <amount> in <metric>" / "more than 100 leads"
  if (!out.comparisons.length)
    for (const m of t.matchAll(new RegExp(`${opRe}\\s*${amtRe}\\s*(?:\\/\\s*month|a month|per month|monthly)?\\s*(?:in|of|on)?\\s*${metricRe}`, "g"))) {
      const v = parseAmount(m[2]!);
      if (v !== null) out.comparisons.push({ metric: metricOf(m[3]!), op: opOf(m[1]!), value: v });
    }
  for (const m of t.matchAll(new RegExp(`${metricRe}\\s+(?:has\\s+|have\\s+|is\\s+|are\\s+)?(dropp?ed|drop|fell|falling|declin\\w*|decreas\\w*|down|went down|ros[ea]|rising|increas\\w*|up|went up|improv\\w*|grew|growing|spik\\w*)`, "g")))
    out.trends.push({ metric: metricOf(m[1]!), dir: /drop|fell|fall|declin|decreas|down/.test(m[2]!) ? "down" : "up" });
  for (const m of t.matchAll(new RegExp(`(drop|decline|decrease|fall|increase|rise|growth|spike)\\s+in\\s+${metricRe}`, "g")))
    out.trends.push({ metric: metricOf(m[2]!), dir: /drop|decline|decrease|fall/.test(m[1]!) ? "down" : "up" });
  INDUSTRY_WORDS.forEach(([re, ind]) => re.test(t) && out.industries.push(ind));
  SERVICES.forEach((s) => t.includes(s.toLowerCase()) && out.services.push(s));
  if (/churn risk/.test(t)) out.health = "Churn Risk";
  else if (/healthy/.test(t)) out.health = "Healthy";
  return out;
}
export const hasNLFilters = (n: NLQuery) => n.comparisons.length + n.trends.length > 0;

const describeNL = (n: NLQuery) =>
  [
    ...n.industries.map((i) => `industry = ${i}`),
    ...n.services.map((s) => `uses ${s}`),
    ...(n.health ? [`health = ${n.health}`] : []),
    ...n.comparisons.map((c) => `${c.metric} ${c.op} ${["roas"].includes(c.metric) ? x2(c.value) : ["leads", "conversions"].includes(c.metric) ? c.value : compactMoney(c.value)}`),
    ...n.trends.map((tr) => `${tr.metric} ${tr.dir === "down" ? "fell" : "rose"} vs previous 30 days`),
  ].join(" · ");

function metricValue(metric: NLMetric, p: { curr: Perf; prev: Perf }, extra: { retainer?: number; budget?: number }, which: "curr" | "prev" = "curr") {
  const x = p[which];
  switch (metric) {
    case "spend": return x.spend;
    case "roas": return x.roas;
    case "cpa": return x.cpa;
    case "leads": return x.leads;
    case "revenue": return x.revenue;
    case "conversions": return x.conversions;
    case "retainer": return extra.retainer ?? 0;
    case "budget": return extra.budget ?? 0;
  }
}

export interface NLMatch {
  id: string;
  label: string;
  sub: string;
  href: string;
}
// Shared by the Ctrl/⌘K palette (live preview) and the Command Center answer.
export function runNLFilter(s: Scoped, n: NLQuery): { matches: NLMatch[]; considered: number; description: string } {
  const test = (p: { curr: Perf; prev: Perf }, extra: { retainer?: number; budget?: number }) =>
    n.comparisons.every((c) => {
      const v = metricValue(c.metric, p, extra);
      return c.op === ">" ? v > c.value : v < c.value;
    }) &&
    n.trends.every((tr) => {
      if (["retainer", "budget"].includes(tr.metric)) return false;
      const a = metricValue(tr.metric, p, extra, "curr");
      const b = metricValue(tr.metric, p, extra, "prev");
      return b > 0 && (tr.dir === "down" ? a < b : a > b);
    });
  const fmtSub = (p: { curr: Perf; prev: Perf }) =>
    `Spend ${compactMoney(p.curr.spend)} (${sgn(delta(p.curr.spend, p.prev.spend))}) · ROAS ${x2(p.curr.roas)} (${sgn(delta(p.curr.roas, p.prev.roas))}) · CPA ${compactMoney(p.curr.cpa)}`;
  if (n.entity === "campaigns") {
    const pool = s.campaigns.filter((c) => {
      const cl = s.clients.find((x) => x.id === c.clientId);
      return (!n.industries.length || (cl && n.industries.includes(cl.industry))) && (!n.services.length || n.services.includes(c.service));
    });
    const matches = pool
      .map((c) => ({ c, p: campPerf(c) }))
      .filter(({ c, p }) => test(p, { budget: c.budget }))
      .map(({ c, p }) => ({ id: c.id, label: c.name, sub: fmtSub(p), href: `/campaigns?c=${c.id}` }));
    return { matches, considered: pool.length, description: describeNL(n) };
  }
  const pool = s.clients.filter((c) => (!n.industries.length || n.industries.includes(c.industry)) && (!n.services.length || n.services.some((sv) => c.services.includes(sv))) && (!n.health || c.health === n.health));
  const matches = pool
    .map((c) => {
      const cs = s.campaigns.filter((x) => x.clientId === c.id);
      return { c, p: groupPerf(cs), budget: sum(cs.filter((x) => x.status === "Active").map((x) => x.budget)) };
    })
    .filter(({ c, p, budget }) => test(p, { retainer: c.retainer, budget: c.monthlyAdSpend ?? budget }))
    .map(({ c, p }) => ({ id: c.id, label: c.company, sub: fmtSub(p), href: `/clients/${c.id}` }));
  return { matches, considered: pool.length, description: describeNL(n) };
}

// ---------- Shared analyses ----------
interface ClientAnalysis {
  c: Client;
  camps: Campaign[];
  p: { curr: Perf; prev: Perf };
  kpiMisses: { camp: Campaign; label: string; pct: number }[];
  issues: string[];
}
function analyzeClient(s: Scoped, c: Client): ClientAnalysis {
  const camps = s.campaigns.filter((x) => x.clientId === c.id && x.status !== "Planning");
  const p = groupPerf(camps);
  const kpiMisses = camps.flatMap((camp) => kpiAttainment(camp).filter((k) => k.pct < 90).map((k) => ({ camp, label: k.k.label, pct: k.pct })));
  const issues: string[] = [];
  const rd = delta(p.curr.roas, p.prev.roas);
  const cd = delta(p.curr.cpa, p.prev.cpa);
  const ld = delta(p.curr.leads, p.prev.leads);
  if (p.prev.spend && rd <= -10) issues.push(`ROAS ${sgn(rd)} (${x2(p.prev.roas)} → ${x2(p.curr.roas)})`);
  if (p.prev.conversions && cd >= 10) issues.push(`CPA ${sgn(cd)} (${compactMoney(p.prev.cpa)} → ${compactMoney(p.curr.cpa)})`);
  if (p.prev.leads && ld <= -15) issues.push(`Leads ${sgn(ld)}`);
  if (p.curr.spend && p.curr.roas < 2) issues.push(`ROAS below 2x (${x2(p.curr.roas)})`);
  if (kpiMisses.length) issues.push(`${kpiMisses.length} KPI${kpiMisses.length > 1 ? "s" : ""} under 90% of target`);
  return { c, camps, p, kpiMisses, issues };
}

function campaignIssues(s: Scoped, c: Campaign) {
  const p = campPerf(c);
  const out: { text: string; weight: number }[] = [];
  const cd = delta(p.curr.cpa, p.prev.cpa);
  const rd = delta(p.curr.roas, p.prev.roas);
  if (p.prev.conversions && cd >= 15) out.push({ text: `CPA ${sgn(cd)} to ${compactMoney(p.curr.cpa)}`, weight: cd });
  if (p.prev.spend && rd <= -15) out.push({ text: `ROAS ${sgn(rd)} to ${x2(p.curr.roas)}`, weight: -rd });
  if (c.budget && p.curr.spend > c.budget * 1.15) out.push({ text: `Overpacing: ${compactMoney(p.curr.spend)} spent vs ${compactMoney(c.budget)} budget`, weight: 20 });
  if (c.status === "Active" && c.budget && p.curr.spend < c.budget * 0.6) out.push({ text: `Underpacing: ${compactMoney(p.curr.spend)} of ${compactMoney(c.budget)} budget`, weight: 12 });
  kpiAttainment(c).filter((k) => k.pct < 85).forEach((k) => out.push({ text: `${k.k.label} at ${k.pct.toFixed(0)}% of target`, weight: 100 - k.pct }));
  const fatigued = s.ads.filter((a) => a.campaignId === c.id && a.status === "Active" && a.frequency > 3.5);
  if (fatigued.length) out.push({ text: `${fatigued.length} ad${fatigued.length > 1 ? "s" : ""} with frequency > 3.5 (fatigue risk)`, weight: 15 });
  return { p, issues: out.sort((a, b) => b.weight - a.weight) };
}

function riskOf(s: Scoped, c: Client) {
  const reasons: { text: string; pts: number; kind: "data" | "assumption"; source: string }[] = [];
  if (c.health === "Churn Risk") reasons.push({ text: "Health marked Churn Risk", pts: 40, kind: "data", source: "Client record" });
  if (c.health === "At Risk") reasons.push({ text: "Health marked At Risk", pts: 25, kind: "data", source: "Client record" });
  if (s.access.payments) {
    const od = s.invoices.filter((i) => i.clientId === c.id && i.status === "Overdue");
    if (od.length) reasons.push({ text: `${od.length} overdue invoice(s), ${compactMoney(sum(od.map((i) => i.amount - i.paid)))} outstanding`, pts: 20, kind: "data", source: "Invoices" });
  }
  if (s.access.media) {
    const p = groupPerf(s.campaigns.filter((x) => x.clientId === c.id));
    const rd = delta(p.curr.roas, p.prev.roas);
    if (p.prev.spend && rd <= -10) reasons.push({ text: `ROAS ${sgn(rd)} month on month`, pts: 15, kind: "data", source: SRC_30 });
    const ld = delta(p.curr.leads, p.prev.leads);
    if (p.prev.leads && ld <= -15) reasons.push({ text: `Leads ${sgn(ld)} month on month`, pts: 10, kind: "data", source: SRC_30 });
  }
  if (!c.lastReportAt || Date.now() - new Date(c.lastReportAt).getTime() > 30 * DAY)
    reasons.push({ text: `No report in 30+ days (last ${c.lastReportAt ? fmtShort(c.lastReportAt) : "never"})`, pts: 10, kind: "data", source: "Client record" });
  const endsIn = (new Date(c.contractEnd).getTime() - Date.now()) / DAY;
  if (endsIn < 60) reasons.push({ text: `Contract ends in ${Math.max(0, Math.round(endsIn))} days`, pts: 10, kind: "data", source: "Contract" });
  const overdueTasks = s.tasks.filter((t) => t.related?.id === c.id && t.status !== "Done" && isPast(t.dueDate));
  if (overdueTasks.length) reasons.push({ text: `${overdueTasks.length} overdue task(s) on the account`, pts: 5, kind: "data", source: "Tasks" });
  const pendingOnb = c.onboarding.filter((o) => !o.done).length;
  if (pendingOnb > 3) reasons.push({ text: `${pendingOnb} onboarding steps still open`, pts: 5, kind: "data", source: "Onboarding" });
  return { score: Math.min(100, sum(reasons.map((r) => r.pts))), reasons };
}

// ---------- Answer helpers ----------
type Ctx = { q: string; t: string; s: Scoped; opts: CommandOpts };
const ans = (agent: AgentId, a: Omit<CommandAnswer, "agent">): CommandAnswer => ({ agent, ...a });
const deny = (agent: AgentId, what: string, s: Scoped): CommandAnswer =>
  ans(agent, {
    content: `Your role (**${s.me.role.replace("_", " ")}**) doesn't have access to ${what}, so I can't answer this from agency data. Ask an admin to update permissions in Team → Permissions.`,
    steps: ["Checked your permissions"],
    insights: [d(`${what} is not authorized for your role`, "Role permissions")],
    items: [],
  });

function pickClient(c: Ctx, agent: AgentId): Client | CommandAnswer {
  const named = resolveClients(c.q, c.s.clients);
  if (named.length === 1) return named[0]!;
  const pool = named.length > 1 ? named : c.s.clients;
  if (!named.length && c.opts.clientId) {
    const picked = c.s.clients.find((x) => x.id === c.opts.clientId);
    if (picked) return picked;
  }
  if (pool.length === 1) return pool[0]!;
  if (!pool.length) return deny(agent, "client records", c.s);
  return ans(agent, {
    content: named.length > 1 ? "That matches more than one client — which one do you mean?" : "Which client should I use? Pick one below or choose a client in the composer.",
    steps: ["Looked for a client name in your request", "Couldn't resolve a single client"],
    insights: [],
    items: [],
    clarify: { question: "Which client?", q: c.q, options: [...pool].sort((a, b) => b.retainer - a.retainer).slice(0, 10).map((x) => ({ id: x.id, label: x.company })) },
  });
}
const isAnswer = (x: unknown): x is CommandAnswer => !!x && typeof x === "object" && "steps" in x;

function perfLines(p: { curr: Perf; prev: Perf }, src = SRC_30): InsightItem[] {
  return [
    d(`Spend ${compactMoney(p.curr.spend)} vs ${compactMoney(p.prev.spend)} (${sgn(delta(p.curr.spend, p.prev.spend))})`, src),
    d(`Revenue ${compactMoney(p.curr.revenue)} vs ${compactMoney(p.prev.revenue)} (${sgn(delta(p.curr.revenue, p.prev.revenue))})`, src),
    d(`ROAS ${x2(p.curr.roas)} vs ${x2(p.prev.roas)} (${sgn(delta(p.curr.roas, p.prev.roas))})`, src),
    d(`CPA ${compactMoney(p.curr.cpa)} vs ${compactMoney(p.prev.cpa)} (${sgn(delta(p.curr.cpa, p.prev.cpa))})`, src),
    d(`Leads ${p.curr.leads} vs ${p.prev.leads} (${sgn(delta(p.curr.leads, p.prev.leads))})`, src),
  ];
}

const mkRec = (r: Omit<Recommendation, "id" | "status" | "createdAt">): Recommendation => ({ ...r, id: uid("rec"), status: "New", createdAt: new Date().toISOString() });

// ---------- Intents ----------
function followUps({ s }: Ctx): CommandAnswer {
  if (!s.access.leads) return deny("sales", "leads", s);
  const endToday = startOfDay().getTime() + DAY;
  const open = s.leads.filter((l) => !l.optedOut && !["Won", "Lost"].includes(l.status));
  const due = open.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < endToday);
  const stale = open.filter((l) => !l.nextFollowUpAt && ["Contacted", "Replied", "Meeting", "Proposal", "Negotiation"].includes(l.status) && l.lastContactedAt && Date.now() - new Date(l.lastContactedAt).getTime() > 5 * DAY);
  const all = [...due, ...stale].sort((a, b) => effectiveScore(b) - effectiveScore(a));
  const overdue = due.filter((l) => new Date(l.nextFollowUpAt!).getTime() < startOfDay().getTime());
  const top = all.slice(0, 5);
  return ans("sales", {
    content: all.length
      ? `**${all.length} leads need a follow-up** — ${due.length} scheduled for today or earlier (${overdue.length} overdue) and ${stale.length} in active stages with no contact for 5+ days. Sorted by AI score so the hottest go first.`
      : "No leads need a follow-up right now.",
    steps: ["Scanned open leads you can access", "Checked scheduled follow-up dates", "Found active-stage leads with no touch in 5+ days", "Ranked by AI lead score"],
    insights: [
      d(`${due.length} leads have a follow-up due today or overdue (${overdue.length} overdue)`, "CRM · leads.nextFollowUpAt"),
      d(`${stale.length} leads in Contacted → Negotiation have had no contact for 5+ days`, "CRM · leads.lastContactedAt"),
      ...(top[0] ? [as(`Highest-intent lead is likely ${top[0].company} (score ${effectiveScore(top[0])}) — score is a model estimate`)] : []),
      ...top.map((l) => rc(`Follow up with ${l.name} at ${l.company} (${l.status})`)),
    ],
    items: all.slice(0, 15).map((l) => ({ label: `${l.name} · ${l.company}`, sub: `${l.status} · score ${effectiveScore(l)} · ${l.nextFollowUpAt ? `due ${fmtShort(l.nextFollowUpAt)}` : `last contact ${fmtShort(l.lastContactedAt)}`}`, href: `/leads/${l.id}` })),
    todos: top.map((l) => ({ text: `Follow up with ${l.name} at ${l.company} (${l.status})`, leadId: l.id, priority: effectiveScore(l) >= 70 ? "High" : "Medium" })),
    actions: [{ label: "Open leads", href: "/leads" }],
  });
}

function underperforming({ s }: Ctx): CommandAnswer {
  if (!s.access.media) return deny("client_success", "campaign performance", s);
  const rows = s.clients.map((c) => analyzeClient(s, c)).filter((r) => r.issues.length && r.camps.length).sort((a, b) => b.issues.length - a.issues.length || a.p.curr.roas - b.p.curr.roas);
  const top = rows.slice(0, 6);
  return ans("client_success", {
    content: rows.length
      ? `**${rows.length} of ${s.clients.length} clients are underperforming** on at least one signal (KPI < 90% of target, ROAS down ≥10%, CPA up ≥10%, leads down ≥15%, or ROAS under 2x). Worst first:\n${top.map((r) => `• **${r.c.company}** — ${r.issues.slice(0, 3).join("; ")}`).join("\n")}`
      : "No client is currently underperforming on KPI targets or month-on-month trend.",
    steps: ["Pulled KPI targets vs actuals for every campaign", "Compared last 30 days with the previous 30", "Scored clients by number and severity of misses", "Drafted next steps"],
    insights: [
      ...top.flatMap((r) => [
        d(`${r.c.company}: ROAS ${x2(r.p.curr.roas)} (${sgn(delta(r.p.curr.roas, r.p.prev.roas))}), CPA ${compactMoney(r.p.curr.cpa)} (${sgn(delta(r.p.curr.cpa, r.p.prev.cpa))})${r.kpiMisses[0] ? `; ${r.kpiMisses[0].label} at ${r.kpiMisses[0].pct.toFixed(0)}% on ${r.kpiMisses[0].camp.service}` : ""}`, SRC_30),
      ]),
      as("Month-on-month declines can be seasonal; confirm against last year before changing strategy."),
      ...top.slice(0, 4).map((r) => rc(`Run a performance review for ${r.c.company}: ${r.issues[0]}`)),
    ],
    items: rows.map((r) => ({ label: r.c.company, sub: r.issues.join(" · "), href: `/clients/${r.c.id}` })),
    todos: top.slice(0, 4).map((r) => ({ text: `Run a performance review for ${r.c.company}: ${r.issues[0]}`, clientId: r.c.id, priority: r.issues.length >= 3 ? "High" : "Medium" })),
    actions: [{ label: "Open Performance", href: "/performance" }],
  });
}

function campaignsAttention({ s }: Ctx): CommandAnswer {
  if (!s.access.media) return deny("media", "campaign data", s);
  const rows = s.campaigns
    .filter((c) => c.status === "Active" || c.status === "Paused")
    .map((c) => ({ c, ...campaignIssues(s, c) }))
    .filter((r) => r.issues.length)
    .sort((a, b) => sum(b.issues.map((i) => i.weight)) - sum(a.issues.map((i) => i.weight)));
  const name = (id: string) => s.clients.find((c) => c.id === id)?.company ?? "—";
  const top = rows.slice(0, 5);
  return ans("media", {
    content: rows.length
      ? `**${rows.length} campaigns need attention.** Top priorities:\n${top.map((r) => `• **${r.c.name}** — ${r.issues.slice(0, 2).map((i) => i.text).join("; ")}`).join("\n")}`
      : "All active campaigns are within KPI targets, pacing and trend thresholds.",
    steps: ["Checked KPI attainment for active & paused campaigns", "Compared CPA / ROAS with the previous 30 days", "Checked budget pacing", "Checked ad frequency for fatigue", "Ranked by severity"],
    insights: [
      ...top.map((r) => d(`${r.c.name}: ${r.issues.map((i) => i.text).join("; ")}`, SRC_30)),
      as("Pacing uses 30-day spend vs the monthly budget; mid-flight budget edits can skew it."),
      ...top.slice(0, 4).map((r) => rc(`Review ${r.c.name} (${name(r.c.clientId)}): ${r.issues[0]!.text}`)),
    ],
    items: rows.slice(0, 15).map((r) => ({ label: r.c.name, sub: r.issues.map((i) => i.text).join(" · "), href: `/campaigns?c=${r.c.id}` })),
    todos: top.slice(0, 4).map((r) => ({ text: `Review ${r.c.name} (${name(r.c.clientId)}): ${r.issues[0]!.text}`, campaignId: r.c.id, clientId: r.c.clientId, priority: "High" })),
    actions: [{ label: "Open Campaigns", href: "/campaigns" }],
  });
}

function risingCpa({ s }: Ctx): CommandAnswer {
  if (!s.access.media) return deny("media", "campaign data", s);
  const camps = s.campaigns
    .filter((c) => c.status !== "Planning")
    .map((c) => ({ c, p: campPerf(c) }))
    .filter(({ p }) => p.prev.conversions > 0 && p.curr.conversions > 0 && delta(p.curr.cpa, p.prev.cpa) >= 10)
    .sort((a, b) => delta(b.p.curr.cpa, b.p.prev.cpa) - delta(a.p.curr.cpa, a.p.prev.cpa));
  const ads = s.ads
    .filter((a) => a.status === "Active")
    .map((a) => ({ a, cu: adPerf(a.curr), pr: adPerf(a.prev) }))
    .filter(({ cu, pr }) => pr.conversions > 0 && ((cu.conversions > 0 && delta(cu.cpa, pr.cpa) >= 20) || (cu.conversions === 0 && cu.spend > 0)))
    .sort((x, y) => (y.cu.conversions ? delta(y.cu.cpa, y.pr.cpa) : 999) - (x.cu.conversions ? delta(x.cu.cpa, x.pr.cpa) : 999));
  const recs = ads.slice(0, 5).map(({ a, cu, pr }) => {
    const dd = cu.conversions ? delta(cu.cpa, pr.cpa) : 100;
    const pause = dd >= 50 || !cu.conversions;
    return mkRec({
      agent: "media", clientId: a.clientId, campaignId: a.campaignId, adId: a.id,
      title: `${pause ? "Pause" : "Fix"} rising-CPA ad: ${a.name}`, category: pause ? "Loser" : "Anomaly",
      finding: cu.conversions ? `CPA rose ${sgn(dd)} week on week (${compactMoney(pr.cpa)} → ${compactMoney(cu.cpa)}).` : `Spent ${compactMoney(cu.spend)} this week with no conversions (last week ${pr.conversions}).`,
      why: a.frequency > 3.5 ? `Frequency ${a.frequency.toFixed(1)} suggests creative fatigue.` : `CTR ${cu.ctr.toFixed(2)}% vs ${pr.ctr.toFixed(2)}% — likely audience saturation or auction pressure.`,
      evidence: [
        { label: "CPA", value: `${compactMoney(pr.cpa)} → ${cu.conversions ? compactMoney(cu.cpa) : "no conv."}`, source: SRC_WK },
        { label: "Frequency", value: a.frequency.toFixed(1), source: a.platform },
        { label: "CTR", value: `${pr.ctr.toFixed(2)}% → ${cu.ctr.toFixed(2)}%`, source: SRC_WK },
      ],
      assumptions: ["Week-on-week changes can be noisy at low conversion volumes."],
      recommendation: pause ? `Pause ${a.name} and move its budget to the best ad in the campaign.` : `Refresh the creative / hook for ${a.name} and narrow the audience.`,
      priority: pause ? "High" : "Medium",
      action: pause ? { type: "pause_ad", label: `Pause ${a.name}` } : { type: "refresh_creative", label: `Refresh creative: ${a.name}` },
    });
  });
  return ans("media", {
    content:
      camps.length || ads.length
        ? `**${camps.length} campaigns** have CPA up ≥10% month on month and **${ads.length} active ads** have CPA up ≥20% week on week (or stopped converting).\n${camps.slice(0, 5).map(({ c, p }) => `• **${c.name}** — CPA ${compactMoney(p.prev.cpa)} → ${compactMoney(p.curr.cpa)} (${sgn(delta(p.curr.cpa, p.prev.cpa))})`).join("\n")}${recs.length ? `\n\nI created ${recs.length} recommendation(s) below — approve to execute under your approval settings.` : ""}`
        : "No campaigns or ads show a rising CPA beyond the thresholds (campaign +10% MoM, ad +20% WoW).",
    steps: ["Compared campaign CPA: last 30 vs previous 30 days", "Compared ad CPA: this week vs last week", "Checked frequency & CTR for likely causes", `Created ${recs.length} recommendation(s) for human approval`],
    insights: [
      ...camps.slice(0, 6).map(({ c, p }) => d(`${c.name}: CPA ${compactMoney(p.prev.cpa)} → ${compactMoney(p.curr.cpa)} (${sgn(delta(p.curr.cpa, p.prev.cpa))}), conversions ${p.prev.conversions} → ${p.curr.conversions}`, SRC_30)),
      ...ads.slice(0, 5).map(({ a, cu, pr }) => d(`${a.name} (${a.platform}): CPA ${compactMoney(pr.cpa)} → ${cu.conversions ? compactMoney(cu.cpa) : "no conversions"}, frequency ${a.frequency.toFixed(1)}`, SRC_WK)),
      as("Rising CPA with high frequency usually means creative fatigue; with stable frequency it more often means auction competition."),
    ],
    items: camps.slice(0, 12).map(({ c, p }) => ({ label: c.name, sub: `CPA ${compactMoney(p.curr.cpa)} · ${sgn(delta(p.curr.cpa, p.prev.cpa))} MoM`, href: `/campaigns?c=${c.id}` })),
    newRecommendations: recs,
    actions: [{ label: "Open Performance", href: "/performance" }],
  });
}

function mediaToday({ s }: Ctx): CommandAnswer {
  if (!s.access.media) return deny("media", "campaign data", s);
  const act = s.ads.filter((a) => a.status === "Active").map((a) => ({ a, cu: adPerf(a.curr), pr: adPerf(a.prev) }));
  const spends = act.map((x) => x.cu.spend).sort((a, b) => a - b);
  const median = spends[Math.floor(spends.length / 2)] ?? 0;
  const losers = act.filter((x) => x.cu.spend >= median && x.cu.roas < 1 && x.cu.revenue >= 0 && x.pr.spend > 0).sort((a, b) => a.cu.roas - b.cu.roas).slice(0, 3);
  const fatigue = act.filter((x) => x.a.frequency > 3.5 && x.pr.ctr > 0 && delta(x.cu.ctr, x.pr.ctr) <= -15 && !losers.includes(x)).slice(0, 3);
  const winners = act.filter((x) => x.cu.roas >= 3 && x.cu.roas > x.pr.roas && x.a.frequency < 3).sort((a, b) => b.cu.roas - a.cu.roas).slice(0, 3);
  const campOf = (id: string) => s.campaigns.find((c) => c.id === id);
  const recs: Recommendation[] = [
    ...losers.map(({ a, cu, pr }) =>
      mkRec({
        agent: "media", clientId: a.clientId, campaignId: a.campaignId, adId: a.id, title: `Pause loser: ${a.name}`, category: "Loser",
        finding: `ROAS ${x2(cu.roas)} on ${compactMoney(cu.spend)} spend this week (last week ${x2(pr.roas)}).`,
        why: "Spend is above the account median while revenue doesn't cover it.",
        evidence: [{ label: "ROAS", value: `${x2(pr.roas)} → ${x2(cu.roas)}`, source: SRC_WK }, { label: "Spend", value: compactMoney(cu.spend), source: a.platform }],
        recommendation: `Pause ${a.name} and shift budget to the campaign's best performer.`, priority: "High", impact: `Saves ≈${compactMoney(cu.spend)}/week (estimate)`,
        action: { type: "pause_ad", label: `Pause ${a.name}` },
      }),
    ),
    ...fatigue.map(({ a, cu, pr }) =>
      mkRec({
        agent: "media", clientId: a.clientId, campaignId: a.campaignId, adId: a.id, title: `Creative fatigue: ${a.name}`, category: "Fatigue",
        finding: `Frequency ${a.frequency.toFixed(1)} and CTR ${pr.ctr.toFixed(2)}% → ${cu.ctr.toFixed(2)}%.`,
        why: "The same audience is seeing the ad repeatedly (assumption based on frequency + falling CTR).",
        evidence: [{ label: "Frequency", value: a.frequency.toFixed(1), source: a.platform }, { label: "CTR", value: `${sgn(delta(cu.ctr, pr.ctr))}`, source: SRC_WK }],
        recommendation: `Brief 2–3 new hooks for ${a.name}${a.hook ? ` (current hook: “${a.hook}”)` : ""} and rotate them in.`, priority: "Medium",
        action: { type: "refresh_creative", label: `Refresh creative: ${a.name}` },
      }),
    ),
    ...winners.map(({ a, cu, pr }) => {
      const camp = campOf(a.campaignId);
      const value = camp ? Math.round((camp.budget * 1.2) / 1000) * 1000 : undefined;
      return mkRec({
        agent: "media", clientId: a.clientId, campaignId: a.campaignId, adId: a.id, title: `Scale winner: ${a.name}`, category: "Scaling",
        finding: `ROAS ${x2(pr.roas)} → ${x2(cu.roas)} with frequency ${a.frequency.toFixed(1)} (room to scale).`,
        why: "Efficiency is improving while frequency is low, so extra budget should reach new users.",
        evidence: [{ label: "ROAS", value: `${x2(pr.roas)} → ${x2(cu.roas)}`, source: SRC_WK }, ...(camp ? [{ label: "Campaign budget", value: compactMoney(camp.budget), source: "Campaign" }] : [])],
        assumptions: ["Returns usually diminish as budget scales; +20% is a conservative step."],
        recommendation: camp ? `Raise ${camp.name} budget 20% to ${compactMoney(value!)} and watch CPA for 3 days.` : `Increase budget on ${a.name} by 20%.`,
        priority: "Medium", impact: `≈${compactMoney(cu.revenue * 0.15)}/week extra revenue (estimate)`,
        action: value ? { type: "budget_change", value, label: `Budget → ${compactMoney(value)}` } : { type: "create_task", label: `Scale ${a.name}` },
      });
    }),
  ];
  const attention = s.campaigns.filter((c) => c.status === "Active").map((c) => ({ c, ...campaignIssues(s, c) })).filter((r) => r.issues.length).length;
  return ans("media", {
    content: `**Today's media plan** (${act.length} active ads analysed):\n• Pause ${losers.length} loser${losers.length === 1 ? "" : "s"} (ROAS < 1x on above-median spend)\n• Refresh ${fatigue.length} fatigued creative${fatigue.length === 1 ? "" : "s"} (frequency > 3.5, CTR falling)\n• Scale ${winners.length} winner${winners.length === 1 ? "" : "s"} (ROAS ≥ 3x and rising)\n• ${attention} campaign(s) also have KPI / pacing issues — ask “Which campaigns need attention?”\n\nEach action below is a recommendation; spend changes follow the **Campaign changes** approval mode.`,
    steps: ["Pulled this week vs last week for every active ad", "Flagged losers, fatigue and winners", "Mapped each finding to an action (pause / refresh / scale)", `Created ${recs.length} recommendation(s) awaiting human approval`],
    insights: [
      d(`${act.length} active ads · median weekly spend ${compactMoney(median)}`, SRC_WK),
      ...losers.map(({ a, cu }) => d(`Loser: ${a.name} — ROAS ${x2(cu.roas)} on ${compactMoney(cu.spend)}`, SRC_WK)),
      ...fatigue.map(({ a, cu, pr }) => d(`Fatigue: ${a.name} — frequency ${a.frequency.toFixed(1)}, CTR ${sgn(delta(cu.ctr, pr.ctr))}`, SRC_WK)),
      ...winners.map(({ a, cu }) => d(`Winner: ${a.name} — ROAS ${x2(cu.roas)}`, SRC_WK)),
      as("Revenue attribution comes from platform-reported conversions and may double count across platforms."),
    ],
    items: [...losers, ...fatigue, ...winners].map(({ a, cu }) => ({ label: a.name, sub: `${a.platform} · ROAS ${x2(cu.roas)} · freq ${a.frequency.toFixed(1)}`, href: `/campaigns?c=${a.campaignId}` })),
    newRecommendations: recs,
    actions: [{ label: "Open Performance", href: "/performance" }],
  });
}

function atRisk({ s }: Ctx): CommandAnswer {
  if (!s.clients.length) return deny("client_success", "client records", s);
  const rows = s.clients.map((c) => ({ c, ...riskOf(s, c) })).filter((r) => r.score >= 20).sort((a, b) => b.score - a.score);
  const hidden = [!s.access.payments && "billing", !s.access.media && "campaign performance"].filter(Boolean);
  return ans("client_success", {
    content: rows.length
      ? `**${rows.length} clients are at risk** (score = health + overdue invoices + falling performance + missing reports + contract timing):\n${rows.slice(0, 6).map((r) => `• **${r.c.company}** — risk ${r.score}/100: ${r.reasons.slice(0, 3).map((x) => x.text).join("; ")}`).join("\n")}${hidden.length ? `\n\n_${hidden.join(" and ")} data is hidden for your role, so scores exclude it._` : ""}`
      : "No client crosses the risk threshold right now.",
    steps: ["Read client health & contract dates", ...(s.access.payments ? ["Checked overdue invoices"] : []), ...(s.access.media ? ["Compared performance month on month"] : []), "Checked last report date & overdue tasks", "Scored and ranked risk"],
    insights: [
      ...rows.slice(0, 6).flatMap((r) => r.reasons.slice(0, 2).map((x) => ({ text: `${r.c.company}: ${x.text}`, kind: x.kind, source: x.source }) as InsightItem)),
      as("The risk score is a weighted heuristic, not a churn prediction model."),
      ...rows.slice(0, 4).map((r) => rc(`Book a health-check call with ${r.c.company} and agree a 30-day recovery plan`)),
    ],
    items: rows.map((r) => ({ label: `${r.c.company} — risk ${r.score}`, sub: r.reasons.map((x) => x.text).join(" · "), href: `/clients/${r.c.id}` })),
    todos: rows.slice(0, 4).map((r) => ({ text: `Book a health-check call with ${r.c.company} and agree a 30-day recovery plan`, clientId: r.c.id, priority: r.score >= 50 ? "Urgent" : "High" })),
    actions: [{ label: "Open Clients", href: "/clients" }],
  });
}

function avgServiceValue(s: Scoped) {
  const vals = s.clients.map((c) => c.retainer / Math.max(1, c.services.length));
  return vals.length ? sum(vals) / vals.length : 50000;
}
function upsell({ s }: Ctx): CommandAnswer {
  if (!s.clients.length) return deny("client_success", "client records", s);
  const per = avgServiceValue(s);
  const rows = s.clients
    .filter((c) => c.health !== "Churn Risk")
    .map((c) => {
      const pseudo = { industry: c.industry, services: c.services, website: c.website, company: c.company } as Lead;
      const fits = recommendServices(pseudo).filter((x) => !c.services.includes(x));
      const p = groupPerf(s.campaigns.filter((x) => x.clientId === c.id));
      const strong = s.access.media ? p.curr.roas >= 2.5 || (p.prev.roas > 0 && p.curr.roas > p.prev.roas) : c.health === "Healthy";
      const leadsKpi = s.campaigns.filter((x) => x.clientId === c.id).flatMap(kpiAttainment).filter((k) => k.k.label === "Leads");
      const headroom = leadsKpi.length > 0 && leadsKpi.every((k) => k.pct >= 100);
      return { c, fits, p, strong, headroom, score: fits.length * 10 + (strong ? 30 : 0) + (headroom ? 15 : 0) + (c.health === "Healthy" ? 10 : 0) };
    })
    .filter((r) => r.fits.length && r.strong)
    .sort((a, b) => b.score - a.score);
  return ans("client_success", {
    content: rows.length
      ? `**${rows.length} clients are good upsell candidates** — healthy, performing well${s.access.media ? " (ROAS ≥ 2.5x or improving)" : ""} and missing services that fit their industry:\n${rows.slice(0, 6).map((r) => `• **${r.c.company}** → ${r.fits.slice(0, 2).join(", ")}${s.access.media && r.p.curr.spend ? ` (ROAS ${x2(r.p.curr.roas)})` : ""}`).join("\n")}`
      : "No strong upsell candidates right now — performance or health needs to improve first.",
    steps: ["Listed services each client doesn't buy yet", "Matched services to industry fit", ...(s.access.media ? ["Checked ROAS strength & KPI headroom"] : []), "Excluded churn-risk accounts", "Ranked opportunities"],
    insights: [
      ...rows.slice(0, 5).map((r) => d(`${r.c.company}: buys ${r.c.services.join(", ")}; retainer ${compactMoney(r.c.retainer)}/mo${s.access.media && r.p.curr.spend ? `; ROAS ${x2(r.p.curr.roas)} (${sgn(delta(r.p.curr.roas, r.p.prev.roas))})` : ""}${r.headroom ? "; leads KPI met" : ""}`, "CRM · clients + campaign metrics")),
      as(`Industry fit is a heuristic; ≈${compactMoney(per)}/mo per added service is an estimate from the average retainer per service.`),
      ...rows.slice(0, 4).map((r) => rc(`Prepare an upsell pitch for ${r.c.company}: ${r.fits[0]}`)),
    ],
    items: rows.map((r) => ({ label: `${r.c.company} → ${r.fits.join(", ")}`, sub: `Est. +${compactMoney(per * Math.min(2, r.fits.length))}/mo (estimate)`, href: `/clients/${r.c.id}` })),
    todos: rows.slice(0, 4).map((r) => ({ text: `Prepare an upsell pitch for ${r.c.company}: ${r.fits[0]}`, clientId: r.c.id, priority: "Medium" })),
  });
}

function scopeClients(c: Ctx): { list: Client[]; label: string } {
  const named = resolveClients(c.q, c.s.clients);
  if (named.length) return { list: named, label: named.map((x) => x.company).join(", ") };
  const n = parseNL(c.q);
  if (n.industries.length || n.services.length) {
    const list = c.s.clients.filter((x) => (!n.industries.length || n.industries.includes(x.industry)) && (!n.services.length || n.services.some((sv) => x.services.includes(sv))));
    return { list, label: [...n.industries, ...n.services].join(" / ") + " clients" };
  }
  if (c.opts.clientId && /this client|client'?s\b/.test(c.t)) {
    const x = c.s.clients.find((y) => y.id === c.opts.clientId);
    if (x) return { list: [x], label: x.company };
  }
  return { list: c.s.clients, label: "all clients" };
}

function compare(c: Ctx, summaryMode = false): CommandAnswer {
  const { s } = c;
  if (!s.access.media) return deny("analytics", "campaign performance", s);
  const sc = scopeClients(c);
  const ids = new Set(sc.list.map((x) => x.id));
  const camps = s.campaigns.filter((x) => ids.has(x.clientId));
  const p = groupPerf(camps);
  const movers = sc.list
    .map((cl) => ({ cl, p: groupPerf(camps.filter((x) => x.clientId === cl.id)) }))
    .filter((r) => r.p.prev.spend > 0)
    .map((r) => ({ ...r, rd: delta(r.p.curr.roas, r.p.prev.roas) }))
    .sort((a, b) => a.rd - b.rd);
  const worst = movers.slice(0, 3).filter((m) => m.rd < 0);
  const best = [...movers].reverse().slice(0, 3).filter((m) => m.rd > 0);
  const anomalies = camps.map((x) => ({ x, ...campPerf(x) })).filter((r) => r.prev.conversions && (delta(r.curr.cpa, r.prev.cpa) >= 25 || delta(r.curr.roas, r.prev.roas) <= -25));
  const single = sc.list.length === 1 ? sc.list[0] : undefined;
  return ans(summaryMode ? "reporting" : "analytics", {
    clientId: single?.id,
    content: `**${summaryMode ? "Performance summary" : "This month vs last month"} — ${sc.label}** (last 30 days vs previous 30):\n• Spend ${compactMoney(p.curr.spend)} (${sgn(delta(p.curr.spend, p.prev.spend))})\n• Revenue ${compactMoney(p.curr.revenue)} (${sgn(delta(p.curr.revenue, p.prev.revenue))})\n• ROAS ${x2(p.curr.roas)} (${sgn(delta(p.curr.roas, p.prev.roas))}) · CPA ${compactMoney(p.curr.cpa)} (${sgn(delta(p.curr.cpa, p.prev.cpa))})\n• Leads ${p.curr.leads} (${sgn(delta(p.curr.leads, p.prev.leads))}) · CTR ${p.curr.ctr.toFixed(2)}%${worst.length ? `\n\nBiggest ROAS declines: ${worst.map((m) => `${m.cl.company} ${sgn(m.rd)}`).join(", ")}.` : ""}${best.length ? ` Biggest gains: ${best.map((m) => `${m.cl.company} ${sgn(m.rd)}`).join(", ")}.` : ""}`,
    steps: [`Selected ${sc.list.length} client(s): ${sc.label}`, `Pulled daily metrics for ${camps.length} campaigns`, "Compared last 30 days with the previous 30", `Flagged ${anomalies.length} campaign anomalies (CPA +25% or ROAS −25%)`, "Summarised movers"],
    insights: [
      ...perfLines(p),
      ...anomalies.slice(0, 4).map((r) => d(`Anomaly: ${r.x.name} — CPA ${sgn(delta(r.curr.cpa, r.prev.cpa))}, ROAS ${sgn(delta(r.curr.roas, r.prev.roas))}`, SRC_30)),
      as("Rolling 30-day windows are used instead of calendar months so both periods have equal length."),
      ...worst.slice(0, 2).map((m) => rc(`Investigate the ROAS decline at ${m.cl.company} (${sgn(m.rd)})`)),
      ...best.slice(0, 1).map((m) => rc(`Consider scaling budget at ${m.cl.company} while ROAS is rising (${sgn(m.rd)})`)),
    ],
    items: movers.map((m) => ({ label: m.cl.company, sub: `ROAS ${x2(m.p.curr.roas)} (${sgn(m.rd)}) · spend ${compactMoney(m.p.curr.spend)} · leads ${m.p.curr.leads}`, href: `/clients/${m.cl.id}` })),
    todos: [
      ...worst.slice(0, 2).map((m) => ({ text: `Investigate the ROAS decline at ${m.cl.company} (${sgn(m.rd)})`, clientId: m.cl.id, priority: "High" as Priority })),
      ...best.slice(0, 1).map((m) => ({ text: `Consider scaling budget at ${m.cl.company} while ROAS is rising (${sgn(m.rd)})`, clientId: m.cl.id, priority: "Medium" as Priority })),
    ],
    actions: [
      { label: "Open Analytics", href: single ? `/analytics?client=${single.id}` : "/analytics" },
      ...(summaryMode && single ? [{ label: "Build client report", href: `/reports?client=${single.id}` }] : []),
    ],
  });
}

function analyzeMulti(c: Ctx): CommandAnswer {
  const { s } = c;
  if (!s.access.media) return deny("analytics", "campaign performance", s);
  const sc = scopeClients(c);
  if (!sc.list.length) return ans("analytics", { content: `I couldn't find any ${sc.label} you have access to.`, steps: ["Searched clients matching your request"], insights: [], items: [] });
  const rows = sc.list.map((cl) => analyzeClient(s, cl));
  const ads = s.ads.filter((a) => sc.list.some((x) => x.id === a.clientId));
  const fatigued = ads.filter((a) => a.status === "Active" && a.frequency > 3.5);
  const invoices = s.access.payments ? s.invoices.filter((i) => sc.list.some((x) => x.id === i.clientId) && i.status === "Overdue") : [];
  const total = groupPerf(rows.flatMap((r) => r.camps));
  const flagged = rows.filter((r) => r.issues.length);
  const healthy = rows.filter((r) => !r.issues.length && r.camps.length);
  const todos: CommandTodo[] = flagged.slice(0, 5).map((r) => ({ text: `${r.c.company}: address ${r.issues[0]} — review campaigns and propose fixes`, clientId: r.c.id, priority: r.issues.length >= 2 ? "High" : "Medium" }));
  healthy.filter((r) => r.p.curr.roas >= 3).slice(0, 2).forEach((r) => todos.push({ text: `${r.c.company}: ROAS ${x2(r.p.curr.roas)} — test a 15–20% budget increase`, clientId: r.c.id, priority: "Medium" }));
  if (fatigued.length) {
    const cl = sc.list.find((x) => x.id === fatigued[0]!.clientId);
    todos.push({ text: `Refresh creatives on ${fatigued.length} fatigued ad${fatigued.length > 1 ? "s" : ""}${sc.list.length === 1 && cl ? ` for ${cl.company}` : ""} (frequency > 3.5)`, clientId: sc.list.length === 1 ? cl?.id : undefined, priority: "Medium" });
  }
  return ans("analytics", {
    clientId: sc.list.length === 1 ? sc.list[0]!.id : undefined,
    content: `**Performance of ${sc.label} — this month** (${rows.length} client${rows.length > 1 ? "s" : ""}, last 30 vs previous 30 days)\n• Combined spend ${compactMoney(total.curr.spend)} (${sgn(delta(total.curr.spend, total.prev.spend))}), revenue ${compactMoney(total.curr.revenue)}, ROAS ${x2(total.curr.roas)} (${sgn(delta(total.curr.roas, total.prev.roas))})\n• ${flagged.length} client(s) with anomalies, ${healthy.length} on track\n${flagged.slice(0, 5).map((r) => `• **${r.c.company}** — ${r.issues.join("; ")}`).join("\n")}${fatigued.length ? `\n• ${fatigued.length} active ads show fatigue risk (frequency > 3.5)` : ""}\n\nTurn any recommendation below into a task — tasks follow the **Task creation** approval mode.`,
    steps: [
      `Found ${rows.length} relevant client(s): ${sc.label}`,
      `Pulled authorized data: ${rows.reduce((a, r) => a + r.camps.length, 0)} campaigns, ${ads.length} ads${s.access.payments ? `, ${invoices.length} overdue invoices` : ""}`,
      "Analyzed spend, revenue, ROAS, CPA and leads vs the previous 30 days",
      `Identified ${flagged.reduce((a, r) => a + r.issues.length, 0) + fatigued.length} anomalies`,
      "Summarized findings per client",
      `Created ${todos.length} recommendations`,
      "Ready to turn recommendations into tasks",
    ],
    insights: [
      ...perfLines(total),
      ...rows.filter((r) => r.camps.length).slice(0, 8).map((r) => d(`${r.c.company}: spend ${compactMoney(r.p.curr.spend)}, ROAS ${x2(r.p.curr.roas)} (${sgn(delta(r.p.curr.roas, r.p.prev.roas))}), CPA ${compactMoney(r.p.curr.cpa)} (${sgn(delta(r.p.curr.cpa, r.p.prev.cpa))}), leads ${r.p.curr.leads}`, SRC_30)),
      ...invoices.slice(0, 3).map((i) => d(`${s.clients.find((x) => x.id === i.clientId)?.company}: invoice ${i.number} overdue (${compactMoney(i.amount - i.paid)})`, "Invoices")),
      as("Revenue is platform-reported; without a connected store / CRM feed it may differ from actual sales."),
      ...todos.map((t) => rc(t.text)),
    ],
    items: rows.map((r) => ({ label: r.c.company, sub: r.issues.length ? r.issues.join(" · ") : `On track · ROAS ${x2(r.p.curr.roas)}`, href: `/clients/${r.c.id}` })),
    todos,
    actions: [{ label: "Open Analytics", href: sc.list.length === 1 ? `/analytics?client=${sc.list[0]!.id}` : "/analytics" }],
  });
}

function analyzeAds(c: Ctx): CommandAnswer {
  const { s } = c;
  if (!s.access.media) return deny("media", "ad platform data", s);
  const cl = pickClient(c, "media");
  if (isAnswer(cl)) return cl;
  const t = c.t;
  const want: ("Meta" | "Google")[] = [];
  if (/meta|facebook|instagram/.test(t)) want.push("Meta");
  if (/google/.test(t)) want.push("Google");
  const platforms = want.length ? want : (["Meta", "Google"] as const).slice();
  const svc = { Meta: "Meta Ads", Google: "Google Ads" } as const;
  const blocks = platforms.map((pl) => {
    const camps = s.campaigns.filter((x) => x.clientId === cl.id && x.service === svc[pl]);
    const ads = s.ads.filter((a) => a.clientId === cl.id && a.platform === pl);
    const p = groupPerf(camps);
    const ap = ads.map((a) => ({ a, cu: adPerf(a.curr), pr: adPerf(a.prev) }));
    const wk = { curr: adPerf(ap.reduce((acc, x) => addStats(acc, x.a.curr), emptyStats())), prev: adPerf(ap.reduce((acc, x) => addStats(acc, x.a.prev), emptyStats())) };
    const best = [...ap].filter((x) => x.cu.spend > 0).sort((a, b) => b.cu.roas - a.cu.roas)[0];
    const worst = [...ap].filter((x) => x.cu.spend > 0).sort((a, b) => a.cu.roas - b.cu.roas)[0];
    const fat = ap.filter((x) => x.a.frequency > 3.5);
    return { pl, camps, ads: ap, p, wk, best, worst, fat };
  });
  const has = blocks.filter((b) => b.camps.length || b.ads.length);
  const insights: InsightItem[] = [];
  const todos: CommandTodo[] = [];
  has.forEach((b) => {
    if (b.camps.length) insights.push(d(`${b.pl}: spend ${compactMoney(b.p.curr.spend)} (${sgn(delta(b.p.curr.spend, b.p.prev.spend))}), ROAS ${x2(b.p.curr.roas)} (${sgn(delta(b.p.curr.roas, b.p.prev.roas))}), CPA ${compactMoney(b.p.curr.cpa)} (${sgn(delta(b.p.curr.cpa, b.p.prev.cpa))}), CTR ${b.p.curr.ctr.toFixed(2)}%`, `${b.pl} · ${SRC_30}`));
    if (b.ads.length) insights.push(d(`${b.pl} ads this week: ${compactMoney(b.wk.curr.spend)} spend, ROAS ${x2(b.wk.curr.roas)} vs ${x2(b.wk.prev.roas)} last week`, SRC_WK));
    if (b.best) insights.push(d(`Best ${b.pl} ad: ${b.best.a.name} — ROAS ${x2(b.best.cu.roas)}${b.best.a.hook ? `, hook “${b.best.a.hook}”` : ""}`, SRC_WK));
    if (b.worst && b.worst !== b.best) insights.push(d(`Weakest ${b.pl} ad: ${b.worst.a.name} — ROAS ${x2(b.worst.cu.roas)}, frequency ${b.worst.a.frequency.toFixed(1)}`, SRC_WK));
    if (b.fat.length) insights.push(d(`${b.fat.length} ${b.pl} ad(s) above frequency 3.5`, b.pl));
    if (b.worst && b.worst.cu.roas < 1.5) todos.push({ text: `${cl.company} ${b.pl}: pause or rework ${b.worst.a.name} (ROAS ${x2(b.worst.cu.roas)})`, clientId: cl.id, campaignId: b.worst.a.campaignId, priority: "High" });
    if (b.best && b.best.cu.roas >= 3) todos.push({ text: `${cl.company} ${b.pl}: shift budget toward ${b.best.a.name} and build 3 variations of its hook`, clientId: cl.id, campaignId: b.best.a.campaignId, priority: "Medium" });
    if (b.fat.length) todos.push({ text: `${cl.company} ${b.pl}: refresh creatives on ${b.fat.length} fatigued ad(s)`, clientId: cl.id, priority: "Medium" });
  });
  if (has.length === 2) {
    const [m, g] = has;
    insights.push(as(`${m!.p.curr.roas >= g!.p.curr.roas ? "Meta" : "Google"} is currently the more efficient channel on platform-reported ROAS; cross-platform attribution overlap is likely.`));
  }
  insights.push(...todos.map((x) => rc(x.text)));
  return ans("media", {
    clientId: cl.id,
    content: has.length
      ? `**${cl.company} — ${has.map((b) => b.pl).join(" & ")} Ads analysis**\n${has.map((b) => `• **${b.pl}**: ${b.camps.length} campaign(s), ${b.ads.length} ad(s) · ROAS ${x2(b.p.curr.roas)} (${sgn(delta(b.p.curr.roas, b.p.prev.roas))} MoM) · CPA ${compactMoney(b.p.curr.cpa)}${b.fat.length ? ` · ${b.fat.length} fatigued` : ""}`).join("\n")}${platforms.length > has.length ? `\n• No ${platforms.filter((p) => !has.some((b) => b.pl === p)).join(" / ")} campaigns on record for ${cl.company} — a possible upsell.` : ""}`
      : `${cl.company} has no ${platforms.join(" or ")} campaigns on record. It uses ${cl.services.join(", ")}.`,
    steps: [`Resolved client: ${cl.company}`, `Pulled ${platforms.join(" + ")} campaigns (30-day windows) and ad rows (weekly)`, "Compared periods and ranked ads by ROAS", "Checked frequency for fatigue", `Drafted ${todos.length} recommendations`],
    insights,
    items: has.flatMap((b) => b.camps.map((x) => ({ label: x.name, sub: `${b.pl} · ROAS ${x2(campPerf(x).curr.roas)} · budget ${compactMoney(x.budget)}`, href: `/campaigns?c=${x.id}` }))),
    todos,
    actions: [{ label: "Open Analytics", href: `/analytics?client=${cl.id}` }, { label: "Open Performance", href: "/performance" }],
  });
}
const emptyStats = (): AdStats => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, leads: 0 });
const addStats = (a: AdStats, b: AdStats): AdStats => ({ spend: a.spend + b.spend, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, conversions: a.conversions + b.conversions, revenue: a.revenue + b.revenue, leads: a.leads + b.leads });

const DEFAULT_WEIGHTS: Partial<Record<Service, number>> = { "Meta Ads": 40, "Google Ads": 35, "Influencer Marketing": 12, "LinkedIn Ads": 25, Programmatic: 15, "Retail Media": 20, "Quick Commerce": 15, "Social Media": 6, SEO: 6 };
function strategy(c: Ctx): CommandAnswer {
  const { s } = c;
  const cl = pickClient(c, "strategy");
  if (isAnswer(cl)) return cl;
  const amt = c.q.match(/(₹|rs\.?|inr)?\s*[\d.,]+\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b)/i);
  const parsed = amt ? parseAmount(amt[0]) : null;
  const camps = s.campaigns.filter((x) => x.clientId === cl.id);
  const budget = parsed ?? cl.monthlyAdSpend ?? (sum(camps.map((x) => x.budget)) || 500000);
  const pseudo = { industry: cl.industry, services: cl.services, website: cl.website, company: cl.company } as Lead;
  const channels = [...new Set([...cl.services, ...recommendServices(pseudo)])].filter((x) => DEFAULT_WEIGHTS[x] !== undefined).slice(0, 5);
  const roasBy = new Map(channels.map((ch) => [ch, groupPerf(camps.filter((x) => x.service === ch)).curr.roas]));
  const raw = channels.map((ch) => ({ ch, w: (DEFAULT_WEIGHTS[ch] ?? 10) * (roasBy.get(ch) ? Math.max(0.6, Math.min(1.6, roasBy.get(ch)! / 3)) : 1), hist: !!roasBy.get(ch) }));
  const tot = sum(raw.map((r) => r.w)) || 1;
  const alloc = raw.map((r) => ({ ...r, pct: Math.round((r.w / tot) * 90) }));
  const kb = s.knowledge.find((k) => k.clientId === cl.id);
  const audience = kb?.audience || camps.find((x) => x.audience)?.audience || `${cl.industry} buyers in ${cl.location}`;
  const cur = groupPerf(camps).curr;
  const targetCpa = cur.cpa ? Math.round(cur.cpa * 0.9) : 0;
  const targetRoas = Math.max(3, +(cur.roas * 1.1).toFixed(1));
  const topAd = s.ads.filter((a) => a.clientId === cl.id).map((a) => ({ a, r: adPerf(a.curr).roas })).sort((x, y) => y.r - x.r)[0];
  const href = `/strategy?new=1&client=${cl.id}&budget=${Math.round(budget)}`;
  return ans("strategy", {
    clientId: cl.id,
    content: `**Launch strategy outline — ${cl.company}** · ${compactMoney(budget)}/month\n\n**Funnel**\n• Awareness: short-form video + creators → reach & hook rate\n• Consideration: retargeting + search → CTR, landing-page views\n• Conversion: ${cl.industry === "D2C / E-commerce" ? "catalogue / Advantage+ shopping" : "lead forms + high-intent search"} → CPA${targetCpa ? ` ≤ ${compactMoney(targetCpa)}` : ""}\n• Retention: WhatsApp / email nurture → repeat rate\n\n**Channels & budget allocation**\n${alloc.map((a) => `• ${a.ch}: ${a.pct}% · ${compactMoney((budget * a.pct) / 100)}${a.hist ? ` (weighted by current ROAS ${x2(roasBy.get(a.ch)!)})` : ""}`).join("\n")}\n• Testing reserve: ${100 - sum(alloc.map((a) => a.pct))}% · ${compactMoney((budget * (100 - sum(alloc.map((a) => a.pct)))) / 100)}\n\n**Audience**: ${audience}\n**Creative plan**: ${kb?.toneWords.length ? `${kb.toneWords.slice(0, 3).join(", ")} tone; ` : ""}3 angles × 2 formats per week${topAd ? `; build on the best current hook “${topAd.a.hook ?? topAd.a.name}”` : ""}\n**Campaign structure**: per channel — prospecting (broad + lookalikes), retargeting (7/30-day), ${channels.includes("Google Ads") ? "brand + non-brand search, " : ""}always-on testing ad set\n**KPI framework**: ROAS ≥ ${targetRoas}x${targetCpa ? ` · CPA ≤ ${compactMoney(targetCpa)}` : ""} · CTR ≥ 1.2% · weekly lead / purchase volume\n**Testing plan**: W1 hooks · W2 audiences · W3 offers · W4 landing page\n\n_Human reviews before execution — generate and edit the full document in the Strategy module._`,
    steps: [`Resolved client: ${cl.company}`, parsed ? `Parsed budget: ${compactMoney(budget)}/month` : `Used current monthly ad spend: ${compactMoney(budget)}`, "Read client knowledge base & current campaign performance", "Allocated budget by channel fit and historical ROAS", "Drafted funnel, audience, creative, structure, KPIs and tests"],
    insights: [
      ...(cur.spend ? [d(`Current blended ROAS ${x2(cur.roas)}, CPA ${compactMoney(cur.cpa)} over the last 30 days`, SRC_30)] : [as("No historical campaign data — allocation uses default channel weights")]),
      ...(kb?.audience ? [d(`Audience: ${kb.audience}`, "Client knowledge base")] : [as(`Audience inferred from industry and campaign settings: ${audience}`)]),
      ...alloc.map((a) => (a.hist ? rc(`${a.ch}: ${a.pct}% (${compactMoney((budget * a.pct) / 100)}) — weighted by its current ROAS`) : as(`${a.ch}: ${a.pct}% (${compactMoney((budget * a.pct) / 100)}) — default weight for ${cl.industry}, no history`))),
      as("KPI targets are set 10% better than the current baseline — validate with the client's margins."),
      rc("Review this outline, then generate the full strategy document for approval"),
    ],
    items: [],
    todos: [{ text: `Review and finalise the launch strategy for ${cl.company} (${compactMoney(budget)}/mo)`, clientId: cl.id, priority: "High" }],
    actions: s.access.strategy ? [{ label: "Generate full strategy", href, primary: true }] : [],
  });
}

const ANGLES = ["Problem → solution", "Social proof", "Founder story", "Before / after", "Offer-led", "Myth-busting", "UGC unboxing", "Comparison", "Behind the scenes", "Objection handling", "Seasonal moment", "How-to / educational"];
const FORMATS = ["9:16 Reel", "1:1 Static", "Carousel", "UGC video", "4:5 Static", "15s Story"];
function concepts(c: Ctx): CommandAnswer {
  const { s } = c;
  const cl = pickClient(c, "creative");
  if (isAnswer(cl)) return cl;
  const count = Math.min(20, Math.max(1, parseInt(c.t.match(/(\d+)\s*(?:creative\s*)?(?:ad\s*)?(?:concepts?|ideas?|hooks?)/)?.[1] ?? "10", 10)));
  const kb = s.knowledge.find((k) => k.clientId === cl.id);
  const products = kb?.products.length ? kb.products : [{ name: cl.company, usp: `${cl.industry.toLowerCase()} made simple` }];
  const bestAds = s.ads.filter((a) => a.clientId === cl.id && a.hook).map((a) => ({ a, r: adPerf(a.curr).roas })).sort((x, y) => y.r - x.r).slice(0, 2);
  const rejected = new Set((kb?.rejectedConcepts ?? []).map((r) => r.toLowerCase()));
  const angles = ANGLES.filter((a) => !rejected.has(a.toLowerCase()));
  const list = Array.from({ length: count }, (_, i) => {
    const angle = angles[i % angles.length]!;
    const p = products[i % products.length]!;
    const fmt = FORMATS[i % FORMATS.length]!;
    const hook =
      angle === "Problem → solution" ? `Still struggling without ${p.name}?` : angle === "Social proof" ? `Why customers keep coming back to ${p.name}` : angle === "Founder story" ? `Why we built ${p.name}` : angle === "Before / after" ? `Before vs after ${p.name}` : angle === "Offer-led" ? `The ${p.name} offer ends Sunday` : angle === "Myth-busting" ? `The biggest myth about ${cl.industry.toLowerCase()}` : angle === "UGC unboxing" ? `Unboxing ${p.name} — honest first reaction` : angle === "Comparison" ? `${p.name} vs the usual option` : angle === "Behind the scenes" ? `How ${p.name} is actually made` : angle === "Objection handling" ? `“Is ${p.name} worth it?” — answered` : angle === "Seasonal moment" ? `This season's pick: ${p.name}` : `3 ways to get more from ${p.name}`;
    return { title: `${angle} · ${p.name}`, hook, fmt, usp: p.usp };
  });
  const href = `/creative?tab=concepts&client=${cl.id}&count=${count}`;
  return ans("creative", {
    clientId: cl.id,
    content: `**${count} creative concepts — ${cl.company}**\n${list.map((x, i) => `${i + 1}. **${x.title}** — Hook: “${x.hook}” · ${x.fmt}${x.usp ? ` · USP: ${x.usp}` : ""}`).join("\n")}\n\nOpen the Creative Studio to generate full scripts, storyboards and CTAs and save them as creatives for review.`,
    steps: [`Resolved client: ${cl.company}`, kb ? "Read brand voice, products and rejected concepts from the knowledge base" : "No knowledge base found — used client profile", bestAds.length ? "Pulled the best-performing hooks from ad data" : "No ad-level hook data available", `Generated ${count} concept outlines across ${Math.min(count, angles.length)} angles`],
    insights: [
      ...(kb?.products.length ? [d(`${kb.products.length} product(s) and brand voice “${kb.brandVoice.slice(0, 80)}”`, "Client knowledge base")] : [as("Products unknown — concepts reference the brand generally")]),
      ...bestAds.map((b) => d(`Top hook “${b.a.hook}” — ROAS ${x2(b.r)} this week`, SRC_WK)),
      ...(rejected.size ? [d(`Excluded ${rejected.size} previously rejected concept(s)`, "Client knowledge base")] : []),
      as("Concepts are untested ideas; expect 1–2 in 10 to beat the current control."),
      rc("Pick 3–4 concepts to produce this week and test them against the current best ad"),
    ],
    items: [],
    todos: [{ text: `Shortlist and brief 3–4 of the new creative concepts for ${cl.company}`, clientId: cl.id, priority: "Medium" }],
    actions: s.access.creative ? [{ label: "Open in Creative Studio", href, primary: true }] : [],
  });
}

const DEFAULT_PILLARS: Record<string, string[]> = {
  "D2C / E-commerce": ["Product education", "Customer stories", "Behind the brand", "Offers & drops"],
  "Real Estate": ["Project walkthroughs", "Buyer guides", "Location insights", "Testimonials"],
  Education: ["Exam tips", "Student success", "Faculty insights", "Admissions"],
  Hospitality: ["Stay experiences", "Local guides", "Guest stories", "Seasonal offers"],
};
function contentCalendar(c: Ctx): CommandAnswer {
  const { s } = c;
  const cl = pickClient(c, "social");
  if (isAnswer(cl)) return cl;
  const posts = s.socialPosts.filter((p) => p.clientId === cl.id);
  const pillarsData = [...new Set(posts.map((p) => p.pillar).filter(Boolean))];
  const pillars = pillarsData.length ? pillarsData.slice(0, 4) : DEFAULT_PILLARS[cl.industry] ?? ["Education", "Social proof", "Behind the scenes", "Offers"];
  const byFormat = new Map<string, number[]>();
  posts.forEach((p) => p.metrics && byFormat.set(p.format, [...(byFormat.get(p.format) ?? []), p.metrics.er]));
  const ranked = [...byFormat.entries()].map(([f, ers]) => ({ f, er: sum(ers) / ers.length })).sort((a, b) => b.er - a.er);
  const formats = ranked.length ? [ranked[0]!.f, ranked[1]?.f ?? "Carousel", ranked[0]!.f] : ["Reel", "Carousel", "Static"];
  const start = startOfDay();
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7)); // next Monday
  const days = ["Mon", "Wed", "Fri"];
  const weeks = [0, 1, 2, 3].map((w) => {
    const wk = new Date(start.getTime() + w * 7 * DAY);
    return `• **Week ${w + 1} (${fmtShort(wk.toISOString())})**: ${days.map((dname, i) => `${dname} ${formats[i]} — ${pillars[(w + i) % pillars.length]}`).join(" · ")}`;
  });
  return ans("social", {
    clientId: cl.id,
    content: `**Monthly content calendar — ${cl.company}** (12 posts, 3 per week)\n${weeks.join("\n")}\n\nPillars: ${pillars.join(", ")}. Open Social to generate captions, hooks and hashtags for each slot — publishing follows the **Social publishing** approval mode.`,
    steps: [`Resolved client: ${cl.company}`, pillarsData.length ? `Read ${pillarsData.length} content pillars from existing posts` : "No existing pillars — used industry defaults", ranked.length ? "Ranked formats by average engagement rate" : "No post metrics — used a balanced format mix", "Laid out 4 weeks × 3 slots"],
    insights: [
      ...(pillarsData.length ? [d(`Existing pillars: ${pillarsData.join(", ")}`, "Social posts")] : [as(`Pillars are industry defaults for ${cl.industry}`)]),
      ...ranked.slice(0, 2).map((r) => d(`${r.f} posts average ${r.er.toFixed(1)}% engagement`, "Social post metrics")),
      as("3 posts per week is a baseline cadence; adjust to the client's content capacity."),
      rc("Generate captions for week 1 and send them for client approval by Friday"),
    ],
    items: [],
    todos: [{ text: `Generate and review week-1 social posts for ${cl.company}`, clientId: cl.id, priority: "Medium" }],
    actions: s.access.social ? [{ label: "Generate in Social", href: `/social?generate=1&client=${cl.id}`, primary: true }] : [],
  });
}

function summarize(c: Ctx): CommandAnswer {
  const { s } = c;
  const named = resolveClients(c.q, s.clients);
  if (!named.length && !c.opts.clientId && s.access.leads) {
    const lead = resolveLead(c.q, s.leads);
    if (lead)
      return ans("sales", {
        content: `**${lead.name} · ${lead.company}** — ${lead.status}, score ${effectiveScore(lead)}.\n${lead.research?.summary ?? "Not researched yet — open the lead and run AI research."}`,
        steps: ["Resolved lead", "Read CRM record & research"],
        insights: [d(`${lead.industry}, ${lead.companySize} employees, ${lead.location}`, "CRM record"), ...(lead.research?.summary ? [as(lead.research.summary.slice(0, 200))] : [])],
        items: [{ label: `Open ${lead.company}`, href: `/leads/${lead.id}` }],
      });
  }
  const cl = pickClient(c, "client_success");
  if (isAnswer(cl)) return cl;
  const a = analyzeClient(s, cl);
  const risk = riskOf(s, cl);
  const open = s.invoices.filter((i) => i.clientId === cl.id && i.status !== "Paid");
  const tasks = s.tasks.filter((x) => x.related?.id === cl.id && x.status !== "Done");
  const recs = s.recommendations.filter((r) => r.clientId === cl.id && r.status === "New");
  return ans("client_success", {
    clientId: cl.id,
    content: `**${cl.company}** (${cl.industry}, ${cl.location}) — **${cl.health}**, risk ${risk.score}/100\n• Services: ${cl.services.join(", ")} · retainer ${compactMoney(cl.retainer)}/mo\n${s.access.media ? `• Last 30 days: ${compactMoney(a.p.curr.spend)} spend, ${a.p.curr.leads} leads, ROAS ${x2(a.p.curr.roas)} (${sgn(delta(a.p.curr.roas, a.p.prev.roas))} MoM)\n• ${a.camps.filter((x) => x.status === "Active").length} active campaigns${a.issues.length ? ` · issues: ${a.issues.join("; ")}` : " · no performance issues"}\n` : ""}• ${tasks.length} open tasks · ${recs.length} new AI recommendations\n${s.access.payments ? `• ${open.length ? `${open.length} unpaid invoice(s): ${compactMoney(sum(open.map((i) => i.amount - i.paid)))}` : "No outstanding payments"}\n` : ""}• Last report: ${cl.lastReportAt ? fmtShort(cl.lastReportAt) : "never"} · contract ends ${fmtShort(cl.contractEnd)}`,
    steps: [`Resolved client: ${cl.company}`, "Read client record, tasks and recommendations", ...(s.access.media ? ["Compared campaign performance month on month"] : []), ...(s.access.payments ? ["Checked invoices"] : []), "Computed risk score"],
    insights: [
      ...(s.access.media && a.camps.length ? perfLines(a.p).slice(2, 5) : []),
      ...risk.reasons.slice(0, 3).map((r) => ({ text: r.text, kind: r.kind, source: r.source }) as InsightItem),
      ...(a.issues[0] ? [rc(`Address: ${a.issues[0]}`)] : []),
      ...(risk.score >= 30 ? [rc(`Schedule a check-in with ${cl.contacts[0]?.name ?? cl.company}`)] : []),
    ],
    items: [{ label: `Open ${cl.company}`, href: `/clients/${cl.id}` }, ...a.camps.slice(0, 4).map((x) => ({ label: x.name, sub: x.status, href: `/campaigns?c=${x.id}` }))],
    todos: [...(a.issues[0] ? [{ text: `Address: ${a.issues[0]}`, clientId: cl.id, priority: "High" as Priority }] : []), ...(risk.score >= 30 ? [{ text: `Schedule a check-in with ${cl.contacts[0]?.name ?? cl.company}`, clientId: cl.id, priority: "Medium" as Priority }] : [])],
    actions: [{ label: "Open client", href: `/clients/${cl.id}` }],
  });
}

function clientReport(c: Ctx): CommandAnswer {
  const { s } = c;
  if (!s.access.reports && !s.access.media) return deny("reporting", "reports and performance data", s);
  const cl = pickClient(c, "reporting");
  if (isAnswer(cl)) return cl;
  const a = analyzeClient(s, cl);
  const best = [...a.camps].map((x) => ({ x, p: campPerf(x) })).sort((m, n) => n.p.curr.roas - m.p.curr.roas)[0];
  const mode = s.settings.approvalModes.Reports;
  return ans("reporting", {
    clientId: cl.id,
    content: `**Monthly report draft — ${cl.company}** (last 30 days vs previous 30)\n\n**Executive summary**\n• Spend ${compactMoney(a.p.curr.spend)} (${sgn(delta(a.p.curr.spend, a.p.prev.spend))}) generated ${compactMoney(a.p.curr.revenue)} revenue at ${x2(a.p.curr.roas)} ROAS (${sgn(delta(a.p.curr.roas, a.p.prev.roas))})\n• ${a.p.curr.leads} leads (${sgn(delta(a.p.curr.leads, a.p.prev.leads))}) at ${compactMoney(a.p.curr.cpl)} per lead\n${best ? `• Best campaign: ${best.x.name} — ROAS ${x2(best.p.curr.roas)}\n` : ""}\n**What changed**\n${a.issues.length ? a.issues.map((i) => `• ${i}`).join("\n") : "• Performance stable vs last month"}\n\n**Next month's plan**\n• ${a.issues[0] ? `Fix: ${a.issues[0]}` : "Scale the best campaign 15–20%"}\n• Test 3 new creative angles · refresh fatigued ads\n\nSending follows the **Reports** approval mode (currently _${mode}_).`,
    steps: [`Resolved client: ${cl.company}`, `Pulled ${a.camps.length} campaigns (30-day windows)`, "Wrote executive summary, what changed and next month's plan"],
    insights: [...perfLines(a.p), as("Revenue is platform-reported; reconcile with the client's own sales data before sending."), rc("Open Reports to generate the formatted report and send it for approval")],
    items: [],
    todos: [{ text: `Review and send the monthly report for ${cl.company}`, clientId: cl.id, priority: "Medium" }],
    actions: s.access.reports ? [{ label: "Build report in Reports", href: `/reports?client=${cl.id}`, primary: true }] : [],
  });
}

function proposal(c: Ctx): CommandAnswer {
  const { s } = c;
  if (!s.access.proposals) return deny("sales", "proposals", s);
  const lead = resolveLead(c.q, s.leads);
  const named = resolveClients(c.q, s.clients);
  const clientCtx = named[0] ?? (c.opts.clientId ? s.clients.find((x) => x.id === c.opts.clientId) : undefined);
  const deal = (lead && s.deals.find((x) => x.leadId === lead.id)) || (clientCtx && (s.deals.find((x) => (x.clientId === clientCtx.id || x.company === clientCtx.company) && !["Won", "Lost"].includes(x.stage)) ?? s.deals.find((x) => x.clientId === clientCtx.id || x.company === clientCtx.company))) || s.deals.find((x) => c.t.includes(x.company.toLowerCase()));
  if (!lead && !deal) {
    const open = s.deals.filter((x) => ["Meeting", "Proposal", "Negotiation", "Qualified"].includes(x.stage) && !x.proposalId).sort((a, b) => b.value * b.probability - a.value * a.probability);
    return ans("sales", {
      content: open.length ? `Which deal is this proposal for? These **${open.length} open deals** have no proposal yet (highest weighted value first):` : "Mention the lead or company the proposal is for, e.g. “Create a proposal for Nova Homes”.",
      steps: ["Looked for a lead, deal or client in your request", "Listed open deals without a proposal"],
      insights: open.slice(0, 3).map((x) => d(`${x.title}: ${compactMoney(x.value)} at ${x.probability}% (${x.stage})`, "Pipeline")),
      items: open.slice(0, 10).map((x) => ({ label: x.title, sub: `${x.stage} · ${compactMoney(x.value)} · create proposal →`, href: `/proposals?new=1&deal=${x.id}` })),
    });
  }
  const services: Service[] = deal?.services.length ? deal.services : lead ? (lead.services.length ? lead.services : lead.research?.recommendedServices ?? recommendServices(lead)) : [];
  const company = deal?.company ?? lead!.company;
  const value = deal?.value ?? lead?.dealValue ?? 0;
  const href = deal ? `/proposals?new=1&deal=${deal.id}` : `/proposals?new=1&lead=${lead!.id}`;
  return ans("sales", {
    content: `**Proposal outline — ${company}**\n• Services: ${services.join(", ") || "to confirm"}\n${value ? `• Expected value: ${compactMoney(value)}\n` : ""}• Structure: context & goals → recommended strategy → scope & deliverables per service → timeline (onboarding 2 wks, launch, optimise) → pricing → terms\n${lead?.research?.outreachAngle ? `• Angle: ${lead.research.outreachAngle}\n` : ""}\nGenerate the full proposal in the Proposals module — it follows the **Proposals** approval mode before sending.`,
    steps: [lead ? `Resolved lead: ${lead.name} · ${lead.company}` : `Resolved deal: ${deal!.title}`, "Read services, deal value and research", "Drafted proposal structure"],
    insights: [
      ...(deal ? [d(`${deal.title}: ${deal.stage}, ${compactMoney(deal.value)} at ${deal.probability}%`, "Pipeline")] : []),
      ...(lead?.research?.summary ? [d(lead.research.summary.slice(0, 180), "AI research on lead record")] : []),
      ...(services.length && !deal?.services.length ? [as(`Services inferred from industry fit (${lead?.industry})`)] : []),
      rc("Generate the proposal, review pricing internally, then send"),
    ],
    items: lead ? [{ label: `Open ${lead.company}`, href: `/leads/${lead.id}` }] : [],
    actions: [{ label: "Create proposal", href, primary: true }],
  });
}

function draftEmail(c: Ctx): CommandAnswer {
  const { s } = c;
  const named = resolveClients(c.q, s.clients);
  const lead = !named.length && s.access.leads ? resolveLead(c.q, s.leads) : undefined;
  if (lead && !(c.opts.clientId && /this client/.test(c.t))) {
    const dr = personalizeFirstMessage(lead, "Email");
    return ans("sales", {
      content: `**Draft email to ${lead.name} (${lead.company})** — angle: ${dr.service}\n\n${dr.body}\n\n_Sending follows the **Outreach** approval mode (${s.settings.approvalModes.Outreach})._`,
      steps: [`Resolved lead: ${lead.name}`, "Read research & outreach angle", "Personalised the draft"],
      insights: [d(`${lead.status} · ${lead.industry} · ${lead.location}`, "CRM record"), as(`Angle: ${dr.angle}`)],
      items: [{ label: `Open ${lead.company}`, href: `/leads/${lead.id}` }],
    });
  }
  const cl = pickClient(c, "client_success");
  if (isAnswer(cl)) return cl;
  const a = analyzeClient(s, cl);
  const contact = cl.contacts[0];
  const up = delta(a.p.curr.roas, a.p.prev.roas) >= 0;
  const me = s.me.name.split(" ")[0];
  const body = `Subject: ${cl.company} — monthly performance update\n\nHi ${contact?.name.split(" ")[0] ?? "there"},\n\nQuick update on the last 30 days:\n• ${compactMoney(a.p.curr.spend)} invested, ${compactMoney(a.p.curr.revenue)} in tracked revenue (ROAS ${x2(a.p.curr.roas)}, ${up ? "up" : "down"} ${Math.abs(delta(a.p.curr.roas, a.p.prev.roas)).toFixed(0)}% vs last month)\n• ${a.p.curr.leads} leads generated\n\n${a.issues[0] ? `One thing we're working on: ${a.issues[0]}. We'll share the fix plan on our next call.` : "Everything is pacing well — we're planning to test new creatives next week to push results further."}\n\nWould ${fmtShort(new Date(Date.now() + 3 * DAY).toISOString())} work for a 20-minute review?\n\nBest,\n${me}`;
  return ans("client_success", {
    clientId: cl.id,
    content: `**Draft email to ${contact?.name ?? cl.company}**\n\n${s.access.media ? body : body.replace(/Quick update[\s\S]*?\n\n(One thing|Everything)/, "$1")}\n\n_Client-facing sends follow the **Client communication** approval mode (${s.settings.approvalModes["Client communication"]}). Review before sending._`,
    steps: [`Resolved client: ${cl.company}`, ...(s.access.media ? ["Pulled last-30-day performance"] : []), "Drafted the email in the account manager's voice"],
    insights: [...(s.access.media ? perfLines(a.p).slice(2, 5) : []), as("Tone is a neutral professional default — adjust to the client's brand voice.")],
    items: [{ label: `Open ${cl.company}`, href: `/clients/${cl.id}` }],
  });
}

function nlSearch(c: Ctx, n: NLQuery): CommandAnswer {
  const { s } = c;
  if (!s.access.media && n.comparisons.some((x) => x.metric !== "retainer")) return deny("analytics", "campaign performance", s);
  const r = runNLFilter(s, n);
  return ans("analytics", {
    content: r.matches.length
      ? `**${r.matches.length} of ${r.considered} ${n.entity}** match: ${r.description}.\n${r.matches.slice(0, 8).map((m) => `• **${m.label}** — ${m.sub}`).join("\n")}`
      : `No ${n.entity} match: ${r.description} (checked ${r.considered}).`,
    steps: [`Parsed filters: ${r.description}`, `Scanned ${r.considered} ${n.entity} you're authorized to see`, "Computed spend / ROAS / CPA / leads for last 30 vs previous 30 days", `Found ${r.matches.length} match(es)`],
    insights: [
      d(`${r.matches.length} match(es) out of ${r.considered}`, SRC_30),
      as("“Per month” uses the last 30 days of campaign spend; client spend = sum over their campaigns."),
      ...(r.matches.length ? [rc(`Review the ${Math.min(3, r.matches.length)} largest matches first`)] : []),
    ],
    items: r.matches,
  });
}

function help(s: Scoped): CommandAnswer {
  const examples = COMMAND_EXAMPLES.filter((e) => {
    if (/lead|proposal/i.test(e)) return s.access.leads || s.access.proposals;
    if (/campaign|media|meta|cpa|performance|compare|underperform/i.test(e)) return s.access.media;
    return true;
  });
  return ans("sales", {
    content: `I answer from your authorized agency data. Try:\n${examples.map((e) => `• ${e}`).join("\n")}\n\nTip: pick a client in the composer to use “this client”.`,
    steps: [],
    insights: [],
    items: [],
  });
}

// ---------- Router ----------
export function answerCommand(q: string, state: CmdState, me: TeamMember, opts: CommandOpts = {}): CommandAnswer {
  const s = scopeState(state, me);
  const t = q.toLowerCase();
  const c: Ctx = { q, t, s, opts };
  const pin = opts.agent;
  const res = route(c);
  // A pinned agent answers in its own name (the analysis itself is the same authorized data).
  return pin ? { ...res, agent: pin } : res;
}

function route(c: Ctx): CommandAnswer {
  const { t, s } = c;
  const nl = parseNL(c.q);
  if (/(draft|write|compose).{0,30}(email|mail|message|note)/.test(t)) return draftEmail(c);
  if (/proposal/.test(t)) return proposal(c);
  if (/strateg|launch plan|go.to.market|media plan/.test(t)) return strategy(c);
  if (/concepts?\b|creative ideas|ad ideas|\bhooks\b/.test(t) && !/which hooks/.test(t)) return concepts(c);
  if (/content calendar|social calendar|posting calendar|calendar/.test(t) && /content|social|post|month|calendar/.test(t)) return contentCalendar(c);
  if (/(create|generate|build|prepare|draft|make).{0,20}report|client report|monthly report/.test(t)) return clientReport(c);
  if (/performance summary|executive summary/.test(t)) return compare(c, true);
  if (/compare|month.over.month|\bmom\b|(vs\.?|versus|with) last month|this month.{0,30}last month/.test(t) && !hasNLFilters(nl)) return compare(c);
  if (/\bcpa\b/.test(t) && /(ris|increas|up\b|spik|jump|grow|wors|higher)/.test(t) && !hasNLFilters(nl)) return risingCpa(c);
  if (/optimi[sz]e|media team|media buyer|what should .{0,20}(do|fix|change) today|what to (pause|scale)/.test(t)) return mediaToday(c);
  if (/campaign/.test(t) && /(attention|issue|problem|wrong|struggl|underperform|fix|review|worst)/.test(t) && !hasNLFilters(nl)) return campaignsAttention(c);
  if (/underperform|under.perform|struggling|lagging|missing (targets|kpis?)|behind target/.test(t)) return underperforming(c);
  if (/at.?risk|churn|might leave|could lose/.test(t)) return atRisk(c);
  if (/upsell|up.sell|cross.?sell|expand (the )?account|more services/.test(t)) return upsell(c);
  if (/follow.?up/.test(t)) return followUps(c);
  if (/(analy[sz]|audit|deep.?dive|review|how (is|are|did))/.test(t) && /(meta|facebook|google|\bads\b)/.test(t)) return analyzeAds(c);
  if (/(analy[sz]|audit|deep.?dive|how (is|are|did)|performance)/.test(t) && !hasNLFilters(nl)) return analyzeMulti(c);
  if (/summar|overview|tell me about|status of|brief me/.test(t)) return summarize(c);
  if (hasNLFilters(nl)) return nlSearch(c, nl);
  // Legacy CRM questions (payments, reports, replies, pipeline, meetings, tasks) — RBAC-guarded.
  if (/pending payment|unpaid|overdue invoice|owe|payment/.test(t) && !s.access.payments) return deny("finance", "billing data", s);
  if (/pipeline|forecast/.test(t) && !s.access.pipeline) return deny("sales", "the sales pipeline", s);
  const legacy = answerLocally(c.q, s);
  if (!/^I can answer questions/.test(legacy.text)) {
    return {
      agent: routeToAgent(c.q),
      content: legacy.text,
      steps: ["Matched a CRM question", "Queried authorized records"],
      insights: legacy.items?.length ? [d(`${legacy.items.length} record(s) returned`, "CRM")] : [],
      items: legacy.items ?? [],
    };
  }
  if (resolveClients(c.q, s.clients).length === 1) return summarize(c);
  return help(s);
}

// ---------- Model snapshot (RBAC-filtered, compact) ----------
export function buildCommandSnapshot(state: CmdState, me: TeamMember, local: CommandAnswer) {
  const s = scopeState(state, me);
  return {
    today: new Date().toISOString().slice(0, 10),
    role: me.role,
    periods: "curr = last 30 days, prev = previous 30 days (campaign metrics); ads use this week vs last week",
    clients: s.clients.slice(0, 30).map((c) => {
      const p = s.access.media ? groupPerf(s.campaigns.filter((x) => x.clientId === c.id)) : undefined;
      return { id: c.id, company: c.company, industry: c.industry, health: c.health, services: c.services, retainer: c.retainer, spend: p && Math.round(p.curr.spend), roas: p && +p.curr.roas.toFixed(2), roasPrev: p && +p.prev.roas.toFixed(2), cpa: p && Math.round(p.curr.cpa), cpaPrev: p && Math.round(p.prev.cpa), leads: p?.curr.leads };
    }),
    campaigns: s.campaigns.slice(0, 50).map((c) => {
      const p = campPerf(c);
      return { id: c.id, name: c.name, status: c.status, budget: c.budget, spend: Math.round(p.curr.spend), roas: +p.curr.roas.toFixed(2), roasPrev: +p.prev.roas.toFixed(2), cpa: Math.round(p.curr.cpa), cpaPrev: Math.round(p.prev.cpa), kpis: c.kpis };
    }),
    invoicesOpen: s.access.payments ? s.invoices.filter((i) => i.status !== "Paid").map((i) => ({ clientId: i.clientId, outstanding: i.amount - i.paid, status: i.status })) : "not authorized",
    leadsDue: s.access.leads ? s.leads.filter((l) => l.nextFollowUpAt && isPast(l.nextFollowUpAt)).length : "not authorized",
    localFindings: local.insights.map((i) => `[${i.kind}] ${i.text}${i.source ? ` (${i.source})` : ""}`),
    localSteps: local.steps,
  };
}


// ---------- Command Center home ("What is happening?") ----------
export function homeSnapshot(state: CmdState, me: TeamMember) {
  const s = scopeState(state, me);
  const perf = groupPerf(s.campaigns.filter((c) => c.status !== "Planning"));
  const anomalies = s.campaigns
    .filter((c) => c.status === "Active")
    .map((c) => ({ c, ...campaignIssues(s, c) }))
    .filter((r) => r.issues.length)
    .sort((a, b) => sum(b.issues.map((i) => i.weight)) - sum(a.issues.map((i) => i.weight)))
    .slice(0, 4)
    .map((r) => ({ id: r.c.id, label: r.c.name, text: r.issues[0]!.text, href: `/campaigns?c=${r.c.id}` }));
  const endToday = startOfDay().getTime() + DAY;
  return {
    access: s.access,
    perf,
    anomalies,
    followUpsDue: s.leads.filter((l) => !l.optedOut && !["Won", "Lost"].includes(l.status) && l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < endToday).length,
    overdueInvoices: s.invoices.filter((i) => i.status === "Overdue"),
    atRisk: s.clients.filter((c) => c.health !== "Healthy").length,
    recommendations: s.recommendations,
  };
}
