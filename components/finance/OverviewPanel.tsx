"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, ListPlus, Repeat, Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { useCRM } from "@/lib/store";
import { financeInsights, financeRecommendations } from "@/lib/ai/finance";
import { AGENTS } from "@/lib/ai/agents";
import { callAgent, runAgentJob } from "@/lib/ai/client";
import type { InsightItem } from "@/lib/types";
import { compactMoney, DAY, money, pct, relTime } from "@/lib/utils";
import { AgentChip, Button, Card, CardHeader, InsightLegend, InsightList, Progress, Stat, Table, Td, Th } from "@/components/ui";
import { Bars } from "@/components/charts";
import { toast } from "@/components/shell/toast";
import type { FinanceData } from "./useFinance";

const BUCKETS = ["Not due", "1–30 days", "31–60 days", "60+ days"] as const;

export function OverviewPanel({ data, canWrite }: { data: FinanceData; canWrite: boolean }) {
  const clients = useCRM((s) => s.clients);
  const invoices = useCRM((s) => s.invoices);
  const addRecommendations = useCRM((s) => s.addRecommendations);
  const [agentRun, setAgentRun] = useState<{ items: InsightItem[]; at: string; remote: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const { kpis, series } = data;

  const live = useMemo(() => financeInsights(data.input), [data.input]);

  const aging = useMemo(() => {
    const now = data.input.now;
    const byClient = new Map<string, number[]>();
    invoices
      .filter((i) => i.status !== "Paid" && i.amount > i.paid)
      .forEach((i) => {
        const late = Math.floor((now - new Date(i.dueDate).getTime()) / DAY);
        const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
        const row = byClient.get(i.clientId) ?? [0, 0, 0, 0];
        row[b]! += i.amount - i.paid;
        byClient.set(i.clientId, row);
      });
    return [...byClient.entries()].map(([clientId, b]) => ({ clientId, b, total: b.reduce((a, x) => a + x, 0) })).sort((a, b) => b.total - a.total);
  }, [invoices, data.input.now]);

  const mrrRows = useMemo(() => {
    const now = data.input.now;
    return clients.filter((c) => new Date(c.contractEnd).getTime() >= now).sort((a, b) => b.retainer - a.retainer);
  }, [clients, data.input.now]);

  const thisMonth = series[series.length - 1];
  const name = (id: string) => clients.find((c) => c.id === id)?.company ?? id;

  const runAgent = async () => {
    setRunning(true);
    const out = await runAgentJob({
      agent: "finance",
      title: "Finance review — overdue risk, profitability, cash-flow",
      local: async () => {
        const remote = await callAgent(
          "finance",
          "Review agency finances: overdue risk, least profitable clients and cash-flow. Tag every line as data, assumption or recommendation.",
          { kpis, profitability: data.profit.map((p) => ({ client: p.company, revenue: p.revenue, teamCost: Math.round(p.teamCost), directExpenses: Math.round(p.directExpenses), marginPct: Math.round(p.marginPct) })), forecast: data.forecast.rows },
          { format: "insights" },
        );
        return remote?.insights?.length ? { items: remote.insights, remote: true } : { items: financeInsights(data.input), remote: false };
      },
    });
    setRunning(false);
    if (out) setAgentRun({ ...out, at: new Date().toISOString() });
  };

  const pushRecs = () => {
    const recs = financeRecommendations(data.input);
    addRecommendations(recs);
    toast(`${recs.length} finance recommendation${recs.length === 1 ? "" : "s"} sent`, "Approve them in the recommendations queue — execution follows your approval modes.", "ai");
  };

  const agent = AGENTS.finance;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recurring revenue (MRR)" value={compactMoney(kpis.mrr)} hint={`${mrrRows.length} active retainers`} icon={<Repeat className="size-3.5" />} />
        <Stat label="Collected this month" value={compactMoney(thisMonth?.collected ?? 0)} hint={`of ${compactMoney(thisMonth?.revenue ?? 0)} invoiced`} icon={<Wallet className="size-3.5" />} tone="success" />
        <Stat label="Outstanding" value={compactMoney(kpis.outstanding)} hint={`${compactMoney(kpis.overdue)} overdue`} icon={<AlertTriangle className="size-3.5" />} tone={kpis.overdue ? "danger" : "warning"} />
        <Stat label="Expenses this month" value={compactMoney(thisMonth?.expenses ?? 0)} hint="excl. payroll" icon={<TrendingUp className="size-3.5" />} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue vs cost by month" subtitle="Invoiced and collected vs total cost (payroll from Team + all expenses)" />
          <div className="px-2 pb-3">
            <Bars
              data={series.map((r) => ({ month: r.month, revenue: r.revenue, collected: r.collected, cost: r.cost }))}
              x="month"
              fmt={compactMoney}
              series={[
                { key: "revenue", label: "Invoiced", color: "var(--chart-1)" },
                { key: "collected", label: "Collected", color: "var(--chart-3)" },
                { key: "cost", label: "Cost", color: "var(--chart-4)" },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="MRR by client" subtitle="Active retainers" />
          <ul className="space-y-2 px-4 pb-4">
            {mrrRows.map((c) => (
              <li key={c.id}>
                <div className="flex items-center justify-between text-[13px]">
                  <Link href={`/clients/${c.id}`} className="truncate hover:underline">
                    {c.company}
                  </Link>
                  <span className="tabular-nums text-fg-2">
                    {compactMoney(c.retainer)} <span className="text-[11px] text-fg-3">{kpis.mrr ? pct((c.retainer / kpis.mrr) * 100, 0) : ""}</span>
                  </span>
                </div>
                <Progress value={mrrRows[0] ? (c.retainer / mrrRows[0].retainer) * 100 : 0} tone={c.health === "Healthy" ? "accent" : c.health === "At Risk" ? "warning" : "danger"} className="mt-1" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Outstanding & overdue" subtitle="Unpaid balance by client and days past due" />
          {aging.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-fg-3">Nothing outstanding.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  {BUCKETS.map((b) => (
                    <Th key={b} className="text-right">
                      {b}
                    </Th>
                  ))}
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {aging.map((r) => (
                  <tr key={r.clientId}>
                    <Td>
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">
                        {name(r.clientId)}
                      </Link>
                    </Td>
                    {r.b.map((v, i) => (
                      <Td key={i} className={`text-right tabular-nums ${v ? (i >= 2 ? "text-danger font-medium" : i === 1 ? "text-warning" : "text-fg-2") : "text-fg-3"}`}>
                        {v ? compactMoney(v) : "—"}
                      </Td>
                    ))}
                    <Td className="text-right font-medium tabular-nums">{money(r.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Bot className="size-4 text-accent" /> Finance Agent
              </span>
            }
            subtitle={agentRun ? `Last run ${relTime(agentRun.at)} · ${agentRun.remote ? "AI provider" : "local engine"}` : "Live analysis from invoices, retainers, expenses and team cost"}
            action={<AgentChip name={agent.short} color={agent.color} />}
          />
          <div className="space-y-3 px-4 pb-4">
            <InsightLegend />
            <InsightList items={agentRun?.items ?? live} compact />
            {canWrite && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button size="xs" variant="ai" loading={running} icon={<Bot className="size-3" />} onClick={runAgent}>
                  Run Finance Agent
                </Button>
                <Button size="xs" icon={<ListPlus className="size-3" />} onClick={pushRecs}>
                  Send to recommendations
                </Button>
              </div>
            )}
            <p className="text-[11px] text-fg-3">
              Blended gross margin {pct(kpis.grossPct, 0)}. Team costs are estimates from assignments — see the Profitability tab for the method.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
