"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, FileBarChart, LayoutGrid, List, Megaphone, TrendingUp, Wallet } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { SERVICES, type Client, type Service } from "@/lib/types";
import { cn, compactMoney, daysBetween, fmtShort, relTime, sum } from "@/lib/utils";
import { clientHealth, type HealthResult } from "@/lib/ai/client-success";
import { useHealthData } from "@/components/clients/useClientHealth";
import { Avatar, Badge, Card, EmptyState, MemberAvatar, PageHeader, Progress, SearchInput, Segmented, Select, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";

interface Row {
  c: Client;
  onboarding: number;
  activeCampaigns: number;
  outstanding: number;
  overdue: boolean;
  health: HealthResult;
  renewalDays: number;
}

function HealthScore({ h }: { h: HealthResult }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Computed health · ${h.band}`}>
      <span className={cn("size-2 rounded-full", h.score >= 75 ? "bg-success" : h.score >= 55 ? "bg-warning" : "bg-danger")} />
      <span className="text-xs font-semibold tabular-nums">{h.score}</span>
    </span>
  );
}

function Renewal({ days, date }: { days: number; date: string }) {
  return <span className={cn("tabular-nums", days < 30 ? "text-danger font-medium" : days < 60 ? "text-warning" : "text-fg-2")}>{fmtShort(date)}{days >= 0 && days < 90 ? ` · ${days}d` : ""}</span>;
}

export default function ClientsPage() {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const invoices = useCRM((s) => s.invoices);
  const healthData = useHealthData();
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [health, setHealth] = useState("all");
  const [service, setService] = useState<Service | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (me.role === "client" && me.clientId) router.replace(`/clients/${me.clientId}`);
  }, [me, router]);

  const rows = useMemo<Row[]>(
    () =>
      clients
        .filter((c) => (health === "all" || c.health === health) && (service === "all" || c.services.includes(service)) && `${c.company} ${c.industry} ${c.location}`.toLowerCase().includes(q.toLowerCase()))
        .map((c) => {
          const inv = invoices.filter((i) => i.clientId === c.id && i.status !== "Paid");
          return {
            c,
            onboarding: c.onboarding.length ? (c.onboarding.filter((o) => o.done).length / c.onboarding.length) * 100 : 100,
            activeCampaigns: campaigns.filter((x) => x.clientId === c.id && x.status === "Active").length,
            outstanding: sum(inv.map((i) => i.amount - i.paid)),
            overdue: inv.some((i) => i.status === "Overdue"),
            health: clientHealth(c, healthData),
            renewalDays: daysBetween(c.contractEnd),
          };
        }),
    [clients, campaigns, invoices, q, health, service, healthData],
  );

  const stats = useMemo(
    () => ({
      mrr: sum(clients.map((c) => c.retainer)),
      onboarding: clients.filter((c) => c.onboarding.some((o) => !o.done)).length,
      atRisk: clients.filter((c) => c.health !== "Healthy").length,
      adSpend: sum(clients.map((c) => c.monthlyAdSpend ?? 0)),
      outstanding: sum(invoices.filter((i) => i.status !== "Paid").map((i) => i.amount - i.paid)),
    }),
    [clients, invoices],
  );

  if (me.role === "client") return null;

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Every won deal becomes a client profile with onboarding, campaigns, billing and reports."
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid className="size-3.5" /> },
              { value: "list", label: <List className="size-3.5" /> },
            ]}
          />
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Active clients" value={clients.length} icon={<Building2 className="size-3.5" />} />
        <Stat label="Monthly retainers" value={compactMoney(stats.mrr)} hint="MRR" icon={<Wallet className="size-3.5" />} tone="success" />
        <Stat label="Managed ad spend" value={compactMoney(stats.adSpend)} hint="per month" icon={<TrendingUp className="size-3.5" />} />
        <Stat label="Onboarding" value={stats.onboarding} hint="in progress" icon={<Megaphone className="size-3.5" />} />
        <Stat label="At risk" value={stats.atRisk} hint={`${compactMoney(stats.outstanding)} outstanding`} icon={<FileBarChart className="size-3.5" />} tone="warning" />
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search clients…" className="sm:w-64" />
        <Select value={health} onChange={(e) => setHealth(e.target.value)} className="sm:w-40">
          <option value="all">All health</option>
          <option>Healthy</option>
          <option>At Risk</option>
          <option>Churn Risk</option>
        </Select>
        <Select value={service} onChange={(e) => setService(e.target.value as Service | "all")} className="sm:w-48">
          <option value="all">All services</option>
          {SERVICES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-5" />} title="No clients match" description="Clients are created automatically when a deal is moved to Won." />
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ c, onboarding, activeCampaigns, outstanding, overdue, health: h, renewalDays }) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <Card className="h-full p-4 transition hover:border-border-strong hover:shadow-pop">
                <div className="flex items-start gap-3">
                  <Avatar name={c.company} size={36} className="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.company}</p>
                    <p className="truncate text-xs text-fg-3">
                      {c.industry} · {c.location}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={c.health} />
                    <HealthScore h={h} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.services.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                  {h.upsell.length > 0 && (
                    <Badge tone="success" className="ml-auto" dot>
                      Upsell
                    </Badge>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-fg-3">Retainer</p>
                    <p className="font-semibold tabular-nums">{compactMoney(c.retainer)}/mo</p>
                  </div>
                  <div>
                    <p className="text-fg-3">Campaigns</p>
                    <p className="font-semibold tabular-nums">{activeCampaigns} active</p>
                  </div>
                  <div>
                    <p className="text-fg-3">Outstanding</p>
                    <p className={cn("font-semibold tabular-nums", overdue ? "text-danger" : outstanding ? "text-warning" : "text-success")}>{outstanding ? compactMoney(outstanding) : "—"}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-fg-3">
                    <span>Onboarding</span>
                    <span className="tabular-nums">{Math.round(onboarding)}%</span>
                  </div>
                  <Progress value={onboarding} tone={onboarding === 100 ? "success" : "accent"} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px] text-fg-3">
                  <MemberAvatar id={c.accountManagerId} showName size={18} />
                  <span>Report {c.lastReportAt ? relTime(c.lastReportAt) : "never"}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-3">
                  <span>Ad spend {compactMoney(c.monthlyAdSpend ?? 0)}/mo</span>
                  <span>
                    Renews <Renewal days={renewalDays} date={c.contractEnd} />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Health</Th>
                <Th>Score</Th>
                <Th>Services</Th>
                <Th className="text-right">Retainer</Th>
                <Th className="text-right">Ad spend</Th>
                <Th>Renewal</Th>
                <Th>Upsell</Th>
                <Th>Account mgr</Th>
                <Th>Onboarding</Th>
                <Th className="text-right">Campaigns</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Last report</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, onboarding, activeCampaigns, outstanding, overdue, health: h, renewalDays }) => (
                <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/clients/${c.id}`)}>
                  <Td>
                    <p className="font-medium">{c.company}</p>
                    <p className="text-xs text-fg-3">{c.industry}</p>
                  </Td>
                  <Td>
                    <StatusBadge status={c.health} />
                  </Td>
                  <Td>
                    <HealthScore h={h} />
                  </Td>
                  <Td className="max-w-56 truncate text-xs text-fg-2">{c.services.join(", ")}</Td>
                  <Td className="text-right tabular-nums">{compactMoney(c.retainer)}</Td>
                  <Td className="text-right tabular-nums">{compactMoney(c.monthlyAdSpend ?? 0)}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    <Renewal days={renewalDays} date={c.contractEnd} />
                  </Td>
                  <Td>{h.upsell.length ? <Badge tone="success" dot>{h.upsell[0]!.title}</Badge> : <span className="text-xs text-fg-3">—</span>}</Td>
                  <Td>
                    <MemberAvatar id={c.accountManagerId} showName />
                  </Td>
                  <Td className="w-32">
                    <Progress value={onboarding} tone={onboarding === 100 ? "success" : "accent"} />
                  </Td>
                  <Td className="text-right tabular-nums">{activeCampaigns}</Td>
                  <Td className={cn("text-right tabular-nums", overdue ? "text-danger" : "")}>{outstanding ? compactMoney(outstanding) : "—"}</Td>
                  <Td className="text-fg-2">{fmtShort(c.lastReportAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
