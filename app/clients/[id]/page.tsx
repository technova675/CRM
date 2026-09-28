"use client";

import Link from "next/link";
import { use, useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, ExternalLink, FileText, Globe, Mail, MapPin, Phone } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { SERVICES, type Client, type Service } from "@/lib/types";
import { cn, compactMoney, fmtDate, fmtDateTime, fmtShort, money, pct, relTime, sum } from "@/lib/utils";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, MemberAvatar, PageHeader, Progress, Select, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { aggregateMetrics, AreaTrend, totals } from "@/components/charts";
import { toast } from "@/components/shell/toast";
import { Client360 } from "@/components/clients/Client360";
import { ClientInsights } from "@/components/clients/ClientInsights";
import { KnowledgeEditor } from "@/components/clients/KnowledgeEditor";
import { CreativeTab, InfluencersTab, SeoTab, SocialTab, StrategyTab } from "@/components/clients/ModuleTabs";
import { useClientHealth } from "@/components/clients/useClientHealth";
import { AssetLibrary } from "@/components/documents/AssetLibrary";

type Tab = "overview" | "insights" | "onboarding" | "campaigns" | "creative" | "social" | "seo" | "influencers" | "strategy" | "tasks" | "communication" | "documents" | "reports" | "billing" | "meetings" | "knowledge";

const FLOW = ["Deal Won", "Send onboarding form", "Collect business info", "Website & social links", "Ad account access", "Brand assets", "Tracking requirements", "Internal tasks", "Assign team", "Create campaign", "Begin execution"];

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-fg-3">{label}</p>
      <div className="text-[13px] font-medium">{children}</div>
    </div>
  );
}

function Overview({ client, internal }: { client: Client; internal: boolean }) {
  const update = useCRM((s) => s.updateClient);
  const team = useCRM((s) => s.team);
  const deals = useCRM((s) => s.deals);
  const fromDeal = deals.find((d) => d.id === client.fromDealId);
  const toggleService = (s: Service) => update(client.id, { services: client.services.includes(s) ? client.services.filter((x) => x !== s) : [...client.services, s] });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Company information" />
        <div className="grid grid-cols-2 gap-4 px-4 pb-4 sm:grid-cols-3">
          <Info label="Industry">{client.industry}</Info>
          <Info label="Location">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 text-fg-3" />
              {client.location}
            </span>
          </Info>
          <Info label="Website">
            {client.website ? (
              <a href={client.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <Globe className="size-3" />
                {client.website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              "—"
            )}
          </Info>
          <Info label="Contract start">{fmtDate(client.contractStart)}</Info>
          <Info label="Contract end">{fmtDate(client.contractEnd)}</Info>
          <Info label="Client since">{fmtDate(client.createdAt)}</Info>
          <Info label="Monthly retainer">{money(client.retainer)}</Info>
          <Info label="Annual value">{compactMoney(client.retainer * 12)}</Info>
          {fromDeal && (
            <Info label="Source deal">
              <Link href={`/pipeline?deal=${fromDeal.id}`} className="text-accent-text hover:underline">
                {fromDeal.title}
              </Link>
            </Info>
          )}
        </div>
        <div className="border-t border-border px-4 py-4">
          <p className="mb-2 text-xs font-medium text-fg-2">Services</p>
          <div className="flex flex-wrap gap-1.5">
            {(internal ? SERVICES : client.services).map((s) => {
              const on = client.services.includes(s);
              return internal ? (
                <button key={s} onClick={() => toggleService(s)} className={cn("rounded-md border px-2 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3 hover:bg-surface-2")}>
                  {s}
                </button>
              ) : (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              );
            })}
          </div>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Contacts" />
          <div className="divide-y divide-border">
            {client.contacts.map((c) => (
              <div key={c.email} className="flex items-start gap-3 px-4 py-3">
                <Avatar name={c.name} size={30} />
                <div className="min-w-0 text-[13px]">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-fg-3">{c.role}</p>
                  <a href={`mailto:${c.email}`} className="mt-1 flex items-center gap-1 text-xs text-fg-2 hover:text-fg">
                    <Mail className="size-3" /> {c.email}
                  </a>
                  {c.phone && (
                    <p className="flex items-center gap-1 text-xs text-fg-2">
                      <Phone className="size-3" /> {c.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {client.contacts.length === 0 && <p className="px-4 py-3 text-xs text-fg-3">No contacts yet.</p>}
          </div>
        </Card>
        {internal && (
          <Card className="p-4 space-y-3">
            <Field label="Account health">
              <Select value={client.health} onChange={(e) => update(client.id, { health: e.target.value as Client["health"] })}>
                <option>Healthy</option>
                <option>At Risk</option>
                <option>Churn Risk</option>
              </Select>
            </Field>
            <Field label="Account manager">
              <Select value={client.accountManagerId} onChange={(e) => update(client.id, { accountManagerId: e.target.value })}>
                {team
                  .filter((t) => t.role !== "client")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Monthly retainer (₹)">
              <Input type="number" value={client.retainer} onChange={(e) => update(client.id, { retainer: Number(e.target.value) })} />
            </Field>
          </Card>
        )}
      </div>
    </div>
  );
}

function Onboarding({ client, internal }: { client: Client; internal: boolean }) {
  const toggle = useCRM((s) => s.toggleOnboardingStep);
  const templates = useCRM((s) => s.settings.onboardingTemplates);
  const done = client.onboarding.filter((o) => o.done).length;
  const progress = client.onboarding.length ? (done / client.onboarding.length) * 100 : 100;
  const sourceOf = (label: string) => templates.find((t) => t.service !== "Default" && t.steps.includes(label))?.service;
  const flowIdx = Math.round((progress / 100) * (FLOW.length - 1));
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-semibold">Onboarding automation</p>
          <span className="text-xs text-fg-3 tabular-nums">{pct(progress, 0)} complete</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {FLOW.map((s, i) => (
            <div key={s} className="flex shrink-0 items-center gap-1">
              <span className={cn("rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap", i <= flowIdx ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-3")}>
                {i <= flowIdx && <Check className="mr-0.5 inline size-3" />}
                {s}
              </span>
              {i < FLOW.length - 1 && <ChevronRight className="size-3 text-fg-3" />}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex-1">
            <p className="text-[13px] font-semibold">Checklist</p>
            <p className="text-xs text-fg-3">
              {done} of {client.onboarding.length} steps · default template + service-specific steps (Settings → Onboarding)
            </p>
          </div>
        </div>
        <div className="px-4 pb-2">
          <Progress value={progress} tone={progress === 100 ? "success" : "accent"} />
        </div>
        <ul className="divide-y divide-border">
          {client.onboarding.map((o) => {
            const svc = sourceOf(o.label);
            return (
              <li key={o.key}>
                <button disabled={!internal} onClick={() => toggle(client.id, o.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 disabled:hover:bg-transparent">
                  {o.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-fg-3" />}
                  <span className={cn("flex-1 text-[13px]", o.done && "text-fg-3 line-through")}>{o.label}</span>
                  {svc && <Badge tone="accent">{svc}</Badge>}
                  {o.doneAt && <span className="hidden text-[11px] text-fg-3 sm:inline">{fmtShort(o.doneAt)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function Campaigns({ client }: { client: Client }) {
  const all = useCRM((s) => s.campaigns);
  const campaigns = useMemo(() => all.filter((c) => c.clientId === client.id), [all, client.id]);
  const agg = useMemo(() => aggregateMetrics(campaigns.flatMap((c) => c.metrics.slice(-30))), [campaigns]);
  const t = totals(agg);
  if (!campaigns.length) return <Card><EmptyState title="No campaigns yet" description="Campaigns are created at the end of onboarding." /></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Spend (30d)", compactMoney(t.spend)],
          ["Leads", t.leads.toLocaleString("en-IN")],
          ["CTR", pct(t.ctr, 2)],
          ["CPA", money(t.cpa)],
          ["ROAS", `${t.roas.toFixed(2)}x`],
        ].map(([l, v]) => (
          <Card key={l} className="p-3">
            <p className="text-xs text-fg-3">{l}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Spend vs revenue — last 30 days" />
        <div className="px-2 pb-3">
          <AreaTrend data={agg.map((r) => ({ ...r, date: r.date.slice(5) }))} x="date" series={[{ key: "revenue", label: "Revenue" }, { key: "spend", label: "Spend" }]} fmt={compactMoney} />
        </div>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th>Platform</Th>
              <Th>Objective</Th>
              <Th>Status</Th>
              <Th className="text-right">Budget</Th>
              <Th>KPIs</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2">
                <Td>
                  <Link href={`/campaigns?c=${c.id}`} className="font-medium hover:underline">
                    {c.service}
                  </Link>
                </Td>
                <Td className="text-fg-2">{c.platform}</Td>
                <Td className="text-fg-2">{c.objective}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td className="text-right tabular-nums">{compactMoney(c.budget)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {c.kpis.map((k) => {
                      const good = k.label === "CPA" ? k.actual <= k.target : k.actual >= k.target;
                      return (
                        <Badge key={k.label} tone={good ? "success" : "warning"}>
                          {k.label} {k.unit === "₹" ? `₹${k.actual}` : `${k.actual}${k.unit ?? ""}`}
                        </Badge>
                      );
                    })}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Tasks({ client, internal }: { client: Client; internal: boolean }) {
  const all = useCRM((s) => s.tasks);
  const updateTask = useCRM((s) => s.updateTask);
  const campaigns = useCRM((s) => s.campaigns);
  const tasks = useMemo(() => {
    const campIds = new Set(campaigns.filter((c) => c.clientId === client.id).map((c) => c.id));
    return all.filter((t) => (t.related?.type === "client" && t.related.id === client.id) || (t.related?.type === "campaign" && campIds.has(t.related.id))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [all, campaigns, client.id]);
  if (!tasks.length) return <Card><EmptyState title="No tasks" /></Card>;
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Task</Th>
            <Th>Assignee</Th>
            <Th>Priority</Th>
            <Th>Due</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = t.status !== "Done" && new Date(t.dueDate) < new Date();
            return (
              <tr key={t.id}>
                <Td className={cn(t.status === "Done" && "text-fg-3 line-through")}>{t.title}</Td>
                <Td>
                  <MemberAvatar id={t.assigneeId} showName />
                </Td>
                <Td>
                  <StatusBadge status={t.priority} />
                </Td>
                <Td className={cn(overdue ? "text-danger font-medium" : "text-fg-2")}>{fmtShort(t.dueDate)}</Td>
                <Td>
                  {internal ? (
                    <Select className="h-7 w-32 text-xs" value={t.status} onChange={(e) => updateTask(t.id, { status: e.target.value as typeof t.status })}>
                      {(["Todo", "In Progress", "Blocked", "Done"] as const).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  ) : (
                    <StatusBadge status={t.status} />
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

function Communication({ client }: { client: Client }) {
  const conversations = useCRM((s) => s.conversations);
  const messages = useCRM((s) => s.messages);
  const convs = useMemo(() => conversations.filter((c) => c.clientId === client.id), [conversations, client.id]);
  if (!convs.length) return <Card><EmptyState title="No conversations yet" /></Card>;
  return (
    <div className="space-y-3">
      {convs.map((c) => (
        <Card key={c.id}>
          <CardHeader
            title={c.subject ?? `${c.channel} conversation`}
            subtitle={`${c.channel} · last message ${relTime(c.lastMessageAt)}`}
            action={
              <Button href={`/inbox?c=${c.id}`} size="xs" icon={<ExternalLink className="size-3" />}>
                Open in inbox
              </Button>
            }
          />
          <div className="space-y-2 px-4 pb-4">
            {messages
              .filter((m) => m.conversationId === c.id)
              .map((m) => (
                <div key={m.id} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-[13px]", m.direction === "outbound" ? "ml-auto bg-accent-soft" : "bg-surface-2")}>
                  <p>{m.body}</p>
                  <p className="mt-1 text-[11px] text-fg-3">{fmtDateTime(m.sentAt)}</p>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function Documents({ client }: { client: Client }) {
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
        Client asset library — logos, guidelines, creatives, contracts and reports with versions and tags.
        <Link href={`/documents?client=${client.id}`} className="text-accent-text hover:underline">
          Open full library →
        </Link>
      </p>
      <AssetLibrary fixedClientId={client.id} />
    </div>
  );
}

function Reports({ client, internal }: { client: Client; internal: boolean }) {
  const all = useCRM((s) => s.reports);
  const schedules = useCRM((s) => s.reportSchedules);
  const generate = useCRM((s) => s.generateReport);
  const reports = useMemo(() => all.filter((r) => r.clientId === client.id), [all, client.id]);
  const schedule = schedules.find((s) => s.clientId === client.id);
  const period = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-fg-3">Last report</p>
          <p className="text-lg font-semibold">{client.lastReportAt ? fmtDate(client.lastReportAt) : "Never"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-fg-3">Schedule</p>
          <p className="text-lg font-semibold">{schedule ? `${schedule.frequency} · ${schedule.format}` : "Not scheduled"}</p>
          {schedule && <p className="text-xs text-fg-3">Next {fmtShort(schedule.nextRunAt)}</p>}
        </Card>
        <Card className="flex flex-col justify-between gap-2 p-4">
          <p className="text-xs text-fg-3">Generate now</p>
          <div className="flex flex-wrap gap-1.5">
            {internal &&
              (["PDF", "Excel", "Presentation", "Dashboard"] as const).map((f) => (
                <Button
                  key={f}
                  size="xs"
                  onClick={() => {
                    generate(client.id, f, period);
                    toast(`${f} report generated`, period);
                  }}
                >
                  {f}
                </Button>
              ))}
            <Button href="/reports" size="xs" variant="ghost">
                Open reports →
              </Button>
          </div>
        </Card>
      </div>
      <Card>
        {reports.length === 0 ? (
          <EmptyState title="No reports generated in this workspace yet" />
        ) : (
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <FileText className="size-4 text-fg-3" />
                <span className="flex-1">
                  {r.period} · {r.format}
                </span>
                <Badge tone={r.sent ? "success" : "warning"}>{r.sent ? "Sent" : "Awaiting approval"}</Badge>
                <span className="text-xs text-fg-3">{relTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Billing({ client }: { client: Client }) {
  const all = useCRM((s) => s.invoices);
  const invoices = useMemo(() => all.filter((i) => i.clientId === client.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [all, client.id]);
  const outstanding = sum(invoices.map((i) => i.amount - i.paid));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-fg-3">Total invoiced</p>
          <p className="text-lg font-semibold tabular-nums">{compactMoney(sum(invoices.map((i) => i.amount)))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-fg-3">Paid</p>
          <p className="text-lg font-semibold tabular-nums text-success">{compactMoney(sum(invoices.map((i) => i.paid)))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-fg-3">Outstanding</p>
          <p className={cn("text-lg font-semibold tabular-nums", outstanding > 0 && "text-warning")}>{compactMoney(outstanding)}</p>
        </Card>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Pending</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <Td>
                  <p className="font-medium">{i.number}</p>
                  <p className="text-xs text-fg-3">{i.description}</p>
                </Td>
                <Td className="text-fg-2">{fmtShort(i.issuedAt)}</Td>
                <Td className="text-fg-2">{fmtShort(i.dueDate)}</Td>
                <Td className="text-right tabular-nums">{money(i.amount)}</Td>
                <Td className="text-right tabular-nums">{money(i.amount - i.paid)}</Td>
                <Td>
                  <StatusBadge status={i.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Meetings({ client }: { client: Client }) {
  const all = useCRM((s) => s.meetings);
  const meetings = useMemo(() => all.filter((m) => m.clientId === client.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt)), [all, client.id]);
  if (!meetings.length) return <Card><EmptyState title="No meetings" /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {meetings.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
            <div className="flex-1">
              <p className="font-medium">{m.title}</p>
              <p className="text-xs text-fg-3">
                {fmtDateTime(m.startsAt)} · {m.durationMin} min
              </p>
              {m.notes && <p className="mt-1 text-xs text-fg-2">{m.notes}</p>}
            </div>
            <StatusBadge status={m.outcome} />
            {m.link && new Date(m.startsAt) > new Date() && (
              <Button href={m.link} external size="xs">Join</Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const client = useCRM((s) => s.clients.find((c) => c.id === id));
  const me = useMe();
  const [tab, setTab] = useState<Tab>("overview");
  const isClient = me.role === "client";
  const internal = !isClient && can(me.role, "clients", "write");
  const health = useClientHealth(client);

  if (!client || (isClient && me.clientId !== id))
    return (
      <EmptyState
        title={isClient ? "You can only view your own account" : "Client not found"}
        action={
          <Button href={isClient && me.clientId ? `/clients/${me.clientId}` : "/clients"}>Go back</Button>
        }
      />
    );

  const done = client.onboarding.filter((o) => o.done).length;
  const staffCan = (m: Parameters<typeof can>[1]) => !isClient && can(me.role, m);
  const tabs: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" },
    ...(isClient ? [] : [{ value: "insights" as Tab, label: "AI insights" }]),
    { value: "onboarding", label: `Onboarding ${done}/${client.onboarding.length}` },
    { value: "campaigns", label: "Campaigns" },
    { value: "creative", label: "Creative" },
    ...(staffCan("social") ? [{ value: "social" as Tab, label: "Social" }] : []),
    ...(staffCan("seo") ? [{ value: "seo" as Tab, label: "SEO" }] : []),
    ...(staffCan("influencers") ? [{ value: "influencers" as Tab, label: "Influencers" }] : []),
    ...(staffCan("strategy") ? [{ value: "strategy" as Tab, label: "Strategy" }] : []),
    { value: "tasks", label: "Tasks" },
    { value: "meetings", label: "Meetings" },
    ...(isClient ? [] : [{ value: "communication" as Tab, label: "Communication" }]),
    { value: "reports", label: "Reports" },
    { value: "documents", label: "Documents" },
    { value: "billing", label: "Billing" },
    ...(isClient ? [] : [{ value: "knowledge" as Tab, label: "Knowledge (AI memory)" }]),
  ];

  return (
    <div>
      {!isClient && (
        <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
          <ArrowLeft className="size-3" /> Clients
        </Link>
      )}
      <PageHeader
        icon={<Avatar name={client.company} size={32} className="rounded-lg" />}
        title={client.company}
        description={`${client.industry} · ${client.location} · client since ${fmtShort(client.createdAt)}`}
        actions={
          <>
            {!isClient && health && (
              <button onClick={() => setTab("insights")} title="Computed health score — see AI insights" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-surface-2">
                <span className="text-fg-3">Health</span>
                <span className={cn("font-semibold tabular-nums", health.score >= 75 ? "text-success" : health.score >= 55 ? "text-warning" : "text-danger")}>{health.score}</span>
              </button>
            )}
            {!isClient && <StatusBadge status={client.health} />}
            <MemberAvatar id={client.accountManagerId} showName />
          </>
        }
      />
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
      </div>
      <div className="animate-in" key={tab}>
        {tab === "overview" && (
          <div className="space-y-4">
            <Client360 client={client} isClient={isClient} onTab={(t) => setTab(t as Tab)} />
            <Overview client={client} internal={internal} />
          </div>
        )}
        {tab === "insights" && !isClient && <ClientInsights client={client} writable={internal} />}
        {tab === "creative" && <CreativeTab client={client} isClient={isClient} />}
        {tab === "social" && !isClient && <SocialTab client={client} />}
        {tab === "seo" && !isClient && <SeoTab client={client} canStart={can(me.role, "seo", "write")} />}
        {tab === "influencers" && !isClient && <InfluencersTab client={client} />}
        {tab === "strategy" && !isClient && <StrategyTab client={client} writable={can(me.role, "strategy", "write")} />}
        {tab === "knowledge" && !isClient && <KnowledgeEditor key={client.id} client={client} editable={internal} />}
        {tab === "onboarding" && <Onboarding client={client} internal={internal} />}
        {tab === "campaigns" && <Campaigns client={client} />}
        {tab === "tasks" && <Tasks client={client} internal={internal} />}
        {tab === "communication" && <Communication client={client} />}
        {tab === "documents" && <Documents client={client} />}
        {tab === "reports" && <Reports client={client} internal={internal} />}
        {tab === "billing" && <Billing client={client} />}
        {tab === "meetings" && <Meetings client={client} />}
      </div>
    </div>
  );
}
