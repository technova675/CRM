"use client";

import { useMemo, useState } from "react";
import { useCRM } from "@/lib/store";
import { allocateTeamCost, clientProfitability, EXPENSE_WINDOW_DAYS, forecast, mrr, monthlySeries, projectProfitability } from "@/lib/ai/finance";
import { DAY } from "@/lib/utils";

// Shared derived finance data. Selects raw slices only (Zustand v5 rule) and derives with useMemo.
export function useFinance() {
  const team = useCRM((s) => s.team);
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const tasks = useCRM((s) => s.tasks);
  const expenses = useCRM((s) => s.expenses);
  const invoices = useCRM((s) => s.invoices);
  const projects = useCRM((s) => s.projects);

  const [now] = useState(() => Date.now()); // stable "as of" timestamp for this page view

  return useMemo(() => {
    const input = { team, clients, campaigns, tasks, expenses, invoices, now };
    const allocation = allocateTeamCost(input);
    const profit = clientProfitability(input);
    const projectProfit = projectProfitability({ projects, tasks, team, clients, campaigns, expenses });
    const series = monthlySeries({ invoices, expenses, team, now });
    const fc = forecast({ clients, invoices, expenses, team, now });
    const since = now - EXPENSE_WINDOW_DAYS * DAY;
    const months = EXPENSE_WINDOW_DAYS / 30;
    const overheadExpenses = expenses.filter((e) => !e.clientId && new Date(e.date).getTime() >= since).reduce((a, e) => a + e.amount, 0) / months;
    const benchCost = allocation.reduce((a, m) => a + m.benchCost, 0);
    const revenue = profit.reduce((a, p) => a + p.revenue, 0);
    const recurring = mrr(clients, now);
    const deliveryCost = profit.reduce((a, p) => a + p.cost, 0);
    const grossMargin = profit.reduce((a, p) => a + p.margin, 0);
    const open = invoices.filter((i) => i.status !== "Paid");
    const outstanding = open.reduce((a, i) => a + i.amount - i.paid, 0);
    const overdueList = invoices.filter((i) => i.status === "Overdue");
    const overdue = overdueList.reduce((a, i) => a + i.amount - i.paid, 0);
    const operatingProfit = grossMargin - benchCost - overheadExpenses;
    return {
      input,
      allocation,
      profit,
      projectProfit,
      series,
      forecast: fc,
      kpis: { revenue, mrr: recurring, deliveryCost, grossMargin, grossPct: revenue ? (grossMargin / revenue) * 100 : 0, outstanding, overdue, overdueCount: overdueList.length, benchCost, overheadExpenses, operatingProfit, operatingPct: revenue ? (operatingProfit / revenue) * 100 : 0 },
    };
  }, [team, clients, campaigns, tasks, expenses, invoices, projects, now]);
}

export type FinanceData = ReturnType<typeof useFinance>;
