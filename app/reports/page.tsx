"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Database, FileSpreadsheet, FileText, Link2, Plus, Presentation, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { InsightItem, ReportSchedule } from "@/lib/types";
import { cn, compact, compactMoney, downloadFile, fmtDate, fmtDateTime, fmtShort, money, pct, toCSV, uid } from "@/lib/utils";
import { AreaTrend, Bars, aggregateMetrics, totals } from "@/components/charts";
import { AIBadge, Badge, Button, Card, CardHeader, EmptyState, Field, Input, InsightLegend, InsightList, Modal, PageHeader, Progress, Readonly, Segmented, Select, StatusBadge, Table, Td, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";

type Range = "7" | "30" | "60";
type Format = ReportSchedule["format"];
const SOURCE_KEYS = ["meta", "google_ads", "linkedin_ads", "ga4", "gsc", "sheets"];
// "Presentation" is stored as-is for compatibility; users see it as PPT.
const FORMAT_LABEL: Record<Format, string> = { Dashboard: "Dashboard", PDF: "PDF", Excel: "Excel", Presentation: "PPT" };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function Section({ n, title, subtitle, children, action, className }: { n: number; title: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Card className={cn("break-inside-avoid", className)}>
      <CardHeader title={<span className="flex items-center gap-2"><span className="text-[11px] font-medium tabular-nums text-accent-text">{String(n).padStart(2, "0")}</span>{title}</span>} subtitle={subtitle} action={action} />
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}

function ReportsInner() {
  const me = useMe();
  const params = useSearchParams();
  const allClients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const reports = useCRM((s) => s.reports);
  const schedules = useCRM((s) => s.reportSchedules);
  const integrations = useCRM((s) => s.integrations);
  const creatives = useCRM((s) => s.creatives);
  const ads = useCRM((s) => s.ads);
  const recommendations = useCRM((s) => s.recommendations);
  const strategies = useCRM((s) => s.strategies);
  const generateReport = useCRM((s) => s.generateReport);
  const upsertSchedule = useCRM((s) => s.upsertSchedule);
  const isClient = me.role === "client";
  const writable = can(me.role, "reports", "write") && !isClient;

  // Client portal: only their own client — never other clients' reports.
  const clients = useMemo(() => (isClient ? allClients.filter((c) => c.id === me.clientId) : allClients), [allClients, isClient, me.clientId]);
  const [clientId, setClientId] = useState(() => params.get("client") ?? "");
  const [range, setRange] = useState<Range>(() => (["7", "30", "60"].includes(params.get("range") ?? "") ? (params.get("range") as Range) : "30"));
  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const client = clients.find((c) => c.id === clientId) ?? clients[0];

  const clientCampaigns = useMemo(() => campaigns.filter((c) => c.clientId === client?.id), [campaigns, client]);
  const rows = useMemo(() => aggregateMetrics(clientCampaigns.flatMap((c) => c.metrics.slice(-Number(range)))), [clientCampaigns, range]);
  const prevRows = useMemo(() => aggregateMetrics(clientCampaigns.flatMap((c) => c.metrics.slice(-Number(range) * 2, -Number(range)))), [clientCampaigns, range]);
  const t = useMemo(() => totals(rows), [rows]);
  const p = useMemo(() => totals(prevRows), [prevRows]);
  const perCampaign = useMemo(() => clientCampaigns.map((c) => ({ c, t: totals(aggregateMetrics(c.metrics.slice(-Number(range)))), p: totals(aggregateMetrics(c.metrics.slice(-Number(range) * 2, -Number(range)))) })), [clientCampaigns, range]);
  const period = `Last ${range} days (to ${fmtShort(new Date().toISOString())})`;
  const src = `Connected ad platforms · last ${range} days`;
  const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

  // ---- Creative performance: creative library first, else ad-level rows (7-day windows) ----
  const creativeRows = useMemo(() => {
    const lib = creatives.filter((c) => c.clientId === client?.id && c.performance).map((c) => ({ id: c.id, name: c.title, format: c.format, spend: c.performance!.spend, ctr: c.performance!.ctr, cpa: c.performance!.cpa, roas: c.performance!.roas, source: "Creative library" }));
    if (lib.length) return lib.sort((a, b) => b.roas - a.roas).slice(0, 8);
    return ads
      .filter((a) => a.clientId === client?.id)
      .map((a) => ({ id: a.id, name: a.hook ? `${a.name} — “${a.hook}”` : a.name, format: `${a.platform} · ${a.format}`, spend: a.curr.spend, ctr: a.curr.impressions ? (a.curr.clicks / a.curr.impressions) * 100 : 0, cpa: a.curr.conversions ? a.curr.spend / a.curr.conversions : 0, roas: a.curr.spend ? a.curr.revenue / a.curr.spend : 0, source: "Ad platforms · last 7 days" }))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 8);
  }, [creatives, ads, client]);

  // ---- Goals: campaign KPIs target vs actual ----
  const goals = useMemo(() => clientCampaigns.flatMap((c) => c.kpis.map((k) => {
    const lower = /cpa|cpc|cpl|cost/i.test(k.label);
    const ratio = k.target ? (lower ? (k.actual ? k.target / k.actual : 0) : k.actual / k.target) * 100 : 0;
    return { campaign: c.service, ...k, ratio };
  })), [clientCampaigns]);

  const clientRecs = useMemo(() => recommendations.filter((r) => r.clientId === client?.id && ["New", "Approved", "Awaiting Approval"].includes(r.status)).sort((a, b) => (a.priority === "High" ? -1 : 1) - (b.priority === "High" ? -1 : 1)).slice(0, 5), [recommendations, client]);
  const strategy = useMemo(() => strategies.find((s) => s.clientId === client?.id && s.status === "Approved") ?? strategies.find((s) => s.clientId === client?.id), [strategies, client]);

  const narrative = useMemo(() => {
    const best = [...perCampaign].filter((x) => x.t.spend > 0).sort((a, b) => b.t.roas - a.t.roas)[0];
    const worst = [...perCampaign].filter((x) => x.t.spend > 0).sort((a, b) => a.t.roas - b.t.roas)[0];
    const summary: InsightItem[] = [];
    const insights: InsightItem[] = [];
    const changed: InsightItem[] = [];
    const recs: InsightItem[] = [];
    const plan: InsightItem[] = [];
    if (!rows.length) return { summary, insights, changed, recs, plan };
    summary.push({ kind: "data", text: `${compactMoney(t.spend)} invested across ${perCampaign.filter((x) => x.t.spend > 0).length} campaign(s), returning ${compactMoney(t.revenue)} revenue at ${t.roas.toFixed(2)}x ROAS.`, source: src });
    summary.push({ kind: "data", text: `${compact(t.leads)} leads and ${compact(t.conversions)} conversions at ${money(t.cpa)} CPA (${sign(delta(t.cpa, p.cpa))} vs previous ${range} days).`, source: src });
    if (best) summary.push({ kind: "data", text: `Best performer: ${best.c.service} at ${best.t.roas.toFixed(2)}x ROAS.`, source: src });

    if (best) insights.push({ kind: "data", text: `${best.c.service} drove ${t.revenue ? pct((best.t.revenue / t.revenue) * 100, 0) : "—"} of revenue on ${t.spend ? pct((best.t.spend / t.spend) * 100, 0) : "—"} of spend.`, source: src });
    if (t.ctr < 1.2) insights.push({ kind: "assumption", text: `CTR is ${pct(t.ctr, 2)} — below the ~1.2% we'd expect; creative fatigue or weak hooks are the likely cause.` });
    else insights.push({ kind: "data", text: `CTR ${pct(t.ctr, 2)} with CPC ${money(t.cpc)} — attention is healthy.`, source: src });
    if (t.leads && t.conversions) insights.push({ kind: "data", text: `Lead → conversion rate ${pct((t.conversions / t.leads) * 100)}.`, source: src });

    const metricsList: [string, number, number, boolean][] = [["Spend", t.spend, p.spend, true], ["Leads", t.leads, p.leads, true], ["Conversions", t.conversions, p.conversions, true], ["CPA", t.cpa, p.cpa, false], ["ROAS", t.roas, p.roas, true], ["CTR", t.ctr, p.ctr, true]];
    metricsList.forEach(([label, a, b]) => { if (b && Math.abs(delta(a, b)) >= 5) changed.push({ kind: "data", text: `${label} ${delta(a, b) >= 0 ? "up" : "down"} ${Math.abs(delta(a, b)).toFixed(0)}% vs the previous ${range} days.`, source: src }); });
    perCampaign.forEach((x) => { if (x.p.roas && Math.abs(delta(x.t.roas, x.p.roas)) >= 15) changed.push({ kind: "data", text: `${x.c.service} ROAS moved ${sign(delta(x.t.roas, x.p.roas))} (${x.p.roas.toFixed(2)}x → ${x.t.roas.toFixed(2)}x).`, source: src }); });
    if (!changed.length) changed.push({ kind: "data", text: "No metric moved more than 5% — performance was stable.", source: src });

    clientRecs.forEach((r) => recs.push({ kind: "recommendation", text: `${r.title} — ${r.recommendation}${r.impact ? ` (est. ${r.impact})` : ""}` }));
    if (worst && best && worst.c.id !== best.c.id && worst.t.roas < 2) recs.push({ kind: "recommendation", text: `Shift budget from ${worst.c.service} (${worst.t.roas.toFixed(2)}x) toward ${best.c.service} (${best.t.roas.toFixed(2)}x).` });
    if (t.ctr < 1.2) recs.push({ kind: "recommendation", text: "Refresh creatives: test 3 new hooks and a UGC-style variant." });
    if (!recs.length) recs.push({ kind: "recommendation", text: "Keep the current allocation; scale the best performer gradually (+10–15%/week) while CPA holds." });

    const top = creativeRows[0];
    if (best) plan.push({ kind: "recommendation", text: `Scale ${best.c.service} budget in controlled steps while CPA stays below ${money(t.cpa * 1.1)}.` });
    if (top) plan.push({ kind: "recommendation", text: `Build 3 iterations of the top creative (“${top.name.slice(0, 60)}”).` });
    strategy?.testing.slice(0, 2).forEach((x) => plan.push({ kind: "recommendation", text: `${x.week}: ${x.test} — ${x.hypothesis}` }));
    goals.filter((g) => g.ratio < 90).slice(0, 2).forEach((g) => plan.push({ kind: "recommendation", text: `Close the gap on ${g.campaign} ${g.label} (${g.actual}${g.unit === "x" ? "x" : ""} vs target ${g.target}${g.unit === "x" ? "x" : ""}).` }));
    if (plan.length < 2) plan.push({ kind: "assumption", text: "Next month's detailed plan is agreed in the monthly review call." });
    return { summary, insights, changed, recs, plan };
  }, [rows, perCampaign, t, p, range, src, clientRecs, creativeRows, strategy, goals]);

  const kpis: [string, string, number?][] = [
    ["Spend", compactMoney(t.spend), delta(t.spend, p.spend)],
    ["Impressions", compact(t.impressions), delta(t.impressions, p.impressions)],
    ["Reach", compact(t.reach), delta(t.reach, p.reach)],
    ["Traffic (clicks)", compact(t.clicks), delta(t.clicks, p.clicks)],
    ["CTR", pct(t.ctr, 2), delta(t.ctr, p.ctr)],
    ["CPC", money(t.cpc), -delta(t.cpc, p.cpc)],
    ["Leads", compact(t.leads), delta(t.leads, p.leads)],
    ["Conversions", compact(t.conversions), delta(t.conversions, p.conversions)],
    ["CPA", money(t.cpa), -delta(t.cpa, p.cpa)],
    ["ROAS", `${t.roas.toFixed(2)}x`, delta(t.roas, p.roas)],
    ["Revenue", compactMoney(t.revenue), delta(t.revenue, p.revenue)],
  ];

  const record = (format: Format) => {
    if (client && writable) generateReport(client.id, format, period);
  };

  const exportExcel = () => {
    if (!client) return;
    const csv = toCSV(rows.map((r) => ({ date: r.date, spend: r.spend, impressions: r.impressions, reach: r.reach, clicks: r.clicks, ctr: r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(2) : 0, leads: r.leads, conversions: r.conversions, revenue: r.revenue })));
    const camp = toCSV(perCampaign.map(({ c, t }) => ({ campaign: c.name, platform: c.platform, spend: t.spend, clicks: t.clicks, ctr: t.ctr.toFixed(2), cpc: t.cpc.toFixed(0), leads: t.leads, conversions: t.conversions, cpa: t.cpa.toFixed(0), roas: t.roas.toFixed(2), revenue: t.revenue })));
    const cr = toCSV(creativeRows.map((c) => ({ creative: c.name, format: c.format, spend: c.spend, ctr: c.ctr.toFixed(2), cpa: c.cpa.toFixed(0), roas: c.roas.toFixed(2) })));
    downloadFile(`${client.company.replace(/\s+/g, "-")}-report-${range}d.csv`, `${csv}\n\n${camp}\n\n${cr}`, "text/csv");
    record("Excel");
    toast("Excel (CSV) exported");
  };

  const exportDeck = () => {
    if (!client) return;
    const slide = (inner: string) => `<section>${inner}</section>`;
    const list = (items: InsightItem[]) => `<ul>${items.map((i) => `<li><span class="t ${i.kind}">${i.kind}</span> ${esc(i.text)}</li>`).join("")}</ul>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(client.company)} — Performance</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#0b0b10;color:#f4f4f6}section{min-height:100vh;box-sizing:border-box;padding:8vh 8vw;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #222;scroll-snap-align:start}html{scroll-snap-type:y mandatory}
h1{font-size:56px;margin:0}h2{font-size:36px;margin:0 0 24px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.k{background:#17171d;border-radius:14px;padding:18px}.k p{margin:0;color:#9a9aa6;font-size:14px}.k b{font-size:30px}li{font-size:20px;margin:10px 0;line-height:1.4;list-style:none}table{border-collapse:collapse;font-size:18px}td,th{padding:8px 14px;border-bottom:1px solid #2a2a33;text-align:left}.a{background:linear-gradient(135deg,#6d4aff,#ff6fb1);-webkit-background-clip:text;color:transparent}.t{font-size:11px;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-right:8px;background:#23232c;color:#9a9aa6}.t.recommendation{color:#b8a6ff}.t.assumption{color:#f5c26b}
</style></head><body>
${slide(`<p class="a" style="font-weight:600">Adbibe · Performance report</p><h1>${esc(client.company)}</h1><p style="color:#9a9aa6;font-size:22px">${period}</p>`)}
${slide(`<h2>Executive summary</h2>${list(narrative.summary)}`)}
${slide(`<h2>Headline numbers</h2><div class="g">${kpis.map(([l, v]) => `<div class="k"><p>${l}</p><b>${v}</b></div>`).join("")}</div>`)}
${goals.length ? slide(`<h2>Goals</h2><table><tr><th>Campaign</th><th>KPI</th><th>Target</th><th>Actual</th><th>Progress</th></tr>${goals.map((g) => `<tr><td>${esc(g.campaign)}</td><td>${esc(g.label)}</td><td>${g.target}</td><td>${g.actual}</td><td>${g.ratio.toFixed(0)}%</td></tr>`).join("")}</table>`) : ""}
${slide(`<h2>Campaign performance</h2><table><tr><th>Campaign</th><th>Spend</th><th>Leads</th><th>CPA</th><th>ROAS</th></tr>${perCampaign.map(({ c, t }) => `<tr><td>${esc(c.service)}</td><td>${compactMoney(t.spend)}</td><td>${t.leads}</td><td>${money(t.cpa)}</td><td>${t.roas.toFixed(2)}x</td></tr>`).join("")}</table>`)}
${creativeRows.length ? slide(`<h2>Creative performance</h2><table><tr><th>Creative</th><th>Spend</th><th>CTR</th><th>CPA</th><th>ROAS</th></tr>${creativeRows.map((c) => `<tr><td>${esc(c.name)}</td><td>${compactMoney(c.spend)}</td><td>${c.ctr.toFixed(2)}%</td><td>${money(c.cpa)}</td><td>${c.roas.toFixed(2)}x</td></tr>`).join("")}</table>`) : ""}
${slide(`<h2>Key insights & what changed</h2>${list([...narrative.insights, ...narrative.changed])}`)}
${slide(`<h2>What we recommend next</h2>${list(narrative.recs)}`)}
${slide(`<h2>Next month's plan</h2>${list(narrative.plan)}<p style="color:#9a9aa6;font-size:13px">AI-generated from campaign data; reviewed by your account team.</p>`)}
</body></html>`;
    downloadFile(`${client.company.replace(/\s+/g, "-")}-deck.html`, html, "text/html");
    record("Presentation");
    toast("PPT deck downloaded", "HTML slides — open and present full-screen, or print to PDF.");
  };

  const exportPdf = () => {
    record("PDF");
    setTimeout(() => window.print(), 50);
  };

  const shareDashboard = async () => {
    const url = `${window.location.origin}/reports?client=${client?.id}&range=${range}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    record("Dashboard");
    toast("Dashboard link copied", "Clients with portal access can open it after signing in.");
  };

  const visibleReports = reports.filter((r) => clients.some((c) => c.id === r.clientId));
  const visibleSchedules = schedules.filter((s) => clients.some((c) => c.id === s.clientId));
  const sources = integrations.filter((i) => SOURCE_KEYS.includes(i.key));

  return (
    <div>
      <style>{`@media print{aside,header,.no-print{display:none!important}main{padding:0!important;max-width:none!important}.lg\\:pl-60{padding-left:0!important}.print-area{box-shadow:none!important}body{background:#fff!important}.break-inside-avoid{break-inside:avoid}}`}</style>
      <PageHeader
        title="Reports"
        description="Automated client reporting from connected ad and analytics platforms — dashboard, PDF, PPT and Excel."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button icon={<FileText className="size-3.5" />} onClick={exportPdf}>PDF</Button>
            <Button icon={<FileSpreadsheet className="size-3.5" />} onClick={exportExcel}>Excel</Button>
            <Button icon={<Presentation className="size-3.5" />} onClick={exportDeck}>PPT</Button>
            <Button variant="primary" icon={<Link2 className="size-3.5" />} onClick={shareDashboard}>Share dashboard</Button>
          </div>
        }
      />
      {isClient && <Readonly>You can view and download reports for your account.</Readonly>}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        {!isClient && (
          <Select value={client?.id} onChange={(e) => setClientId(e.target.value)} className="w-56">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
        )}
        <Segmented value={range} onChange={setRange} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "60", label: "60 days" }]} />
        <span className="text-xs text-fg-3">{clientCampaigns.length} campaigns · compared with previous {range} days</span>
      </div>

      {!client ? (
        <EmptyState title="No client selected" />
      ) : (
        <div className="print-area space-y-4">
          <div className="mb-2 hidden print:block">
            <p className="text-sm text-fg-3">Adbibe · Performance report</p>
            <h2 className="text-2xl font-semibold">{client.company}</h2>
            <p className="text-sm text-fg-3">{period}</p>
          </div>

          <Section n={1} title="Executive summary" subtitle={period} action={<AIBadge>AI commentary</AIBadge>}>
            {narrative.summary.length ? <InsightList items={narrative.summary} /> : <p className="text-xs text-fg-3">No performance data for this period.</p>}
            <div className="mt-3"><InsightLegend /></div>
          </Section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {kpis.map(([l, v, d]) => (
              <Card key={l} className="p-3">
                <p className="text-[11px] text-fg-3">{l}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{v}</p>
                {d !== undefined && Number.isFinite(d) && <p className={cn("text-[11px] tabular-nums", d >= 0 ? "text-success" : "text-danger")}>{d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(0)}%</p>}
              </Card>
            ))}
          </div>

          <Section n={2} title="Goals" subtitle="Campaign KPI targets vs actuals">
            {goals.length === 0 ? <p className="text-xs text-fg-3">No KPI targets set on this client&apos;s campaigns.</p> : (
              <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {goals.map((g, i) => (
                  <div key={i}>
                    <div className="mb-1 flex justify-between text-xs"><span><b className="font-medium">{g.campaign}</b> · {g.label}</span><span className="tabular-nums text-fg-3">{g.actual}{g.unit === "x" ? "x" : ""} / {g.target}{g.unit === "x" ? "x" : ""}</span></div>
                    <Progress value={g.ratio} tone={g.ratio >= 100 ? "success" : g.ratio >= 75 ? "accent" : "warning"} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={3} title="Spend, revenue & ROAS">
              {rows.length ? <AreaTrend data={rows.map((r) => ({ ...r, date: fmtShort(r.date) }))} x="date" series={[{ key: "revenue", label: "Revenue" }, { key: "spend", label: "Spend" }]} fmt={compactMoney} height={220} /> : <EmptyState title="No data for this period" />}
            </Section>
            <Section n={4} title="Reach, traffic, leads & conversions">
              <AreaTrend data={rows.map((r) => ({ ...r, date: fmtShort(r.date) }))} x="date" series={[{ key: "leads", label: "Leads" }, { key: "conversions", label: "Conversions" }]} height={220} />
            </Section>
          </div>

          <Section n={5} title="Campaign performance">
            <div className="-mx-4 mb-3"><Bars data={perCampaign.map(({ c, t }) => ({ name: c.service, spend: t.spend, revenue: t.revenue }))} x="name" series={[{ key: "spend", label: "Spend" }, { key: "revenue", label: "Revenue" }]} fmt={compactMoney} height={200} /></div>
            <div className="-mx-4">
              <Table>
                <thead><tr><Th>Campaign</Th><Th>Status</Th><Th>Spend</Th><Th>Reach</Th><Th>Clicks</Th><Th>CTR</Th><Th>CPC</Th><Th>Leads</Th><Th>Conv.</Th><Th>CPA</Th><Th>ROAS</Th><Th>Revenue</Th></tr></thead>
                <tbody className="tabular-nums">
                  {perCampaign.map(({ c, t }) => (
                    <tr key={c.id}>
                      <Td><p className="font-medium">{c.service}</p><p className="text-xs text-fg-3">{c.platform}</p></Td>
                      <Td><StatusBadge status={c.status} /></Td>
                      <Td>{compactMoney(t.spend)}</Td><Td>{compact(t.reach)}</Td><Td>{compact(t.clicks)}</Td><Td>{pct(t.ctr, 2)}</Td><Td>{money(t.cpc)}</Td>
                      <Td>{t.leads}</Td><Td>{t.conversions}</Td><Td>{money(t.cpa)}</Td>
                      <Td className={t.roas >= 3 ? "text-success" : t.roas < 2 ? "text-danger" : ""}>{t.roas.toFixed(2)}x</Td>
                      <Td>{compactMoney(t.revenue)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Section>

          <Section n={6} title="Creative performance" subtitle={creativeRows[0]?.source ?? "No creative data yet"}>
            {creativeRows.length === 0 ? <p className="text-xs text-fg-3">Creative-level data appears once ads or creatives are synced.</p> : (
              <div className="-mx-4">
                <Table>
                  <thead><tr><Th>Creative</Th><Th>Format</Th><Th>Spend</Th><Th>CTR</Th><Th>CPA</Th><Th>ROAS</Th></tr></thead>
                  <tbody className="tabular-nums">
                    {creativeRows.map((c, i) => (
                      <tr key={c.id}>
                        <Td className="max-w-72"><span className="line-clamp-1 font-medium">{c.name}</span>{i === 0 && <Badge tone="success" className="mt-0.5">Top performer</Badge>}</Td>
                        <Td className="text-xs text-fg-2">{c.format}</Td>
                        <Td>{compactMoney(c.spend)}</Td><Td>{pct(c.ctr, 2)}</Td><Td>{money(c.cpa)}</Td>
                        <Td className={c.roas >= 3 ? "text-success" : c.roas < 1.5 ? "text-danger" : ""}>{c.roas.toFixed(2)}x</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={7} title="Key insights" action={<AIBadge>AI</AIBadge>}>
              {narrative.insights.length ? <InsightList items={narrative.insights} /> : <p className="text-xs text-fg-3">No data to analyse.</p>}
            </Section>
            <Section n={8} title="What changed" subtitle={`vs previous ${range} days`}>
              {narrative.changed.length ? <InsightList items={narrative.changed} /> : <p className="text-xs text-fg-3">No data to compare.</p>}
            </Section>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section n={9} title="What we recommend next" action={<AIBadge>AI</AIBadge>} subtitle={isClient ? "Your account team reviews every recommendation" : "Includes open AI recommendations for this client"}>
              {narrative.recs.length ? <InsightList items={narrative.recs} /> : <p className="text-xs text-fg-3">No recommendations.</p>}
            </Section>
            <Section n={10} title="Next month's plan" subtitle={strategy ? `Aligned with “${strategy.title}”` : undefined}>
              {narrative.plan.length ? <InsightList items={narrative.plan} /> : <p className="text-xs text-fg-3">Plan appears once there is performance data.</p>}
            </Section>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-fg-3"><Sparkles className="size-3 text-accent" /> Commentary is generated only from the metrics on this page and open recommendations; it is reviewed before sending (Reports approval mode).</p>
        </div>
      )}

      <div className="no-print mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Scheduled reports"
            subtitle="Generated automatically and sent to clients (subject to the Reports approval mode)."
            action={writable && client && <Button size="xs" icon={<Plus className="size-3" />} onClick={() => setEditing({ id: uid("rs"), clientId: client.id, frequency: "Monthly", format: "PDF", recipients: [client.contacts[0]?.email ?? ""], nextRunAt: new Date(Date.now() + 7 * 86400000).toISOString(), enabled: true })}>Add schedule</Button>}
          />
          <Table>
            <thead><tr><Th>Client</Th><Th>Frequency</Th><Th>Format</Th><Th>Recipients</Th><Th>Next run</Th><Th>Enabled</Th><Th /></tr></thead>
            <tbody>
              {visibleSchedules.length === 0 && <tr><Td colSpan={7} className="text-center text-xs text-fg-3">No schedules</Td></tr>}
              {visibleSchedules.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{allClients.find((c) => c.id === s.clientId)?.company}</Td>
                  <Td>{s.frequency}</Td>
                  <Td><Badge>{FORMAT_LABEL[s.format]}</Badge></Td>
                  <Td className="max-w-48 truncate text-xs text-fg-2">{s.recipients.join(", ")}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(s.nextRunAt)}</Td>
                  <Td><Toggle checked={s.enabled} onChange={(v) => writable && upsertSchedule({ ...s, enabled: v })} label="Enabled" /></Td>
                  <Td>{writable && <Button size="xs" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Data sources" subtitle={isClient ? undefined : "Manage in Settings → Integrations"} />
          <ul className="space-y-2 px-4 pb-4">
            {sources.map((i) => (
              <li key={i.key} className="flex items-center gap-2 text-[13px]">
                <Database className="size-3.5 text-fg-3" />
                <span className="flex-1">{i.name}</span>
                <StatusBadge status={i.status} />
              </li>
            ))}
            <li className="flex items-center gap-2 text-[13px]">
              <FileSpreadsheet className="size-3.5 text-fg-3" />
              <span className="flex-1">Excel upload</span>
              <Badge tone="success" dot>Built-in</Badge>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="no-print mt-4">
        <CardHeader title="Generated reports" subtitle="History of reports produced from this workspace" />
        {visibleReports.length === 0 ? (
          <EmptyState icon={<CalendarClock className="size-5" />} title="No reports generated yet" description="Export a PDF, Excel or PPT above to create one." />
        ) : (
          <Table>
            <thead><tr><Th>Client</Th><Th>Period</Th><Th>Format</Th><Th>Created</Th><Th>Status</Th></tr></thead>
            <tbody>
              {visibleReports.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{allClients.find((c) => c.id === r.clientId)?.company}</Td>
                  <Td className="text-xs">{r.period}</Td>
                  <Td><Badge>{FORMAT_LABEL[r.format]}</Badge></Td>
                  <Td className="text-xs">{fmtDate(r.createdAt)}</Td>
                  <Td>{r.sent ? <Badge tone="success" dot>Sent</Badge> : <Badge tone="warning" dot>{isClient ? "Being prepared" : "Awaiting approval"}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && (
        <ScheduleModal
          schedule={editing}
          clients={clients.map((c) => ({ id: c.id, company: c.company }))}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            upsertSchedule(s);
            toast("Schedule saved");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ScheduleModal({ schedule, clients, onClose, onSave }: { schedule: ReportSchedule; clients: { id: string; company: string }[]; onClose: () => void; onSave: (s: ReportSchedule) => void }) {
  const [s, setS] = useState(schedule);
  const [rec, setRec] = useState(schedule.recipients.join(", "));
  return (
    <Modal open onClose={onClose} title="Report schedule" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ ...s, recipients: rec.split(",").map((x) => x.trim()).filter(Boolean) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" className="col-span-2">
          <Select value={s.clientId} onChange={(e) => setS({ ...s, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select>
        </Field>
        <Field label="Frequency"><Select value={s.frequency} onChange={(e) => setS({ ...s, frequency: e.target.value as ReportSchedule["frequency"] })}><option>Weekly</option><option>Monthly</option></Select></Field>
        <Field label="Format"><Select value={s.format} onChange={(e) => setS({ ...s, format: e.target.value as Format })}>{(["Dashboard", "PDF", "Excel", "Presentation"] as const).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}</Select></Field>
        <Field label="Next run"><Input type="datetime-local" value={s.nextRunAt.slice(0, 16)} onChange={(e) => setS({ ...s, nextRunAt: new Date(e.target.value).toISOString() })} /></Field>
        <Field label="Enabled"><div className="flex h-8 items-center"><Toggle checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} /></div></Field>
        <Field label="Recipients (comma separated)" className="col-span-2"><Input value={rec} onChange={(e) => setRec(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsInner />
    </Suspense>
  );
}
