"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useCRM } from "@/lib/store";
import { EFFORT, EXPENSE_WINDOW_DAYS, LOW_MARGIN_PCT, TASK_HOURS } from "@/lib/ai/finance";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn, compactMoney, money, pct } from "@/lib/utils";
import { Badge, Card, CardHeader, MemberAvatar, Progress, StatusBadge, Table, Td, Th } from "@/components/ui";
import { Bars } from "@/components/charts";
import type { FinanceData } from "./useFinance";

const marginTone = (p: number) => (p < LOW_MARGIN_PCT ? "danger" : p < 40 ? "warning" : "success");

export function ProfitabilityPanel({ data }: { data: FinanceData }) {
  const team = useCRM((s) => s.team);
  const clients = useCRM((s) => s.clients);
  const [open, setOpen] = useState<string | null>(null);
  const { profit, allocation, projectProfit } = data;
  const low = profit.filter((p) => p.low);
  const memberName = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? id;
  const totals = useMemo(() => {
    const t = profit.reduce((a, p) => ({ revenue: a.revenue + p.revenue, team: a.team + p.teamCost, direct: a.direct + p.directExpenses, billable: a.billable + p.billableExpenses, margin: a.margin + p.margin }), { revenue: 0, team: 0, direct: 0, billable: 0, margin: 0 });
    return { ...t, pct: t.revenue ? (t.margin / t.revenue) * 100 : 0 };
  }, [profit]);

  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {low.length} client{low.length > 1 ? "s are" : " is"} below the {LOW_MARGIN_PCT}% margin floor: <b>{low.map((p) => `${p.company} (${pct(p.marginPct, 0)})`).join(", ")}</b>. Review scope vs retainer before renewal.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader title="Client profitability" subtitle="Monthly run-rate: retainer − allocated team cost − direct expenses = gross margin. Click a row for the cost breakdown." />
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Team cost</Th>
                <Th className="text-right">Direct exp.</Th>
                <Th className="text-right">Gross margin</Th>
                <Th className="w-40">Margin %</Th>
              </tr>
            </thead>
            <tbody>
              {profit.map((p) => (
                <Fragment key={p.clientId}>
                  <tr className={cn("cursor-pointer hover:bg-surface-2", p.low && "bg-danger-soft/40")} onClick={() => setOpen(open === p.clientId ? null : p.clientId)}>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {open === p.clientId ? <ChevronDown className="size-3.5 text-fg-3" /> : <ChevronRight className="size-3.5 text-fg-3" />}
                        <Link href={`/clients/${p.clientId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                          {p.company}
                        </Link>
                        {p.health !== "Healthy" && <StatusBadge status={p.health} />}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{money(p.revenue)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">{money(p.teamCost)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">
                      {money(p.directExpenses)}
                      {p.billableExpenses > 0 && <span className="block text-[11px] text-fg-3">+{compactMoney(p.billableExpenses)} billable</span>}
                    </Td>
                    <Td className={cn("text-right font-medium tabular-nums", p.margin < 0 && "text-danger")}>{money(p.margin)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.max(0, p.marginPct)} tone={marginTone(p.marginPct)} className="flex-1" />
                        <span className={cn("w-10 text-right text-xs font-semibold tabular-nums", p.low ? "text-danger" : "text-fg")}>{pct(p.marginPct, 0)}</span>
                      </div>
                    </Td>
                  </tr>
                  {open === p.clientId && (
                    <tr>
                      <Td colSpan={6} className="bg-surface-2/60">
                        <p className="mb-2 text-xs font-medium text-fg-2">Team cost allocation · {p.company}</p>
                        {p.allocations.length === 0 ? (
                          <p className="text-xs text-fg-3">No team members linked.</p>
                        ) : (
                          <ul className="grid gap-1.5 sm:grid-cols-2">
                            {p.allocations.map((a) => {
                              const m = memberName.get(a.memberId);
                              return (
                                <li key={a.memberId} className="flex items-center gap-2 text-xs">
                                  <MemberAvatar id={a.memberId} size={18} />
                                  <span className="min-w-0 flex-1 truncate">
                                    {m?.name} <span className="text-fg-3">· {m ? ROLE_LABEL[m.role] : ""}</span>
                                  </span>
                                  <span className="tabular-nums text-fg-3">{a.hours.toFixed(1)} h/wk</span>
                                  <span className="w-20 text-right tabular-nums">{money(a.cost)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="font-medium">
                <Td>Total</Td>
                <Td className="text-right tabular-nums">{money(totals.revenue)}</Td>
                <Td className="text-right tabular-nums">{money(totals.team)}</Td>
                <Td className="text-right tabular-nums">{money(totals.direct)}</Td>
                <Td className="text-right tabular-nums">{money(totals.margin)}</Td>
                <Td className="text-right tabular-nums">{pct(totals.pct, 0)}</Td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Margin by client" subtitle={`Floor: ${LOW_MARGIN_PCT}%`} />
            <div className="px-2 pb-3">
              <Bars horizontal height={Math.max(180, profit.length * 30)} data={[...profit].reverse().map((p) => ({ client: p.company, margin: Math.round(p.marginPct) }))} x="client" fmt={(v) => `${v}%`} series={[{ key: "margin", label: "Margin %" }]} />
            </div>
          </Card>
          <Card className="p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
              <Info className="size-4 text-info" /> How team cost is allocated
            </p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-fg-2">
              <li>Each member&apos;s monthly cost (Team) is split across clients by estimated weekly hours:</li>
              <li>
                Account manager of the client: <b>{EFFORT.ACCOUNT_MANAGER_HRS} h</b>; campaign team member: <b>{EFFORT.CAMPAIGN_BASE_HRS} h + {EFFORT.CAMPAIGN_HRS_PER_100K} h per ₹1L budget</b> (paused ×{EFFORT.PAUSED_FACTOR}); specialist on a service the client buys: <b>{EFFORT.SPECIALIST_HRS} h</b>.
              </li>
              <li>
                Open tasks for the client add Urgent {TASK_HOURS.Urgent} h · High {TASK_HOURS.High} h · Medium {TASK_HOURS.Medium} h · Low {TASK_HOURS.Low} h.
              </li>
              <li>If hours exceed capacity, 100% of cost is allocated pro rata; unused capacity is bench (overhead, not charged to clients).</li>
              <li>Direct expenses = non-billable client expenses, last {EXPENSE_WINDOW_DAYS} days ÷ 3. Billable expenses are pass-through.</li>
            </ul>
            <p className="mt-2 text-[11px] text-fg-3">All hours are estimates from assignments, not timesheets — connect time tracking for actuals.</p>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Team cost allocation" subtitle="Monthly cost split between client work and bench / overhead" />
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th className="text-right">Monthly cost</Th>
              <Th className="text-right">Est. client hours / wk</Th>
              <Th className="w-40">Utilisation</Th>
              <Th className="text-right">Allocated</Th>
              <Th className="text-right">Bench / overhead</Th>
              <Th>Clients</Th>
            </tr>
          </thead>
          <tbody>
            {[...allocation]
              .filter((a) => a.monthlyCost > 0)
              .sort((a, b) => b.monthlyCost - a.monthlyCost)
              .map((a) => {
                const m = memberName.get(a.memberId);
                return (
                  <tr key={a.memberId}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <MemberAvatar id={a.memberId} size={20} />
                        <span>
                          {m?.name}
                          <span className="block text-[11px] text-fg-3">
                            {m ? ROLE_LABEL[m.role] : ""}
                            {m?.freelancer ? " · freelancer" : ""}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{money(a.monthlyCost)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">
                      {a.demandHours.toFixed(1)} / {a.capacity}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress value={a.utilisation} tone={a.utilisation > 100 ? "danger" : a.utilisation < 50 ? "warning" : "success"} className="flex-1" />
                        <span className="w-10 text-right text-xs tabular-nums">{pct(a.utilisation, 0)}</span>
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{money(a.allocatedCost)}</Td>
                    <Td className={cn("text-right tabular-nums", a.benchCost > 0 ? "text-warning" : "text-fg-3")}>{money(a.benchCost)}</Td>
                    <Td className="text-xs text-fg-2">{Object.keys(a.byClient).length || "—"}</Td>
                  </tr>
                );
              })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Project profitability" subtitle="Revenue and team cost = client retainer / allocated team cost × project months ÷ client's projects · expenses dated inside the project window" />
        {projectProfit.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-fg-3">No projects yet — create them in Tasks & Projects.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th className="text-right">Months</Th>
                <Th className="text-right">Revenue share</Th>
                <Th className="text-right">Task hours</Th>
                <Th className="text-right">Team cost</Th>
                <Th className="text-right">Expenses</Th>
                <Th className="text-right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {[...projectProfit]
                .sort((a, b) => a.marginPct - b.marginPct)
                .map((p) => (
                  <tr key={p.projectId} className={cn(p.low && "bg-danger-soft/40")}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td>
                      <Link href={`/clients/${p.clientId}`} className="hover:underline">
                        {clientName(p.clientId)}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td className="text-right tabular-nums text-fg-2">{p.months.toFixed(1)}</Td>
                    <Td className="text-right tabular-nums">{money(p.revenue)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">{p.taskHours}</Td>
                    <Td className="text-right tabular-nums text-fg-2">{money(p.teamCost)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">{money(p.directExpenses)}</Td>
                    <Td className="text-right">
                      <Badge tone={marginTone(p.marginPct)}>{pct(p.marginPct, 0)}</Badge>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
