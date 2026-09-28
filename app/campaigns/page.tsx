"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { SERVICES, type Campaign, type CampaignKPI, type CampaignStatus, type Service } from "@/lib/types";
import { cn, compact, compactMoney, fmtDate, fmtShort, isPast, money, pct } from "@/lib/utils";
import { AreaTrend, Sparkline, aggregateMetrics, totals } from "@/components/charts";
import { Badge, Button, Card, CardHeader, Drawer, EmptyState, Field, Input, MemberAvatar, Modal, PageHeader, Progress, Readonly, SearchInput, Segmented, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const STATUSES: CampaignStatus[] = ["Planning", "Active", "Paused", "Completed"];

function kpiRatio(k: CampaignKPI) {
  if (!k.target) return 0;
  // Lower is better for cost metrics.
  return k.label === "CPA" || k.label === "CPC" ? (k.actual ? (k.target / k.actual) * 100 : 0) : (k.actual / k.target) * 100;
}

function CampaignsInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const writable = can(me.role, "campaigns", "write") && me.role !== "client";
  const [service, setService] = useState<Service | "All">("All");
  const [status, setStatus] = useState<CampaignStatus | "All">("All");
  const [clientId, setClientId] = useState("All");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    return campaigns.filter((c) => {
      if (me.role === "client" && c.clientId !== me.clientId) return false;
      if (service !== "All" && c.service !== service) return false;
      if (status !== "All" && c.status !== status) return false;
      if (clientId !== "All" && c.clientId !== clientId) return false;
      if (q && !`${c.name} ${c.platform} ${c.objective}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [campaigns, me, service, status, clientId, q]);

  const summary = useMemo(() => {
    const rows = aggregateMetrics(visible.flatMap((c) => c.metrics.slice(-30)));
    return { t: totals(rows), active: visible.filter((c) => c.status === "Active").length, budget: visible.reduce((a, c) => a + c.budget, 0) };
  }, [visible]);

  const openId = params.get("c");
  const open = campaigns.find((c) => c.id === openId);
  const setOpen = (id?: string) => router.replace(id ? `/campaigns?c=${id}` : "/campaigns", { scroll: false });
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    campaigns.forEach((c) => {
      if (me.role === "client" && c.clientId !== me.clientId) return;
      m[c.service] = (m[c.service] ?? 0) + 1;
    });
    return m;
  }, [campaigns, me]);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Every client campaign across paid, organic, creator and automation services."
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><p className="text-xs text-fg-3">Active campaigns</p><p className="text-xl font-semibold tabular-nums mt-1">{summary.active}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Monthly budget</p><p className="text-xl font-semibold tabular-nums mt-1">{compactMoney(summary.budget)}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Spend (30d)</p><p className="text-xl font-semibold tabular-nums mt-1">{compactMoney(summary.t.spend)}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Leads (30d)</p><p className="text-xl font-semibold tabular-nums mt-1">{compact(summary.t.leads)}</p></Card>
        <Card className="p-3 col-span-2 lg:col-span-1"><p className="text-xs text-fg-3">Blended ROAS</p><p className="text-xl font-semibold tabular-nums mt-1">{summary.t.roas.toFixed(2)}x</p></Card>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
        {(["All", ...SERVICES] as const).map((s) => (
          <button key={s} onClick={() => setService(s)} className={cn("h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition", service === s ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-2 hover:bg-surface-2")}>
            {s}
            <span className="ml-1 text-fg-3 tabular-nums">{s === "All" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
          <SearchInput value={q} onChange={setQ} placeholder="Search campaigns…" className="w-full sm:w-64" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus | "All")} className="w-36">
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          {me.role !== "client" && (
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
              <option value="All">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          )}
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
                    <p className="font-medium">{c.service}</p>
                    <p className="text-xs text-fg-3">{clientName(c.clientId)}</p>
                  </Td>
                  <Td>
                    <p className="text-fg-2">{c.platform}</p>
                    <p className="text-xs text-fg-3">{c.objective}</p>
                  </Td>
                  <Td className="tabular-nums">{compactMoney(c.budget)}<span className="text-fg-3 text-xs">/mo</span></Td>
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
                          <span className="tabular-nums text-fg-2">{k.actual}{k.unit === "x" ? "x" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td>{c.metrics.length ? <Sparkline data={c.metrics.slice(-30).map((m) => m.spend)} /> : <span className="text-xs text-fg-3">No data</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const t = totals(aggregateMetrics(c.metrics.slice(-30)));
              return (
                <button key={c.id} onClick={() => setOpen(c.id)} className="text-left rounded-xl border border-border p-4 hover:border-border-strong hover:bg-surface-2/40 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[13px]">{c.service}</p>
                      <p className="text-xs text-fg-3">{clientName(c.clientId)} · {c.platform}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-3 h-10">{c.metrics.length > 0 && <Sparkline data={c.metrics.slice(-30).map((m) => m.leads)} height={40} />}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-fg-3">Spend</p><p className="font-medium tabular-nums">{compactMoney(t.spend)}</p></div>
                    <div><p className="text-fg-3">Leads</p><p className="font-medium tabular-nums">{t.leads}</p></div>
                    <div><p className="text-fg-3">ROAS</p><p className="font-medium tabular-nums">{t.roas.toFixed(1)}x</p></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {open && <CampaignDrawer campaign={open} onClose={() => setOpen()} writable={writable} />}
      {creating && <NewCampaignModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CampaignDrawer({ campaign, onClose, writable }: { campaign: Campaign; onClose: () => void; writable: boolean }) {
  const clients = useCRM((s) => s.clients);
  const team = useCRM((s) => s.team);
  const tasks = useCRM((s) => s.tasks);
  const influencers = useCRM((s) => s.influencers);
  const approvalMode = useCRM((s) => s.settings.approvalModes["Campaign changes"]);
  const updateCampaign = useCRM((s) => s.updateCampaign);
  const requestApproval = useCRM((s) => s.requestApproval);
  const [range, setRange] = useState<"7" | "30" | "60">("30");
  const [budget, setBudget] = useState(String(campaign.budget));
  const [kpis, setKpis] = useState<CampaignKPI[]>(campaign.kpis);

  const rows = useMemo(() => aggregateMetrics(campaign.metrics.slice(-Number(range))), [campaign.metrics, range]);
  const t = useMemo(() => totals(rows), [rows]);
  const client = clients.find((c) => c.id === campaign.clientId);
  const linkedTasks = useMemo(() => tasks.filter((x) => x.related?.type === "campaign" ? x.related.id === campaign.id : x.related?.id === campaign.clientId && x.title.toLowerCase().includes(campaign.service.toLowerCase().split(" ")[0]!)), [tasks, campaign]);
  const assigned = influencers.filter((i) => campaign.influencerIds.includes(i.id));

  const saveBudget = () => {
    const v = Number(budget);
    if (!v || v === campaign.budget) return;
    if (approvalMode === "Approval Required") {
      requestApproval({ kind: "Campaign changes", title: `Change budget to ${money(v)}`, detail: `${campaign.name} — currently ${money(campaign.budget)}/mo`, ref: { type: "campaign", id: campaign.id }, payload: { budget: v } });
      toast("Budget change sent for approval", "Campaign changes require approval in AI Safety settings.", "warning");
      setBudget(String(campaign.budget));
      return;
    }
    updateCampaign(campaign.id, { budget: v });
    toast("Budget updated");
  };

  const tiles = [
    ["Spend", compactMoney(t.spend)], ["Impressions", compact(t.impressions)], ["Clicks", compact(t.clicks)], ["CTR", pct(t.ctr, 2)],
    ["CPC", money(t.cpc)], ["Leads", compact(t.leads)], ["CPA", money(t.cpa)], ["ROAS", `${t.roas.toFixed(2)}x`],
  ];

  return (
    <Drawer open onClose={onClose} width={720} title={campaign.name} subtitle={<span className="flex items-center gap-2">{client && <Link href={`/clients/${client.id}`} className="hover:underline">{client.company}</Link>} · {campaign.platform} <StatusBadge status={campaign.status} /></span>}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Status">
            <Select disabled={!writable} value={campaign.status} onChange={(e) => updateCampaign(campaign.id, { status: e.target.value as CampaignStatus })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Objective">
            <Input disabled={!writable} value={campaign.objective} onChange={(e) => updateCampaign(campaign.id, { objective: e.target.value })} />
          </Field>
          <Field label="Platform">
            <Input disabled={!writable} value={campaign.platform} onChange={(e) => updateCampaign(campaign.id, { platform: e.target.value })} />
          </Field>
          <Field label="Monthly budget (₹)" hint={approvalMode === "Approval Required" ? "Changes need approval" : undefined}>
            <div className="flex gap-1.5">
              <Input disabled={!writable} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
              {writable && Number(budget) !== campaign.budget && <Button size="sm" variant="primary" onClick={saveBudget}>Save</Button>}
            </div>
          </Field>
          <Field label="Start">
            <Input disabled={!writable} type="date" value={campaign.startDate.slice(0, 10)} onChange={(e) => updateCampaign(campaign.id, { startDate: new Date(e.target.value).toISOString() })} />
          </Field>
          <Field label="End">
            <Input disabled={!writable} type="date" value={campaign.endDate.slice(0, 10)} onChange={(e) => updateCampaign(campaign.id, { endDate: new Date(e.target.value).toISOString() })} />
          </Field>
        </div>

        <div>
          <p className="text-xs font-medium text-fg-2 mb-1.5">Assigned team</p>
          <div className="flex flex-wrap gap-1.5">
            {team.filter((m) => m.role !== "client").map((m) => {
              const on = campaign.teamIds.includes(m.id);
              return (
                <button key={m.id} disabled={!writable} onClick={() => updateCampaign(campaign.id, { teamIds: on ? campaign.teamIds.filter((x) => x !== m.id) : [...campaign.teamIds, m.id] })} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3")}>
                  <MemberAvatar id={m.id} size={16} /> {m.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <Card>
          <CardHeader title="Performance" subtitle={campaign.metrics.length ? "From connected ad platforms" : "No performance data yet"} action={<Segmented value={range} onChange={setRange} options={[{ value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }]} />} />
          <div className="grid grid-cols-4 gap-px bg-border border-y border-border">
            {tiles.map(([l, v]) => (
              <div key={l} className="bg-surface p-2.5">
                <p className="text-[11px] text-fg-3">{l}</p>
                <p className="text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="p-3">
            {rows.length ? (
              <AreaTrend data={rows.map((r) => ({ ...r, date: fmtShort(r.date) }))} x="date" series={[{ key: "spend", label: "Spend" }, { key: "revenue", label: "Revenue" }]} fmt={(v) => compactMoney(v)} height={200} />
            ) : (
              <EmptyState title="No metrics yet" description="Connect the ad account in Settings → Integrations to pull performance." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="KPIs" subtitle="Target vs actual" action={writable && <Button size="xs" icon={<Plus className="size-3" />} onClick={() => setKpis([...kpis, { label: "New KPI", target: 0, actual: 0 }])}>Add</Button>} />
          <div className="px-4 pb-4 space-y-2">
            {kpis.length === 0 && <p className="text-xs text-fg-3">No KPIs defined.</p>}
            {kpis.map((k, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_60px_auto] gap-2 items-center">
                <Input disabled={!writable} value={k.label} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input disabled={!writable} type="number" value={k.target} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, target: Number(e.target.value) } : x)))} title="Target" />
                <Input disabled={!writable} type="number" value={k.actual} onChange={(e) => setKpis(kpis.map((x, j) => (j === i ? { ...x, actual: Number(e.target.value) } : x)))} title="Actual" />
                <span className={cn("text-xs tabular-nums text-right", kpiRatio(k) >= 100 ? "text-success" : "text-warning")}>{kpiRatio(k).toFixed(0)}%</span>
                {writable ? <button onClick={() => setKpis(kpis.filter((_, j) => j !== i))} className="text-fg-3 hover:text-danger" aria-label="Remove KPI"><Trash2 className="size-3.5" /></button> : <span />}
              </div>
            ))}
            {writable && JSON.stringify(kpis) !== JSON.stringify(campaign.kpis) && (
              <div className="flex justify-end"><Button size="sm" variant="primary" onClick={() => { updateCampaign(campaign.id, { kpis }); toast("KPIs saved"); }}>Save KPIs</Button></div>
            )}
          </div>
        </Card>

        {campaign.service === "Influencer Marketing" && (
          <Card>
            <CardHeader title="Assigned creators" action={<Link href="/influencers" className="text-xs text-accent-text hover:underline">Match creators →</Link>} />
            <div className="px-4 pb-4 space-y-1.5">
              {assigned.length === 0 && <p className="text-xs text-fg-3">No creators assigned yet.</p>}
              {assigned.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-[13px]">
                  <span>{i.name} <span className="text-fg-3 text-xs">{i.instagram}</span></span>
                  <span className="text-xs text-fg-3">{compact(i.followers)} · {i.engagement}% ER</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Tasks" action={<Link href="/tasks" className="text-xs text-accent-text hover:underline">All tasks →</Link>} />
          <div className="px-4 pb-4 space-y-1.5">
            {linkedTasks.length === 0 && <p className="text-xs text-fg-3">No linked tasks.</p>}
            {linkedTasks.slice(0, 8).map((x) => (
              <div key={x.id} className="flex items-center gap-2 text-[13px]">
                <StatusBadge status={x.status} />
                <span className="flex-1 truncate">{x.title}</span>
                <span className={cn("text-xs", x.status !== "Done" && isPast(x.dueDate) ? "text-danger" : "text-fg-3")}>{fmtDate(x.dueDate)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Drawer>
  );
}

function NewCampaignModal({ onClose }: { onClose: () => void }) {
  const clients = useCRM((s) => s.clients);
  const addCampaign = useCRM((s) => s.addCampaign);
  const [f, setF] = useState(() => ({ clientId: clients[0]?.id ?? "", service: "Meta Ads" as Service, platform: "Meta (FB + IG)", objective: "Lead generation", budget: 100000, start: new Date().toISOString().slice(0, 10), end: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10), status: "Planning" as CampaignStatus }));
  const submit = () => {
    const client = clients.find((c) => c.id === f.clientId);
    if (!client) return;
    addCampaign({ name: `${client.company} · ${f.service}`, clientId: f.clientId, service: f.service, platform: f.platform, objective: f.objective, budget: f.budget, startDate: new Date(f.start).toISOString(), endDate: new Date(f.end).toISOString(), teamIds: [], status: f.status });
    toast("Campaign created");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New campaign" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" className="col-span-2">
          <Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select>
        </Field>
        <Field label="Service"><Select value={f.service} onChange={(e) => setF({ ...f, service: e.target.value as Service })}>{SERVICES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Platform"><Input value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} /></Field>
        <Field label="Objective"><Input value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} /></Field>
        <Field label="Monthly budget (₹)"><Input type="number" value={f.budget} onChange={(e) => setF({ ...f, budget: Number(e.target.value) })} /></Field>
        <Field label="Start date"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="End date"><Input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CampaignStatus })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
      </div>
      <p className="mt-3 text-xs text-fg-3"><Badge tone="info">Tip</Badge> Performance data appears once the client&apos;s ad account is connected.</p>
    </Modal>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsInner />
    </Suspense>
  );
}
