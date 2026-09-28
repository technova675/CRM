"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn, compactMoney, fmtDate, money, pct } from "@/lib/utils";
import { Card, CardHeader, InsightList, Table, Td, Th } from "@/components/ui";
import { Bars } from "@/components/charts";
import type { FinanceData } from "./useFinance";

// Next 3 months from client retainers and contract end dates.
export function ForecastPanel({ data }: { data: FinanceData }) {
  const { rows, collectionRate, avgExpenses, avgRebilled, payroll, expired } = data.forecast;
  const ending = rows.flatMap((r) => r.ending);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="3-month forecast" subtitle="Committed retainers (contracts active in the month) vs expected cash-in and outgoings" />
          <div className="px-2 pb-3">
            <Bars
              data={rows.map((r) => ({ month: r.month, committed: Math.round(r.committed), cash: Math.round(r.expectedCash), costs: Math.round(r.costs) }))}
              x="month"
              fmt={compactMoney}
              series={[
                { key: "committed", label: "Committed revenue", color: "var(--chart-1)" },
                { key: "cash", label: "Expected cash-in", color: "var(--chart-3)" },
                { key: "costs", label: "Outgoings", color: "var(--chart-4)" },
              ]}
            />
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-[13px] font-semibold">Forecast basis</p>
          <InsightList
            compact
            items={[
              { kind: "data", text: `Historic collection rate ${pct(collectionRate * 100, 0)} (invoices due in the last 6 months).`, source: "Invoices" },
              { kind: "data", text: `Payroll ${money(payroll)}/mo from Team member costs.`, source: "Team" },
              { kind: "data", text: `Average expenses ${money(avgExpenses)}/mo over 6 months, incl. ${money(avgRebilled)} rebilled to clients (added back to cash-in).`, source: "Expenses" },
              ...(expired.length ? [{ kind: "data" as const, text: `${expired.map((e) => e.company).join(", ")}: contract end date passed — excluded from committed revenue until renewed.`, source: "Client contracts" }] : []),
              { kind: "assumption", text: "No new clients or renewals; revenue stops at each contract end date; payroll flat." },
              { kind: "assumption", text: "At-risk revenue = retainers from clients flagged At Risk / Churn Risk." },
            ]}
          />
        </Card>
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="text-right">Committed</Th>
              <Th className="text-right">At risk</Th>
              <Th className="text-right">Expected cash-in</Th>
              <Th className="text-right">Outgoings</Th>
              <Th className="text-right">Net cash</Th>
              <Th>Contracts ending</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <Td className="font-medium">{r.month}</Td>
                <Td className="text-right tabular-nums">{money(r.committed)}</Td>
                <Td className={cn("text-right tabular-nums", r.atRisk ? "text-warning" : "text-fg-3")}>{money(r.atRisk)}</Td>
                <Td className="text-right tabular-nums">{money(r.expectedCash)}</Td>
                <Td className="text-right tabular-nums text-fg-2">{money(r.costs)}</Td>
                <Td className={cn("text-right font-medium tabular-nums", r.net < 0 ? "text-danger" : "text-success")}>{money(r.net)}</Td>
                <Td className="text-xs text-fg-2">{r.ending.length ? r.ending.map((e) => e.company).join(", ") : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Renewals due" subtitle="Contracts ending in the forecast window — start renewal conversations early" action={<CalendarClock className="size-4 text-accent" />} />
        {ending.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-fg-3">No contracts end in the next 3 months.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ending.map((e) => (
              <li key={e.clientId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <Link href={`/clients/${e.clientId}`} className="font-medium hover:underline">
                  {e.company}
                </Link>
                <span className="text-fg-2">
                  {money(e.retainer)}/mo · ends {fmtDate(e.contractEnd)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
