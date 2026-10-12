"use client";

import { useCRM } from "@/lib/store";
import { can } from "@/lib/permissions";
import { runAgentJob } from "@/lib/ai/client";
import { buildFacts, inWindow, localReport, reportWindow, windowLabel, type AgentReportContent, type ReportDataset } from "@/lib/ai/reporting";
import type { Campaign } from "@/lib/types";

// "upload" reports only on Excel/CSV data; "all" also includes campaigns from connected platforms (and the demo data).
export type DataScope = "upload" | "all";

// Seeded campaigns are one per service, so the service reads best; uploaded ones keep their real name.
export const campaignLabel = (c: Campaign) => (c.dataSource === "upload" ? c.name : c.service);

export const scopeCampaigns = (campaigns: Campaign[], clientId: string | undefined, scope: DataScope) =>
  campaigns.filter((c) => c.clientId === clientId && (scope === "all" || c.dataSource === "upload"));

// The slice of one client's data the Reporting agent may see: only the report window and the
// window before it, and only rows tied to the campaigns in scope.
export function buildReportDataset(clientId: string, days: number, scope: DataScope, focus?: string): ReportDataset | null {
  const s = useCRM.getState();
  const client = s.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const scoped = scopeCampaigns(s.campaigns, clientId, scope);
  const w = reportWindow(scoped, days);
  const ids = new Set(scoped.map((c) => c.id));
  const strategy = scope === "all" ? (s.strategies.find((x) => x.clientId === clientId && x.status === "Approved") ?? s.strategies.find((x) => x.clientId === clientId)) : undefined;
  return {
    client: { id: client.id, company: client.company, industry: client.industry },
    days,
    campaigns: scoped.map((c) => ({ id: c.id, label: campaignLabel(c), platform: c.platform, status: c.status, kpis: c.kpis, metrics: inWindow(c.metrics, w.prevStart, w.end) })),
    ads: s.ads.filter((a) => a.clientId === clientId && ids.has(a.campaignId)).map((a) => ({ name: a.hook ? `${a.name} — “${a.hook}”` : a.name, platform: a.platform, format: a.format, frequency: a.frequency, prev: a.prev, curr: a.curr })),
    recommendations: s.recommendations
      .filter((r) => r.clientId === clientId && ["New", "Approved", "Awaiting Approval"].includes(r.status) && (scope === "all" || (!!r.campaignId && ids.has(r.campaignId))))
      .slice(0, 8)
      .map((r) => ({ title: r.title, recommendation: r.recommendation, priority: r.priority, impact: r.impact })),
    plannedTests: strategy?.testing.slice(0, 4) ?? [],
    focus: focus?.trim() || undefined,
  };
}

// Runs the Reporting agent for one client: RBAC check → credits metered + AI task logged →
// tool-calling model (or the local engine) → report saved under the "Reports" approval mode.
export async function runReportingAgent(clientId: string, days: number, scope: DataScope, focus?: string): Promise<{ id: string; content: AgentReportContent } | { error: string }> {
  const s = useCRM.getState();
  const me = s.team.find((t) => t.id === s.currentUserId) ?? s.team[0]!;
  if (!can(me.role, "reports", "write") || me.role === "client") return { error: "Your role can't generate reports." };
  const ds = buildReportDataset(clientId, days, scope, focus);
  if (!ds) return { error: "Client not found." };
  const facts = buildFacts(ds);
  if (!facts.daysWithData) return { error: "There is no performance data for this client in the selected period." };

  const content = await runAgentJob<AgentReportContent>({
    agent: "reporting",
    title: `Client report: ${ds.client.company}`,
    input: ds.focus ?? `Performance report · ${windowLabel(facts.window)}`,
    clientId,
    minDelayMs: 600,
    local: async () => {
      if (!useCRM.getState().aiEnabled) return localReport(facts, "No AI provider is configured, so the built-in rule-based engine wrote this report.");
      try {
        const res = await fetch("/api/ai/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ds) });
        const json = (await res.json()) as { report?: AgentReportContent; error?: string };
        if (res.ok && json.report) return json.report;
        return localReport(facts, `The AI model call failed (${(json.error ?? `HTTP ${res.status}`).slice(0, 160)}), so the built-in rule-based engine wrote this report.`);
      } catch {
        return localReport(facts, "The AI service could not be reached, so the built-in rule-based engine wrote this report.");
      }
    },
  });
  if (!content) return { error: "Your plan's AI credit limit has been reached (Settings → Plan & usage)." };
  const id = useCRM.getState().saveAgentReport(clientId, windowLabel(facts.window), content);
  return { id, content };
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Standalone, printable copy of a report (open it and print to PDF, or attach it to an email).
export function reportHtml(company: string, period: string, r: AgentReportContent) {
  const t = r.facts.current;
  const d = r.facts.changePct;
  const kpi = (label: string, value: string, delta?: number | null) => `<div class="k"><p>${label}</p><b>${value}</b>${delta != null ? `<span>${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs previous</span>` : ""}</div>`;
  const list = (items: { text: string; kind?: string }[]) => `<ul>${items.map((i) => `<li>${i.kind ? `<i>${i.kind}</i> ` : ""}${esc(i.text)}</li>`).join("")}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(company)} — Performance report</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#16161d;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.55}
h1{font-size:26px;margin:4px 0}h2{font-size:15px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.04em;color:#5b5b6b}
.sub{color:#6b6b7a;font-size:13px;margin:0}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
.k{border:1px solid #e3e3ea;border-radius:10px;padding:10px 12px}.k p{margin:0;font-size:12px;color:#6b6b7a}.k b{font-size:19px;display:block}.k span{font-size:11px;color:#6b6b7a}
ul{padding-left:18px;margin:6px 0}li{margin:5px 0}i{font-style:normal;font-size:10px;text-transform:uppercase;background:#eeeef4;border-radius:4px;padding:1px 5px;color:#5b5b6b}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #e3e3ea;text-align:right}td:first-child,th:first-child{text-align:left}
.f{margin-top:32px;font-size:11px;color:#8a8a98}@media print{body{margin:0 auto}}
</style></head><body>
<p class="sub">Adbibe · Performance report</p><h1>${esc(company)}</h1><p class="sub">${esc(period)}</p>
<h2>Executive summary</h2><p><b>${esc(r.headline)}</b></p><p>${esc(r.summary)}</p>
<div class="g">${kpi("Spend", inr(t.spend), d?.spend)}${kpi("Revenue", inr(t.revenue), d?.revenue)}${kpi("ROAS", `${t.roas.toFixed(2)}x`, d?.roas)}${kpi("CPA", inr(t.cpa), d?.cpa)}${kpi("Leads", t.leads.toLocaleString("en-IN"), d?.leads)}${kpi("Conversions", t.conversions.toLocaleString("en-IN"), d?.conversions)}${kpi("CTR", `${t.ctr.toFixed(2)}%`, d?.ctr)}${kpi("CPC", inr(t.cpc), d?.cpc)}</div>
<h2>Campaign performance</h2><table><tr><th>Campaign</th><th>Spend</th><th>Revenue</th><th>Leads</th><th>Conv.</th><th>CPA</th><th>ROAS</th></tr>${r.facts.campaigns.map((c) => `<tr><td>${esc(c.name)}</td><td>${inr(c.spend)}</td><td>${inr(c.revenue)}</td><td>${c.leads}</td><td>${c.conversions}</td><td>${inr(c.cpa)}</td><td>${c.roas.toFixed(2)}x</td></tr>`).join("")}</table>
<h2>Key insights</h2>${list(r.insights)}
<h2>What changed</h2>${list(r.changes)}
<h2>What we recommend next</h2>${list(r.recommendations.map((x) => ({ text: x.text, kind: x.priority })))}
<h2>Next month's plan</h2>${list(r.plan.map((text) => ({ text })))}
<p class="f">Figures are calculated from campaign data for ${esc(period)}. Commentary is AI-assisted and reviewed by your account team.</p>
</body></html>`;
}
