"use client";

import { ChevronRight } from "lucide-react";
import { cn, compactMoney, pct } from "@/lib/utils";
import type { FinanceData } from "./useFinance";

// Revenue → Cost → Gross Margin → Outstanding → Profitability, as one visual flow (monthly run-rate).
export function FlowStrip({ k }: { k: FinanceData["kpis"] }) {
  const steps = [
    { label: "Revenue", value: compactMoney(k.revenue), hint: "monthly retainers", tone: "text-fg" },
    { label: "Delivery cost", value: compactMoney(k.deliveryCost), hint: "allocated team + direct expenses", tone: "text-fg" },
    { label: "Gross margin", value: compactMoney(k.grossMargin), hint: `${pct(k.grossPct, 0)} of revenue`, tone: k.grossPct >= 30 ? "text-success" : "text-warning" },
    { label: "Outstanding", value: compactMoney(k.outstanding), hint: `${compactMoney(k.overdue)} overdue · ${k.overdueCount} inv.`, tone: k.overdue > 0 ? "text-danger" : "text-fg" },
    {
      label: "Operating profit",
      value: compactMoney(k.operatingProfit),
      hint: `after ${compactMoney(k.benchCost)} bench + ${compactMoney(k.overheadExpenses)} overhead`,
      tone: k.operatingProfit >= 0 ? "text-success" : "text-danger",
    },
  ];
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:items-stretch lg:gap-0">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-stretch lg:flex-1">
          <div className={cn("flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-card", i === steps.length - 1 && "col-span-2 sm:col-span-1")}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-3">
              <span className="mr-1 tabular-nums text-fg-3/70">{i + 1}.</span>
              {s.label}
            </p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums tracking-tight", s.tone)}>{s.value}</p>
            <p className="mt-0.5 truncate text-[11px] text-fg-3" title={s.hint}>
              {s.hint}
            </p>
          </div>
          {i < steps.length - 1 && (
            <span className="hidden w-6 shrink-0 items-center justify-center text-fg-3 lg:flex" aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
