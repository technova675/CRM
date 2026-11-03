"use client";

import Link from "next/link";
import {CampaignEditor} from "@/components/campaigns/CampaignEditor";
import {CampaignWorkspace} from "@/components/campaigns/CampaignWorkspace";
import {CAMPAIGN_CHANNELS,campaignMetricRows,campaignKPIRatio} from "@/lib/domain/campaign";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { CAMPAIGN_TYPES, type CampaignKPI, type CampaignStatus } from "@/lib/types";
import { cn, compactMoney, fmtShort } from "@/lib/utils";
import { Sparkline, aggregateMetrics, totals } from "@/components/charts";
import { Button, Card, EmptyState, MemberAvatar, PageHeader, Progress, Readonly, SearchInput, Segmented, Select, StatusBadge, Table, Td, Th } from "@/components/ui";

const STATUSES: CampaignStatus[] = ["Planning", "Active", "Paused", "Completed"];

const kpiRatio=(k:CampaignKPI)=>campaignKPIRatio(k)??0;

function CampaignsInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const writable = can(me.role, "campaigns", "write") && me.role !== "client";
  const [service, setService] = useState<string>("All");
  const [status, setStatus] = useState<CampaignStatus | "All">("All");
  const [clientId, setClientId] = useState("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [creating, setCreating] = useState(false);
  const [editing,setEditing]=useState(false);
  const [type,setType]=useState("All");

  const visible = useMemo(() => {
    return campaigns.filter((c) => {
      if (me.role === "client" && c.clientId !== me.clientId) return false;
      if (service !== "All" && !(c.channels??[c.service]).includes(service)) return false;
      if(type!=="All"&&c.campaignType!==type)return false;
      if (status !== "All" && c.status !== status) return false;
      if (clientId !== "All" && c.clientId !== clientId) return false;
      if (q && !`${c.name} ${c.platform} ${c.objective} ${c.goals??""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [campaigns, me, service, type, status, clientId, q]);

  const summary = useMemo(() => {
    const rows = aggregateMetrics(visible.flatMap((c) => campaignMetricRows(c)));
    return {t:totals(rows),hasData:rows.length>0,active:visible.filter(c=>c.status==="Active").length,budget:visible.filter(c=>c.budgetPeriod!=="Total").reduce((a,c)=>a+c.budget,0),totalBudget:visible.filter(c=>c.budgetPeriod==="Total").reduce((a,c)=>a+c.budget,0)};
  }, [visible]);

  const openId = params.get("c");
  const open = campaigns.find((c) => c.id === openId&&(me.role!=="client"||c.clientId===me.clientId));
  const setOpen = (id?: string) => router.replace(id ? `/campaigns?c=${id}` : "/campaigns", { scroll: false });
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    campaigns.forEach((c) => {
      if (me.role === "client" && c.clientId !== me.clientId) return;
      (c.channels??[c.service]).forEach(ch=>{m[ch]=(m[ch]??0)+1;});
    });
    return m;
  }, [campaigns, me]);

  if(!can(me.role,"campaigns","read"))return <Readonly>You do not have access to Campaign Management.</Readonly>;

  return (
    <div>
      <PageHeader
        title="Campaign Management"
        description="Plan campaign goals, channels, budget, assets, team and measurement."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "cards", label: "Cards" }]} />
            {writable && (
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
                New campaign
              </Button>
            )}
          </>
        }
      />
      {me.role === "client" && <Readonly>You&apos;re viewing your own campaigns in read-only mode.</Readonly>}

      <dl className="mb-4 grid grid-cols-2 gap-4 border-y border-border py-4 lg:grid-cols-5">
        {[["Active campaigns",summary.active],["Monthly budgets",compactMoney(summary.budget)],["Total-period budgets",compactMoney(summary.totalBudget)],["Spend in last 30 days",summary.hasData?compactMoney(summary.t.spend):"No recorded data"],["Leads in last 30 days",summary.hasData?summary.t.leads:"No recorded data"]].map(([label,value])=><div key={label}><dt className="text-xs text-fg-3">{label}</dt><dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
        {(["All", ...CAMPAIGN_CHANNELS] as const).map((s) => (
          <button key={s} onClick={() => setService(s)} className={cn("min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium transition", service === s ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-2 hover:bg-surface-2")}>
            {s}
            <span className="ml-1 text-fg-3 tabular-nums">{s === "All" ? campaigns.filter(c=>me.role!=="client"||c.clientId===me.clientId).length : counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
          <SearchInput value={q} onChange={setQ} placeholder="Search campaigns…" className="w-full sm:w-64" />
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus | "All")} className="w-36">
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          {me.role !== "client" && (
            <Select aria-label="Filter by client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
              <option value="All">All clients</option>
              {clients.filter(c=>me.role!=="client"||c.id===me.clientId).map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )}
          <Select aria-label="Filter by campaign type" value={type} onChange={e=>setType(e.target.value)} className="w-full sm:w-44"><option value="All">All campaign types</option>{CAMPAIGN_TYPES.map(t=><option key={t}>{t}</option>)}</Select>
          <span className="ml-auto self-center text-xs text-fg-3">{visible.length} campaigns</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-5" />} title="No campaigns match these filters" />
        ) : view === "table" ? (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Platform / objective</Th>
                <Th>Budget</Th>
                <Th>Dates</Th>
                <Th>Team</Th>
                <Th>Status</Th>
                <Th>KPIs</Th>
                <Th className="w-28">Spend 30d</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer hover:bg-surface-2/60">
                  <Td>
                    <Link className="font-medium text-accent-text hover:underline" href={`/campaigns?c=${c.id}`}>{c.name}</Link>
                    <p className="text-xs text-fg-3">{clientName(c.clientId)}</p>
                  </Td>
                  <Td>
                    <p className="text-fg-2">{c.platform}</p>
                    <p className="text-xs text-fg-3">{c.objective}</p>
                  </Td>
                  <Td className="tabular-nums">{compactMoney(c.budget)}<span className="text-fg-3 text-xs">{c.budgetPeriod==="Total"?" total":"/mo"}</span></Td>
                  <Td className="text-xs text-fg-2 whitespace-nowrap">{fmtShort(c.startDate)} → {fmtShort(c.endDate)}</Td>
                  <Td>
                    <div className="flex -space-x-1.5">{c.teamIds.map((id) => <MemberAvatar key={id} id={id} size={22} />)}</div>
                  </Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>
                    <div className="space-y-1 min-w-32">
                      {c.kpis.slice(0, 2).map((k) => (
                        <div key={k.label} className="flex items-center gap-2 text-[11px]">
                          <span className="w-9 text-fg-3">{k.label}</span>
                          <Progress value={kpiRatio(k)} tone={kpiRatio(k) >= 100 ? "success" : kpiRatio(k) >= 75 ? "accent" : "warning"} className="w-16" />
                          <span className="tabular-nums text-fg-2">{k.measurementRecorded===false?"Not measured":`${k.actual}${k.unit??""}`}</span>
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td>{c.metrics.length ? <Sparkline data={campaignMetricRows(c).map((m) => m.spend)} /> : <span className="text-xs text-fg-3">No data</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const t = totals(aggregateMetrics(campaignMetricRows(c)));
              return (
                <button key={c.id} onClick={() => setOpen(c.id)} className="text-left rounded-xl border border-border p-4 hover:border-border-strong hover:bg-surface-2/40 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[13px]">{c.name}</p>
                      <p className="text-xs text-fg-3">{clientName(c.clientId)} · {c.platform}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-3 h-10">{campaignMetricRows(c).length > 0 && <Sparkline data={campaignMetricRows(c).map((m) => m.leads)} height={40} />}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-fg-3">Spend</p><p className="font-medium tabular-nums">{campaignMetricRows(c).length?compactMoney(t.spend):"No data"}</p></div>
                    <div><p className="text-fg-3">Leads</p><p className="font-medium tabular-nums">{campaignMetricRows(c).length?t.leads:"No data"}</p></div>
                    <div><p className="text-fg-3">ROAS</p><p className="font-medium tabular-nums">{campaignMetricRows(c).length&&t.spend?`${t.roas.toFixed(1)}x`:"No data"}</p></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {open&&!editing&&<CampaignWorkspace key={open.id} campaign={open} onClose={()=>setOpen()} writable={writable} onEdit={()=>setEditing(true)}/>}
      {writable&&(creating||params.get("new")==="1"||editing&&open)&&<CampaignEditor key={editing?open!.id:"new"} campaign={editing?open:undefined} initialClientId={params.get("client")??undefined} onClose={()=>{setCreating(false);setEditing(false);if(params.get("new")==="1")setOpen();}} onSaved={id=>{setCreating(false);setEditing(false);setOpen(id);}}/>}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsInner />
    </Suspense>
  );
}




