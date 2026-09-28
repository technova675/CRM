// Finance engine — pure functions (no store imports) so the Finance page, the
// Finance Agent and the seed can all share the same profitability maths.
import type { Campaign, Client, Expense, InsightItem, Invoice, Priority, Project, Recommendation, Role, Service, Task, TeamMember } from "../types";
import { DAY, money, pct, uid } from "../utils";

// ---------------------------------------------------------------------------
// Team cost allocation
// ---------------------------------------------------------------------------
// Method (shown to users in the Profitability tab):
// 1. Every link between a team member and a client is converted to estimated weekly hours:
//    - account manager of the client            → ACCOUNT_MANAGER_HRS per client
//    - on a campaign's team (campaign.teamIds)  → CAMPAIGN_BASE_HRS + CAMPAIGN_HRS_PER_100K × monthly budget / ₹1L
//      (× PAUSED_FACTOR when the campaign is paused; completed campaigns are ignored)
//    - specialist whose skill matches a service the client buys → SPECIALIST_HRS per client
//    - open tasks assigned to them for that client (priority → hours, see TASK_HOURS)
// 2. A member's monthly cost is split by those hours. If demand exceeds weekly capacity, 100 % of the
//    cost is spread over clients pro rata (member is over capacity). If demand is below capacity, the
//    unused share is "bench / overhead" and is not charged to any client.
export const EFFORT = {
  ACCOUNT_MANAGER_HRS: 4,
  CAMPAIGN_BASE_HRS: 2,
  CAMPAIGN_HRS_PER_100K: 0.6,
  SPECIALIST_HRS: 2.5,
  PAUSED_FACTOR: 0.5, // paused campaigns need roughly half the effort
  WEEKS_PER_MONTH: 4.33,
} as const;

// Assumed effort per open task (used by Team → Workload and cost allocation).
export const TASK_HOURS: Record<Priority, number> = { Urgent: 6, High: 4, Medium: 2, Low: 1 };

// Which services a specialist role works on (performance marketers are allocated via campaign teams).
export const ROLE_SERVICES: Partial<Record<Role, Service[]>> = {
  seo: ["SEO"],
  social_media: ["Social Media"],
  influencer_manager: ["Influencer Marketing"],
  creative_strategist: ["Meta Ads", "Social Media", "Brand Strategy", "Video Production"],
  designer: ["Meta Ads", "Social Media", "Brand Strategy", "LinkedIn Ads"],
  video_editor: ["Meta Ads", "Video Production"],
  ai_automation: ["AI Automation"],
};

export const LOW_MARGIN_PCT = 30;

export interface MemberAllocation {
  memberId: string;
  demandHours: number; // estimated weekly hours of client work
  capacity: number;
  utilisation: number; // demand / capacity (%)
  monthlyCost: number;
  allocatedCost: number;
  benchCost: number;
  byClient: Record<string, { hours: number; cost: number }>;
}

export interface AllocationInput {
  team: TeamMember[];
  clients: Client[];
  campaigns: Campaign[];
  tasks?: Task[];
}

const taskClientId = (t: Task, campaigns: Campaign[]) => {
  if (!t.related) return undefined;
  if (t.related.type === "client") return t.related.id;
  if (t.related.type === "campaign") return campaigns.find((c) => c.id === t.related!.id)?.clientId;
  return undefined;
};

export function allocateTeamCost({ team, clients, campaigns, tasks = [] }: AllocationInput): MemberAllocation[] {
  const clientIds = new Set(clients.map((c) => c.id));
  const staff = team.filter((m) => m.role !== "client" && m.status !== "disabled");
  return staff.map((m) => {
    const hours: Record<string, number> = {};
    const add = (cid: string | undefined, h: number) => {
      if (!cid || !clientIds.has(cid) || h <= 0) return;
      hours[cid] = (hours[cid] ?? 0) + h;
    };
    clients.forEach((c) => {
      if (c.accountManagerId === m.id) add(c.id, EFFORT.ACCOUNT_MANAGER_HRS);
      const skills = ROLE_SERVICES[m.role];
      if (skills && c.services.some((s) => skills.includes(s))) add(c.id, EFFORT.SPECIALIST_HRS);
    });
    campaigns.forEach((cmp) => {
      if (cmp.status === "Completed" || !cmp.teamIds.includes(m.id)) return;
      const h = EFFORT.CAMPAIGN_BASE_HRS + (EFFORT.CAMPAIGN_HRS_PER_100K * cmp.budget) / 100000;
      add(cmp.clientId, cmp.status === "Paused" ? h * EFFORT.PAUSED_FACTOR : h);
    });
    tasks.forEach((t) => {
      if (t.status === "Done" || t.assigneeId !== m.id) return;
      add(taskClientId(t, campaigns), TASK_HOURS[t.priority]);
    });
    const demand = Object.values(hours).reduce((a, b) => a + b, 0);
    const capacity = m.capacityHours ?? 40;
    const cost = m.monthlyCost ?? 0;
    const denom = Math.max(demand, capacity) || 1;
    const byClient: MemberAllocation["byClient"] = {};
    for (const [cid, h] of Object.entries(hours)) byClient[cid] = { hours: h, cost: (cost * h) / denom };
    const allocated = Object.values(byClient).reduce((a, b) => a + b.cost, 0);
    return { memberId: m.id, demandHours: demand, capacity, utilisation: capacity ? (demand / capacity) * 100 : 0, monthlyCost: cost, allocatedCost: allocated, benchCost: Math.max(0, cost - allocated), byClient };
  });
}

// ---------------------------------------------------------------------------
// Client profitability (monthly run-rate)
// ---------------------------------------------------------------------------
export interface ClientProfit {
  clientId: string;
  company: string;
  health: Client["health"];
  revenue: number; // monthly retainer
  teamCost: number; // allocated monthly team cost
  directExpenses: number; // non-billable client expenses, trailing 90-day monthly average
  billableExpenses: number; // pass-through costs to re-invoice (excluded from margin)
  cost: number;
  margin: number;
  marginPct: number;
  low: boolean;
  allocations: { memberId: string; hours: number; cost: number }[];
}

export const EXPENSE_WINDOW_DAYS = 90;

export function clientProfitability(input: AllocationInput & { expenses: Expense[]; now?: number }): ClientProfit[] {
  const now = input.now ?? Date.now();
  const alloc = allocateTeamCost(input);
  const since = now - EXPENSE_WINDOW_DAYS * DAY;
  const months = EXPENSE_WINDOW_DAYS / 30;
  return input.clients
    .map((c) => {
      const allocations = alloc
        .filter((a) => a.byClient[c.id])
        .map((a) => ({ memberId: a.memberId, hours: a.byClient[c.id]!.hours, cost: a.byClient[c.id]!.cost }))
        .sort((a, b) => b.cost - a.cost);
      const teamCost = allocations.reduce((a, b) => a + b.cost, 0);
      const recent = input.expenses.filter((e) => e.clientId === c.id && new Date(e.date).getTime() >= since);
      const directExpenses = recent.filter((e) => !e.billable).reduce((a, e) => a + e.amount, 0) / months;
      const billableExpenses = recent.filter((e) => e.billable).reduce((a, e) => a + e.amount, 0) / months;
      const revenue = c.retainer;
      const cost = teamCost + directExpenses;
      const margin = revenue - cost;
      const marginPct = revenue ? (margin / revenue) * 100 : 0;
      return { clientId: c.id, company: c.company, health: c.health, revenue, teamCost, directExpenses, billableExpenses, cost, margin, marginPct, low: marginPct < LOW_MARGIN_PCT, allocations };
    })
    .sort((a, b) => a.marginPct - b.marginPct);
}

// ---------------------------------------------------------------------------
// Project profitability (lifetime of the project)
// ---------------------------------------------------------------------------
export interface ProjectProfit {
  projectId: string;
  name: string;
  clientId: string;
  status: Project["status"];
  months: number;
  revenue: number;
  teamCost: number;
  directExpenses: number;
  margin: number;
  marginPct: number;
  taskHours: number;
  low: boolean;
}

// Revenue: client retainer × project duration (months) ÷ number of the client's projects.
// Team cost: the client's allocated monthly team cost (see allocateTeamCost) × months ÷ the client's projects.
// Expenses: client non-billable expenses dated inside the project window ÷ number of the client's projects.
// Task hours on the project (priority → hours) are shown for context; they already feed the client allocation.
export function projectProfitability({ projects, tasks, team, clients, campaigns, expenses }: { projects: Project[]; tasks: Task[]; team: TeamMember[]; clients: Client[]; campaigns: Campaign[]; expenses: Expense[] }): ProjectProfit[] {
  const perClient = new Map<string, number>();
  projects.forEach((p) => perClient.set(p.clientId, (perClient.get(p.clientId) ?? 0) + 1));
  const clientTeamCost = new Map<string, number>();
  allocateTeamCost({ team, clients, campaigns, tasks }).forEach((a) => Object.entries(a.byClient).forEach(([cid, v]) => clientTeamCost.set(cid, (clientTeamCost.get(cid) ?? 0) + v.cost)));
  return projects.map((p) => {
    const client = clients.find((c) => c.id === p.clientId);
    const share = 1 / (perClient.get(p.clientId) ?? 1);
    const start = new Date(p.startDate).getTime();
    const end = new Date(p.dueDate).getTime();
    const months = Math.max(0.5, (end - start) / (30 * DAY));
    const revenue = (client?.retainer ?? 0) * months * share;
    const taskHours = tasks.filter((t) => t.projectId === p.id).reduce((a, t) => a + TASK_HOURS[t.priority], 0);
    const teamCost = (clientTeamCost.get(p.clientId) ?? 0) * months * share;
    const directExpenses =
      expenses.filter((e) => e.clientId === p.clientId && !e.billable && new Date(e.date).getTime() >= start && new Date(e.date).getTime() <= end).reduce((a, e) => a + e.amount, 0) * share;
    const margin = revenue - teamCost - directExpenses;
    const marginPct = revenue ? (margin / revenue) * 100 : 0;
    return { projectId: p.id, name: p.name, clientId: p.clientId, status: p.status, months, revenue, teamCost, directExpenses, margin, marginPct, taskHours, low: revenue > 0 && marginPct < LOW_MARGIN_PCT };
  });
}

// ---------------------------------------------------------------------------
// Monthly revenue vs cost, MRR, forecast
// ---------------------------------------------------------------------------
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

export interface MonthRow {
  month: string;
  key: string;
  revenue: number; // invoiced in month
  collected: number;
  teamCost: number; // full payroll of active staff (incl. overhead)
  expenses: number; // all expenses dated in month (billable included — they're cash out)
  cost: number;
  net: number;
}

export function monthlySeries({ invoices, expenses, team, months = 6, now = Date.now() }: { invoices: Invoice[]; expenses: Expense[]; team: TeamMember[]; months?: number; now?: number }): MonthRow[] {
  const payroll = team.filter((m) => m.role !== "client" && m.status !== "disabled").reduce((a, m) => a + (m.monthlyCost ?? 0), 0);
  const out: MonthRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = monthKey(d);
    const inv = invoices.filter((x) => monthKey(new Date(x.issuedAt)) === key);
    const exp = expenses.filter((x) => monthKey(new Date(x.date)) === key).reduce((a, e) => a + e.amount, 0);
    const revenue = inv.reduce((a, x) => a + x.amount, 0);
    const cost = payroll + exp;
    out.push({ month: d.toLocaleDateString("en-IN", { month: "short" }), key, revenue, collected: inv.reduce((a, x) => a + x.paid, 0), teamCost: payroll, expenses: exp, cost, net: revenue - cost });
  }
  return out;
}

export const activeClients = (clients: Client[], now = Date.now()) => clients.filter((c) => new Date(c.contractEnd).getTime() >= now);
export const mrr = (clients: Client[], now = Date.now()) => activeClients(clients, now).reduce((a, c) => a + c.retainer, 0);

export interface ForecastRow {
  month: string;
  committed: number; // retainers with a contract covering the month
  atRisk: number; // part of committed from At Risk / Churn Risk clients
  expectedCash: number; // (committed + average rebilled expenses) × historic collection rate
  costs: number; // payroll + average monthly expenses
  net: number;
  ending: { clientId: string; company: string; retainer: number; contractEnd: string }[];
}

export function forecast({ clients, invoices, expenses, team, months = 3, now = Date.now() }: { clients: Client[]; invoices: Invoice[]; expenses: Expense[]; team: TeamMember[]; months?: number; now?: number }): { rows: ForecastRow[]; collectionRate: number; avgExpenses: number; avgRebilled: number; payroll: number; expired: { clientId: string; company: string; retainer: number; contractEnd: string }[] } {
  const since = now - 180 * DAY;
  const recentInv = invoices.filter((i) => new Date(i.issuedAt).getTime() >= since && new Date(i.dueDate).getTime() < now);
  const billed = recentInv.reduce((a, i) => a + i.amount, 0);
  const collectionRate = billed ? recentInv.reduce((a, i) => a + i.paid, 0) / billed : 1;
  const recentExp = expenses.filter((e) => new Date(e.date).getTime() >= since);
  const avgExpenses = recentExp.reduce((a, e) => a + e.amount, 0) / 6;
  const avgRebilled = recentExp.filter((e) => e.billable).reduce((a, e) => a + e.amount, 0) / 6;
  const expired = clients.filter((c) => new Date(c.contractEnd).getTime() < now).map((c) => ({ clientId: c.id, company: c.company, retainer: c.retainer, contractEnd: c.contractEnd }));
  const payroll = team.filter((m) => m.role !== "client" && m.status !== "disabled").reduce((a, m) => a + (m.monthlyCost ?? 0), 0);
  const rows: ForecastRow[] = [];
  for (let i = 1; i <= months; i++) {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() + i);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const live = clients.filter((c) => new Date(c.contractEnd).getTime() >= start.getTime() && new Date(c.contractStart).getTime() < end.getTime());
    const committed = live.reduce((a, c) => a + c.retainer, 0);
    const atRisk = live.filter((c) => c.health !== "Healthy").reduce((a, c) => a + c.retainer, 0);
    const ending = clients
      .filter((c) => new Date(c.contractEnd).getTime() >= start.getTime() && new Date(c.contractEnd).getTime() < end.getTime())
      .map((c) => ({ clientId: c.id, company: c.company, retainer: c.retainer, contractEnd: c.contractEnd }));
    const expectedCash = (committed + avgRebilled) * collectionRate;
    const costs = payroll + avgExpenses;
    rows.push({ month: start.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), committed, atRisk, expectedCash, costs, net: expectedCash - costs, ending });
  }
  return { rows, collectionRate, avgExpenses, avgRebilled, payroll, expired };
}

// ---------------------------------------------------------------------------
// Finance Agent — insights tagged data / assumption / recommendation
// ---------------------------------------------------------------------------
export interface FinanceInput extends AllocationInput {
  invoices: Invoice[];
  expenses: Expense[];
  now?: number;
}

export function financeInsights(input: FinanceInput): InsightItem[] {
  const now = input.now ?? Date.now();
  const out: InsightItem[] = [];
  const name = (id: string) => input.clients.find((c) => c.id === id)?.company ?? id;

  // Overdue risk
  const overdue = input.invoices.filter((i) => i.status === "Overdue" || (i.status !== "Paid" && new Date(i.dueDate).getTime() < now && i.paid < i.amount));
  const overdueAmt = overdue.reduce((a, i) => a + i.amount - i.paid, 0);
  if (overdue.length) {
    const byClient = new Map<string, { amt: number; n: number; reminders: number; oldest: number }>();
    overdue.forEach((i) => {
      const cur = byClient.get(i.clientId) ?? { amt: 0, n: 0, reminders: 0, oldest: now };
      byClient.set(i.clientId, { amt: cur.amt + i.amount - i.paid, n: cur.n + 1, reminders: cur.reminders + i.remindersSent, oldest: Math.min(cur.oldest, new Date(i.dueDate).getTime()) });
    });
    const worst = [...byClient.entries()].sort((a, b) => b[1].amt - a[1].amt);
    out.push({ kind: "data", text: `${money(overdueAmt)} is overdue across ${overdue.length} invoice${overdue.length > 1 ? "s" : ""} from ${byClient.size} client${byClient.size > 1 ? "s" : ""}.`, source: "Invoices" });
    const [cid, w] = worst[0]!;
    const days = Math.round((now - w.oldest) / DAY);
    out.push({ kind: "data", text: `${name(cid)} owes ${money(w.amt)} (${w.n} invoice${w.n > 1 ? "s" : ""}, oldest ${days} days past due, ${w.reminders} reminder${w.reminders === 1 ? "" : "s"} sent).`, source: "Invoices" });
    const client = input.clients.find((c) => c.id === cid);
    if (client && client.health !== "Healthy") out.push({ kind: "assumption", text: `${client.company} is also flagged "${client.health}" — overdue payments combined with low health often precede churn.`, source: "Client health" });
    out.push({ kind: "recommendation", text: w.reminders >= 2 ? `Escalate ${name(cid)} to the account manager for a call; pause new out-of-scope work until the balance is cleared.` : `Send a payment reminder to ${name(cid)} (respects the Payment reminders approval mode).` });
  } else {
    out.push({ kind: "data", text: "No overdue invoices.", source: "Invoices" });
  }

  // Profitability
  const profit = clientProfitability({ ...input, now });
  const low = profit.filter((p) => p.low);
  const totalRev = profit.reduce((a, p) => a + p.revenue, 0);
  const totalMargin = profit.reduce((a, p) => a + p.margin, 0);
  if (totalRev) out.push({ kind: "data", text: `Blended gross margin across ${profit.length} clients is ${pct((totalMargin / totalRev) * 100, 0)} (${money(totalMargin)} / month on ${money(totalRev)} retainers).`, source: "Retainers · allocated team cost · expenses" });
  low.slice(0, 3).forEach((p) => {
    const hrs = p.allocations.reduce((a, x) => a + x.hours, 0);
    out.push({ kind: "data", text: `${p.company} runs at ${pct(p.marginPct, 0)} margin: ${money(p.revenue)} retainer vs ${money(p.teamCost)} team + ${money(p.directExpenses)} direct costs.`, source: "Profitability model" });
    if (hrs) out.push({ kind: "assumption", text: `${p.company} draws ~${hrs.toFixed(0)} h/week of estimated effort from ${p.allocations.length} people — hours are estimated from assignments, not timesheets.` });
  });
  if (low.length) out.push({ kind: "recommendation", text: `Review scope vs retainer for ${low.map((p) => p.company).join(" and ")}: either reprice at renewal (target ≥ 40% margin) or reduce the deliverables that drive team hours.` });
  const best = [...profit].sort((a, b) => b.marginPct - a.marginPct)[0];
  if (best) out.push({ kind: "data", text: `Most profitable: ${best.company} at ${pct(best.marginPct, 0)} margin.`, source: "Profitability model" });

  // Cash-flow
  const f = forecast({ ...input, now });
  const next = f.rows[0];
  if (next) {
    out.push({ kind: "data", text: `Historic collection rate is ${pct(f.collectionRate * 100, 0)}; monthly outgoings are ~${money(next.costs)} (payroll ${money(f.payroll)} + avg. expenses ${money(f.avgExpenses)}, of which ${money(f.avgRebilled)} is rebilled).`, source: "Invoices · expenses · team" });
    out.push({
      kind: "assumption",
      text: `If collections hold, ${next.month} cash-in is ~${money(next.expectedCash)} → ${next.net >= 0 ? "surplus" : "shortfall"} of ${money(Math.abs(next.net))}. Assumes no new clients, no renewals of expired contracts and flat payroll.`,
    });
    if (f.expired.length) out.push({ kind: "data", text: `${f.expired.length} client contract${f.expired.length > 1 ? "s have" : " has"} passed the end date but ${f.expired.length > 1 ? "are" : "is"} still on retainer: ${f.expired.map((e) => e.company).join(", ")} (${money(f.expired.reduce((a, e) => a + e.retainer, 0))}/mo not counted as committed).`, source: "Client contracts" });
    if (f.expired.length) out.push({ kind: "recommendation", text: "Get renewals signed for expired contracts so that revenue is contractually committed." });
    const ending = f.rows.flatMap((r) => r.ending);
    if (ending.length) out.push({ kind: "recommendation", text: `Start renewal conversations now: ${ending.map((e) => `${e.company} (${money(e.retainer)}/mo)`).join(", ")} contract${ending.length > 1 ? "s end" : " ends"} in the next ${f.rows.length} months.` });
    if (next.net < 0) out.push({ kind: "recommendation", text: "Outgoings exceed expected cash-in — prioritise collecting overdue balances and review bench (unallocated) team capacity." });
  }

  // Concentration
  const act = activeClients(input.clients, now);
  const m = mrr(input.clients, now);
  const top = [...act].sort((a, b) => b.retainer - a.retainer)[0];
  if (top && m) {
    const share = (top.retainer / m) * 100;
    out.push({ kind: "data", text: `${top.company} is ${pct(share, 0)} of MRR (${money(m)}).`, source: "Client retainers" });
    if (share > 25) out.push({ kind: "recommendation", text: `Revenue concentration above 25% — diversify pipeline so losing ${top.company} wouldn't threaten payroll.` });
  }
  return out;
}

// Turns the least-profitable clients and overdue balances into Finance recommendations so they flow
// through the standard recommendation → approval → execution pipeline.
export function financeRecommendations(input: FinanceInput): Recommendation[] {
  const now = input.now ?? Date.now();
  const at = new Date(now).toISOString();
  const recs: Recommendation[] = [];
  clientProfitability({ ...input, now })
    .filter((p) => p.low)
    .forEach((p) =>
      recs.push({
        id: uid("rec"),
        agent: "finance",
        clientId: p.clientId,
        title: `Margin review — ${p.company} at ${pct(p.marginPct, 0)}`,
        category: "Finance",
        finding: `${p.company} earns ${money(p.revenue)}/mo against ${money(p.cost)} of allocated team and direct cost (${pct(p.marginPct, 0)} margin, below the ${LOW_MARGIN_PCT}% floor).`,
        why: "Estimated team effort (from assignments) is high relative to the retainer.",
        evidence: [
          { label: "Retainer", value: money(p.revenue), source: "Client record" },
          { label: "Team cost", value: money(p.teamCost), source: "Allocation model" },
          { label: "Direct expenses", value: money(p.directExpenses), source: "Expenses · 90 days" },
        ],
        assumptions: ["Team hours are estimated from account, campaign, service and task assignments — not timesheets."],
        recommendation: "Review scope vs retainer with the account manager; propose repricing or a reduced scope at renewal.",
        priority: p.marginPct < 15 ? "High" : "Medium",
        impact: `Reaching 40% margin needs ~${money(Math.max(0, p.cost / 0.6 - p.revenue))}/mo more revenue or equivalent cost reduction (estimate).`,
        status: "New",
        action: { type: "create_task", label: `Margin review — ${p.company}` },
        createdAt: at,
      }),
    );
  const overdue = input.invoices.filter((i) => i.status === "Overdue");
  const byClient = new Map<string, number>();
  overdue.forEach((i) => byClient.set(i.clientId, (byClient.get(i.clientId) ?? 0) + i.amount - i.paid));
  byClient.forEach((amt, cid) => {
    const c = input.clients.find((x) => x.id === cid);
    recs.push({
      id: uid("rec"),
      agent: "finance",
      clientId: cid,
      title: `Collect overdue balance — ${c?.company ?? cid}`,
      category: "Finance",
      finding: `${money(amt)} overdue from ${c?.company ?? cid}.`,
      evidence: [{ label: "Overdue", value: money(amt), source: "Invoices" }],
      recommendation: "Account manager to call the client and agree a payment date; follow up in writing.",
      priority: amt > 150000 ? "High" : "Medium",
      status: "New",
      action: { type: "create_task", label: `Collect overdue ${money(amt)} — ${c?.company ?? cid}` },
      createdAt: at,
    });
  });
  return recs;
}
