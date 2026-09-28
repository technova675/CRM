"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, Bot, Brain, CalendarCheck, CalendarClock, CheckCircle2, Clock, FileText, Handshake, IndianRupee, Lightbulb,
  ListChecks, Megaphone, PieChart, Receipt, RefreshCcw, Rocket, ShieldCheck, Sparkles, Target, TrendingUp, Trophy, Users, Wallet, XCircle,
} from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { effectiveScore } from "@/lib/ai/scoring";
import { DEAL_STAGES, LEAD_SOURCES, type Client, type Role, type Service } from "@/lib/types";
import { cn, compact, compactMoney, DAY, fmtDate, fmtShort, fmtTime, isPast, isSameDay, money, pct, relTime, startOfDay, sum } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, CardHeader, EmptyState, MemberAvatar, PageHeader, Progress, Stat, StatusBadge, Tabs } from "@/components/ui";
import { aggregateMetrics, AreaTrend, Bars, Donut, Legend, totals } from "@/components/charts";
import { useUI } from "@/components/shell/ui-state";

type Section = "sales" | "clients" | "marketing" | "operations" | "finance";
const SECTIONS: { value: Section; label: string; icon: ReactNode }[] = [
  { value: "sales", label: "Sales", icon: <Target className="size-3.5" /> },
  { value: "clients", label: "Clients", icon: <Handshake className="size-3.5" /> },
  { value: "marketing", label: "Marketing", icon: <Megaphone className="size-3.5" /> },
  { value: "operations", label: "Operations", icon: <ListChecks className="size-3.5" /> },
  { value: "finance", label: "Finance", icon: <IndianRupee className="size-3.5" /> },
];
// Section visibility per role (finance numbers additionally require read access to "payments").
const SECTION_ROLES: Record<Section, Role[] | "all"> = {
  sales: ["admin", "sales"],
  clients: ["admin", "account_manager"],
  marketing: ["admin", "account_manager", "marketing", "creative_strategist", "influencer_manager", "social_media"],
  operations: "all",
  finance: ["admin", "finance"],
};
const sectionsFor = (role: Role) =>
  SECTIONS.filter((s) => {
    const r = SECTION_ROLES[s.value];
    if (s.value === "finance" && !can(role, "payments", "read")) return false;
    return r === "all" || r.includes(role);
  });

// Complementary services used for services-gap upsell detection.
const GAP: Partial<Record<Service, Service[]>> = {
  "Meta Ads": ["Google Ads", "Influencer Marketing", "Video Production"],
  "Google Ads": ["Meta Ads", "SEO"],
  SEO: ["Google Ads", "Social Media"],
  "Social Media": ["Influencer Marketing", "Meta Ads", "Video Production"],
  "Influencer Marketing": ["Social Media", "Meta Ads"],
  Programmatic: ["Google Ads"],
  "Brand Strategy": ["Social Media", "Meta Ads"],
};

const d30 = (metrics: { date: string }[][], from: number, to: number) => metrics.flatMap((m) => m.slice(from, to === 0 ? undefined : to));
const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : undefined);

export default function DashboardPage() {
  const me = useMe();
  if (me.role === "client") return <ClientDashboard clientId={me.clientId!} />;
  return <AgencyDashboard />;
}

// ---------------- Agency dashboard ----------------
function AgencyDashboard() {
  const me = useMe();
  const allowed = sectionsFor(me.role);
  const [section, setSection] = useState<Section>(allowed[0]?.value ?? "operations");
  const current = allowed.some((s) => s.value === section) ? section : allowed[0]?.value ?? "operations";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greet}, ${me.name.split(" ")[0]}`}
        description={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) + " · What is happening, why, what to do — and how to execute it."}
        actions={can(me.role, "leads", "write") ? <Button href="/leads?new=1" variant="primary">Add lead</Button> : undefined}
      />
      <FourQuestions />
      <Tabs value={current} onChange={setSection} tabs={allowed.map((s) => ({ value: s.value, label: <span className="inline-flex items-center gap-1.5">{s.icon}{s.label}</span> }))} />
      {current === "sales" && <SalesSection />}
      {current === "clients" && <ClientsSection />}
      {current === "marketing" && <MarketingSection />}
      {current === "operations" && <OperationsSection />}
      {current === "finance" && <FinanceSection />}
    </div>
  );
}

function useMarketingTotals() {
  const campaigns = useCRM((s) => s.campaigns);
  return useMemo(() => {
    const ms = campaigns.map((c) => c.metrics);
    const cur = totals(aggregateMetrics(d30(ms, -30, 0) as Parameters<typeof aggregateMetrics>[0]));
    const prev = totals(aggregateMetrics(d30(ms, -60, -30) as Parameters<typeof aggregateMetrics>[0]));
    return { cur, prev };
  }, [campaigns]);
}

function Q({ n, title, icon, children, href, cta }: { n: number; title: string; icon: ReactNode; children: ReactNode; href?: string; cta?: string }) {
  return (
    <Card className="flex flex-col p-3.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-3">
        <span className="grid size-4 place-items-center rounded bg-accent-soft text-[9px] text-accent-text">{n}</span>
        {icon}
        {title}
      </p>
      <div className="mt-2 flex-1 text-[13px]">{children}</div>
      {href && cta && <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs text-accent-text hover:underline">{cta} <ArrowRight className="size-3" /></Link>}
    </Card>
  );
}

// ---------------- Four questions ----------------
function FourQuestions() {
  const me = useMe();
  const recommendations = useCRM((s) => s.recommendations);
  const approvals = useCRM((s) => s.approvals);
  const aiTasks = useCRM((s) => s.aiTasks);
  const leads = useCRM((s) => s.leads);
  const openAssistant = useUI((s) => s.openAssistant);
  const [now] = useState(() => Date.now());
  const { cur, prev } = useMarketingTotals();
  const showMarketing = me.role === "admin" || can(me.role, "campaigns", "read") || can(me.role, "performance", "read");
  const canPerf = can(me.role, "performance", "read");

  const newRecs = recommendations.filter((r) => r.status === "New");
  const top = [...newRecs].sort((a, b) => ["High", "Medium", "Low"].indexOf(a.priority) - ["High", "Medium", "Low"].indexOf(b.priority) || b.createdAt.localeCompare(a.createdAt))[0];
  const pending = approvals.filter((a) => a.status === "pending").length;
  const running = aiTasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const leads7 = leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length;
  const leadsPrev7 = leads.filter((l) => { const a = now - new Date(l.createdAt).getTime(); return a >= 7 * DAY && a < 14 * DAY; }).length;

  const deltas: { label: string; d?: number; good: boolean }[] = showMarketing
    ? [
        { label: `Spend ${compactMoney(cur.spend)}`, d: delta(cur.spend, prev.spend), good: true },
        { label: `Revenue ${compactMoney(cur.revenue)}`, d: delta(cur.revenue, prev.revenue), good: true },
        { label: `ROAS ${cur.roas.toFixed(2)}x`, d: delta(cur.roas, prev.roas), good: true },
        { label: `CPA ${compactMoney(cur.cpa)}`, d: delta(cur.cpa, prev.cpa), good: false },
      ]
    : [{ label: `${leads7} new leads (7d)`, d: delta(leads7, leadsPrev7), good: true }];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Q n={1} title="What is happening" icon={<TrendingUp className="size-3" />} href={canPerf ? "/performance" : showMarketing ? "/campaigns" : can(me.role, "leads", "read") ? "/leads" : undefined} cta={canPerf ? "Performance" : showMarketing ? "Campaigns" : "Leads"}>
        <ul className="space-y-1">
          {deltas.map((x) => (
            <li key={x.label} className="flex items-center justify-between gap-2">
              <span className="text-fg-2">{x.label}</span>
              {x.d !== undefined ? <span className={cn("text-xs font-medium tabular-nums", (x.good ? x.d >= 0 : x.d <= 0) ? "text-success" : "text-danger")}>{x.d >= 0 ? "↑" : "↓"} {Math.abs(x.d).toFixed(0)}%</span> : <span className="text-xs text-fg-3">—</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-fg-3">{showMarketing ? "Last 30 days vs previous 30 · ad platforms" : "vs previous 7 days"}</p>
      </Q>
      <Q n={2} title="Why" icon={<Brain className="size-3" />} href={top && canPerf ? "/performance" : undefined} cta="See evidence">
        {top ? (
          <>
            <p className="line-clamp-1 font-medium">{top.title}</p>
            <p className="mt-0.5 line-clamp-3 text-xs text-fg-2">{top.why ?? top.finding}</p>
            <p className="mt-1 text-[10px] text-fg-3">{top.why ? "AI reasoning (assumption unless evidenced)" : "Finding from data"} · {top.priority} priority</p>
          </>
        ) : (
          <p className="text-xs text-fg-3">No open AI findings. Run the Media / Analytics agents to explain changes.</p>
        )}
      </Q>
      <Q n={3} title="What should we do" icon={<Lightbulb className="size-3" />} href={canPerf ? "/performance" : undefined} cta="Review recommendations">
        <p className="text-2xl font-semibold tabular-nums">{newRecs.length}</p>
        <p className="text-xs text-fg-3">new AI recommendations · {newRecs.filter((r) => r.priority === "High").length} high priority</p>
      </Q>
      <Q n={4} title="How do we execute" icon={<ShieldCheck className="size-3" />}>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/automations?tab=approvals" className="rounded-lg border border-border px-2.5 py-1.5 hover:border-border-strong">
            <p className={cn("text-lg font-semibold tabular-nums", pending > 0 && "text-warning")}>{pending}</p>
            <p className="text-[11px] text-fg-3">approvals pending</p>
          </Link>
          <Link href="/command" className="rounded-lg border border-border px-2.5 py-1.5 hover:border-border-strong">
            <p className="text-lg font-semibold tabular-nums">{running}</p>
            <p className="text-[11px] text-fg-3">AI tasks running</p>
          </Link>
        </div>
        <button onClick={() => openAssistant("What should we do today?")} className="mt-2 inline-flex items-center gap-1 text-xs text-accent-text hover:underline"><Sparkles className="size-3" /> Ask the AI what to do next</button>
      </Q>
    </div>
  );
}

// ---------------- Sales ----------------
function SalesSection() {
  const leads = useCRM((s) => s.leads);
  const deals = useCRM((s) => s.deals);
  const proposals = useCRM((s) => s.proposals);
  const meetings = useCRM((s) => s.meetings);
  const team = useCRM((s) => s.team);
  const [now] = useState(() => Date.now());

  const m = useMemo(() => {
    const at = (s: string[]) => leads.filter((l) => s.includes(l.status)).length;
    const qualified = at(["Qualified", "Contacted", "Replied", "Meeting", "Proposal", "Negotiation", "Won"]);
    const meetingPlus = at(["Meeting", "Proposal", "Negotiation", "Won"]);
    const proposalPlus = at(["Proposal", "Negotiation", "Won"]);
    const wonLeads = at(["Won"]);
    const open = deals.filter((d) => !["Won", "Lost"].includes(d.stage));
    const won = deals.filter((d) => d.stage === "Won");
    const lost = deals.filter((d) => d.stage === "Lost");
    const meet30 = meetings.filter((x) => Math.abs(now - new Date(x.startsAt).getTime()) < 30 * DAY);
    return {
      total: leads.length,
      new7: leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * DAY).length,
      qualified,
      meetings: meet30.length,
      upcomingMeetings: meetings.filter((x) => new Date(x.startsAt).getTime() >= now).length,
      proposals: proposals.filter((p) => p.status !== "Draft").length,
      proposalsOpen: proposals.filter((p) => ["Sent", "Viewed"].includes(p.status)).length,
      won: won.length,
      wonValue: sum(won.map((d) => d.value)),
      lost: lost.length,
      pipeline: sum(open.map((d) => d.value)),
      weighted: sum(open.map((d) => (d.value * d.probability) / 100)),
      openCount: open.length,
      winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
      conv: [
        { label: "Lead → Qualified", v: leads.length ? (qualified / leads.length) * 100 : 0 },
        { label: "Qualified → Meeting", v: qualified ? (meetingPlus / qualified) * 100 : 0 },
        { label: "Meeting → Proposal", v: meetingPlus ? (proposalPlus / meetingPlus) * 100 : 0 },
        { label: "Proposal → Won", v: proposalPlus ? (wonLeads / proposalPlus) * 100 : 0 },
        { label: "Lead → Won (overall)", v: leads.length ? (wonLeads / leads.length) * 100 : 0 },
      ],
    };
  }, [leads, deals, proposals, meetings, now]);

  const leadGrowth = useMemo(() => {
    const weeks = 12;
    const start = startOfDay().getTime() - (weeks - 1) * 7 * DAY;
    const rows = Array.from({ length: weeks }, (_, i) => ({ week: fmtShort(new Date(start + i * 7 * DAY).toISOString()), new: 0, qualified: 0 }));
    leads.forEach((l) => {
      const idx = Math.floor((new Date(l.createdAt).getTime() - start) / (7 * DAY));
      if (idx >= 0 && idx < weeks) {
        rows[idx]!.new++;
        if (effectiveScore(l) >= 60) rows[idx]!.qualified++;
      }
    });
    return rows;
  }, [leads]);
  const pipeline = useMemo(() => DEAL_STAGES.filter((s) => !["Won", "Lost"].includes(s)).map((stage) => ({ stage, value: sum(deals.filter((d) => d.stage === stage).map((d) => d.value)) })), [deals]);
  const sources = useMemo(
    () =>
      LEAD_SOURCES.map((src) => {
        const ls = leads.filter((l) => l.source === src);
        const conv = ls.filter((l) => ["Meeting", "Proposal", "Negotiation", "Won"].includes(l.status)).length;
        return { name: src, value: ls.length, conv: ls.length ? (conv / ls.length) * 100 : 0 };
      })
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value),
    [leads],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total leads" value={compact(m.total)} hint={`${m.new7} this week`} icon={<Users className="size-3.5" />} />
        <Stat label="Qualified leads" value={m.qualified} hint={pct(m.conv[0]!.v, 0)} icon={<BadgeCheck className="size-3.5" />} />
        <Stat label="Meetings (±30d)" value={m.meetings} hint={`${m.upcomingMeetings} upcoming`} icon={<CalendarCheck className="size-3.5" />} />
        <Stat label="Proposals" value={m.proposals} hint={`${m.proposalsOpen} awaiting reply`} icon={<FileText className="size-3.5" />} />
        <Stat label="Won deals" value={m.won} hint={compactMoney(m.wonValue)} icon={<Trophy className="size-3.5" />} tone="success" />
        <Stat label="Lost deals" value={m.lost} hint={`${pct(m.winRate, 0)} win rate`} icon={<XCircle className="size-3.5" />} tone="danger" />
        <Stat label="Pipeline value" value={compactMoney(m.pipeline)} hint={`${m.openCount} open deals`} icon={<PieChart className="size-3.5" />} />
        <Stat label="Expected revenue" value={compactMoney(m.weighted)} hint="weighted by probability" icon={<TrendingUp className="size-3.5" />} tone="success" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lead growth" subtitle="New vs. qualified (score ≥ 60), last 12 weeks" action={<Link href="/leads" className="text-xs text-accent-text hover:underline">Leads</Link>} />
          <div className="px-2 pb-3"><AreaTrend data={leadGrowth} x="week" series={[{ key: "new", label: "New leads" }, { key: "qualified", label: "Qualified" }]} /></div>
        </Card>
        <Card>
          <CardHeader title="Conversion rates" subtitle="Stage-to-stage, all leads" />
          <div className="space-y-3 px-4 pb-4 pt-1">
            {m.conv.map((c) => (
              <div key={c.label}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{c.label}</span><span className="tabular-nums text-fg-3">{pct(c.v, 1)}</span></div>
                <Progress value={c.v} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Pipeline by stage" subtitle={`${compactMoney(m.pipeline)} open · ${compactMoney(m.weighted)} weighted`} action={<Link href="/pipeline" className="text-xs text-accent-text hover:underline">Pipeline</Link>} />
          <div className="px-2 pb-3"><Bars data={pipeline} x="stage" series={[{ key: "value", label: "Value" }]} fmt={compactMoney} horizontal height={220} /></div>
        </Card>
        <Card>
          <CardHeader title="Lead sources" subtitle="Volume · lead → meeting conversion" />
          <div className="grid grid-cols-2 items-center gap-2 px-4 pb-4">
            <Donut data={sources} height={170} center={<div><p className="text-lg font-semibold">{m.total}</p><p className="text-[10px] text-fg-3">leads</p></div>} />
            <Legend items={sources.map((s) => ({ label: s.name, value: <span>{s.value} <span className="font-normal text-fg-3">· {pct(s.conv, 0)}</span></span> }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Team performance" subtitle="Owned pipeline & wins" />
          <div className="space-y-2.5 px-4 pb-4">
            {team.filter((t) => ["sales", "admin"].includes(t.role)).map((t) => {
              const own = deals.filter((d) => d.ownerId === t.id);
              const open = own.filter((d) => !["Won", "Lost"].includes(d.stage));
              return (
                <div key={t.id} className="flex items-center gap-2.5">
                  <MemberAvatar id={t.id} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{t.name}</p>
                    <p className="text-[11px] text-fg-3">{open.length} open · {compactMoney(sum(open.map((d) => d.value)))}</p>
                  </div>
                  <Badge tone="success"><Trophy className="size-3" />{own.filter((d) => d.stage === "Won").length}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Clients ----------------
function ClientsSection() {
  const clients = useCRM((s) => s.clients);
  const invoices = useCRM((s) => s.invoices);
  const tasks = useCRM((s) => s.tasks);
  const recommendations = useCRM((s) => s.recommendations);
  const [now] = useState(() => Date.now());

  const data = useMemo(() => {
    const attention: { c: Client; reasons: string[] }[] = [];
    for (const c of clients) {
      const r: string[] = [];
      if (c.health !== "Healthy") r.push(c.health);
      const overdue = invoices.filter((i) => i.clientId === c.id && i.status === "Overdue");
      if (overdue.length) r.push(`${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`);
      if (!c.lastReportAt || now - new Date(c.lastReportAt).getTime() > 30 * DAY) r.push("No report in 30+ days");
      const lateTasks = tasks.filter((t) => t.related?.type === "client" && t.related.id === c.id && t.status !== "Done" && new Date(t.dueDate).getTime() < now).length;
      if (lateTasks >= 2) r.push(`${lateTasks} overdue tasks`);
      if (c.onboarding.some((s) => !s.done) && now - new Date(c.createdAt).getTime() > 21 * DAY) r.push("Onboarding > 21 days");
      if (r.length) attention.push({ c, reasons: r });
    }
    const renewals = clients.filter((c) => { const t = new Date(c.contractEnd).getTime() - now; return t >= -7 * DAY && t <= 90 * DAY; }).sort((a, b) => a.contractEnd.localeCompare(b.contractEnd));
    const upsellRecs = recommendations.filter((r) => r.category === "Upsell" && ["New", "Approved"].includes(r.status));
    const gaps = clients
      .filter((c) => c.health === "Healthy")
      .map((c) => ({ c, missing: [...new Set(c.services.flatMap((s) => GAP[s] ?? []))].filter((s) => !c.services.includes(s)).slice(0, 2) }))
      .filter((x) => x.missing.length);
    return {
      active: clients.length,
      new30: clients.filter((c) => now - new Date(c.createdAt).getTime() < 30 * DAY).length,
      atRisk: clients.filter((c) => c.health !== "Healthy"),
      attention: attention.sort((a, b) => b.reasons.length - a.reasons.length),
      renewals,
      upsellRecs,
      gaps,
    };
  }, [clients, invoices, tasks, recommendations, now]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active clients" value={data.active} icon={<Handshake className="size-3.5" />} />
        <Stat label="New clients (30d)" value={data.new30} icon={<Sparkles className="size-3.5" />} tone="success" />
        <Stat label="Clients at risk" value={data.atRisk.length} hint={data.atRisk.map((c) => c.company.split(" ")[0]).join(", ") || "none"} icon={<AlertTriangle className="size-3.5" />} tone={data.atRisk.length ? "danger" : "success"} />
        <Stat label="Need attention" value={data.attention.length} icon={<Clock className="size-3.5" />} tone={data.attention.length ? "warning" : "success"} />
        <Stat label="Renewals (90d)" value={data.renewals.length} icon={<RefreshCcw className="size-3.5" />} />
        <Stat label="Upsell opportunities" value={data.upsellRecs.length + data.gaps.length} icon={<TrendingUp className="size-3.5" />} tone="success" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Clients requiring attention" subtitle="Health, overdue invoices, reporting, tasks, onboarding" action={<Link href="/clients" className="text-xs text-accent-text hover:underline">Clients</Link>} />
          <div className="px-2 pb-2">
            {data.attention.length === 0 && <p className="flex items-center gap-2 px-2 py-4 text-xs text-fg-3"><CheckCircle2 className="size-4 text-success" /> All clients look healthy.</p>}
            {data.attention.slice(0, 7).map(({ c, reasons }) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="block rounded-lg px-2 py-2 hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-medium">{c.company}</span><StatusBadge status={c.health} /></div>
                <p className="truncate text-xs text-fg-3">{reasons.join(" · ")}</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Renewal dates" subtitle="Contracts ending in the next 90 days" />
          <div className="px-2 pb-2">
            {data.renewals.length === 0 && <p className="px-2 py-4 text-xs text-fg-3">No renewals in the next 90 days.</p>}
            {data.renewals.map((c) => {
              const days = Math.round((new Date(c.contractEnd).getTime() - now) / DAY);
              return (
                <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <CalendarClock className={cn("size-4 shrink-0", days < 30 ? "text-danger" : "text-warning")} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{c.company}</span><span className="text-xs text-fg-3">{compactMoney(c.retainer)}/mo · {c.health}</span></span>
                  <span className="text-right text-xs"><span className="block tabular-nums">{fmtDate(c.contractEnd)}</span><span className={cn("text-[11px]", days < 30 ? "text-danger" : "text-fg-3")}>{days < 0 ? "ended" : `in ${days}d`}</span></span>
                </Link>
              );
            })}
          </div>
        </Card>
        <Card>
          <CardHeader title="Upsell opportunities" subtitle="AI recommendations + services gaps" />
          <div className="space-y-1 px-2 pb-2">
            {data.upsellRecs.slice(0, 4).map((r) => (
              <Link key={r.id} href="/performance" className="block rounded-lg px-2 py-2 hover:bg-surface-2">
                <div className="flex items-center gap-1.5"><AIBadge>Upsell</AIBadge><span className="truncate text-[13px] font-medium">{r.title}</span></div>
                <p className="truncate text-xs text-fg-3">{r.recommendation}</p>
              </Link>
            ))}
            {data.gaps.slice(0, 6 - Math.min(4, data.upsellRecs.length)).map(({ c, missing }) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{c.company}</span><span className="text-xs text-fg-3">Has {c.services.join(", ")}</span></span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">{missing.map((s) => <Badge key={s} tone="accent">+ {s}</Badge>)}</span>
              </Link>
            ))}
            {data.upsellRecs.length + data.gaps.length === 0 && <p className="px-2 py-4 text-xs text-fg-3">No upsell opportunities detected.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Marketing ----------------
function MarketingSection() {
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const { cur, prev } = useMarketingTotals();
  const rows = useMemo(() => aggregateMetrics(campaigns.flatMap((c) => c.metrics.slice(-30))), [campaigns]);
  const status = useMemo(() => (["Active", "Planning", "Paused", "Completed"] as const).map((s) => ({ name: s, value: campaigns.filter((c) => c.status === s).length })).filter((x) => x.value), [campaigns]);
  const clientPerf = useMemo(
    () => clients.map((c) => { const t = totals(aggregateMetrics(campaigns.filter((x) => x.clientId === c.id).flatMap((x) => x.metrics.slice(-30)))); return { client: c.company.split(" ")[0]!, roas: +t.roas.toFixed(2) }; }).sort((a, b) => b.roas - a.roas),
    [clients, campaigns],
  );
  const tiles: [string, string, number | undefined, boolean][] = [
    ["Total ad spend", compactMoney(cur.spend), delta(cur.spend, prev.spend), true],
    ["Revenue", compactMoney(cur.revenue), delta(cur.revenue, prev.revenue), true],
    ["ROAS", `${cur.roas.toFixed(2)}x`, delta(cur.roas, prev.roas), true],
    ["CPA", money(cur.cpa), delta(cur.cpa, prev.cpa), false],
    ["Leads", compact(cur.leads), delta(cur.leads, prev.leads), true],
    ["Conversions", compact(cur.conversions), delta(cur.conversions, prev.conversions), true],
    ["CTR", pct(cur.ctr, 2), delta(cur.ctr, prev.ctr), true],
    ["CPC", money(cur.cpc), delta(cur.cpc, prev.cpc), false],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {tiles.map(([l, v, d, good]) => (
          <Card key={l} className="p-3.5">
            <p className="text-xs font-medium text-fg-3">{l}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums">{v}</p>
            {d !== undefined && Number.isFinite(d) ? <p className={cn("text-xs font-medium tabular-nums", (good ? d >= 0 : d <= 0) ? "text-success" : "text-danger")}>{d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(0)}% <span className="font-normal text-fg-3">vs prev 30d</span></p> : <p className="text-xs text-fg-3">no prior data</p>}
          </Card>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Spend vs revenue" subtitle="All clients, last 30 days · from connected ad platforms" action={<Link href="/performance" className="text-xs text-accent-text hover:underline">Performance</Link>} />
          <div className="px-2 pb-3">{rows.length ? <AreaTrend data={rows.map((r) => ({ ...r, date: fmtShort(r.date) }))} x="date" series={[{ key: "revenue", label: "Revenue" }, { key: "spend", label: "Spend" }]} fmt={compactMoney} /> : <EmptyState title="No campaign data yet" />}</div>
        </Card>
        <Card>
          <CardHeader title="Campaign status" subtitle={`${campaigns.length} campaigns`} action={<Link href="/campaigns" className="text-xs text-accent-text hover:underline">Campaigns</Link>} />
          <div className="grid grid-cols-2 items-center gap-2 px-4 pb-4">
            <Donut data={status} height={170} center={<div><p className="text-lg font-semibold">{campaigns.filter((c) => c.status === "Active").length}</p><p className="text-[10px] text-fg-3">active</p></div>} />
            <Legend items={status.map((s) => ({ label: s.name, value: s.value }))} />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="ROAS by client" subtitle="Last 30 days (target 3.0x)" action={<Link href="/reports" className="text-xs text-accent-text hover:underline">Reports</Link>} />
        <div className="px-2 pb-3"><Bars data={clientPerf} x="client" series={[{ key: "roas", label: "ROAS" }]} fmt={(v) => `${v.toFixed(1)}x`} height={220} /></div>
      </Card>
    </div>
  );
}

// ---------------- Operations ----------------
function OperationsSection() {
  const tasks = useCRM((s) => s.tasks);
  const team = useCRM((s) => s.team);
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const schedules = useCRM((s) => s.reportSchedules);
  const creatives = useCRM((s) => s.creatives);
  const approvals = useCRM((s) => s.approvals);
  const meetings = useCRM((s) => s.meetings);
  const activities = useCRM((s) => s.activities);
  const [now] = useState(() => Date.now());

  const d = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "Done");
    const due = open.filter((t) => { const x = new Date(t.dueDate).getTime(); return x >= startOfDay().getTime() && x <= now + 7 * DAY; });
    const overdue = open.filter((t) => isPast(t.dueDate) && !isSameDay(t.dueDate));
    const workload = team
      .filter((m) => m.role !== "client")
      .map((m) => ({ name: m.name.split(" ")[0]!, open: open.filter((t) => t.assigneeId === m.id).length, overdue: overdue.filter((t) => t.assigneeId === m.id).length }))
      .filter((x) => x.open > 0)
      .sort((a, b) => b.open - a.open)
      .slice(0, 10);
    const launching = campaigns.filter((c) => c.status === "Planning" || (new Date(c.startDate).getTime() >= now && new Date(c.startDate).getTime() <= now + 14 * DAY)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const reportsDue = schedules.filter((s) => s.enabled && new Date(s.nextRunAt).getTime() <= now + 7 * DAY).sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
    const clientReview = creatives.filter((c) => c.status === "Client Review");
    const pending = approvals.filter((a) => a.status === "pending");
    return { due, overdue, workload, launching, reportsDue, clientReview, pending };
  }, [tasks, team, campaigns, schedules, creatives, approvals, now]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  const upcoming = meetings.filter((x) => new Date(x.startsAt).getTime() >= now - 3_600_000).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Tasks due (7d)" value={d.due.length} icon={<ListChecks className="size-3.5" />} />
        <Stat label="Overdue tasks" value={d.overdue.length} icon={<AlertTriangle className="size-3.5" />} tone={d.overdue.length ? "danger" : "success"} />
        <Stat label="Campaigns launching" value={d.launching.length} hint="planning / next 14d" icon={<Rocket className="size-3.5" />} />
        <Stat label="Reports due (7d)" value={d.reportsDue.length} icon={<FileText className="size-3.5" />} />
        <Stat label="Client approvals" value={d.clientReview.length} hint="creatives in client review" icon={<CheckCircle2 className="size-3.5" />} tone={d.clientReview.length ? "warning" : undefined} />
        <Stat label="Pending approvals" value={d.pending.length} hint="AI actions held for a human" icon={<ShieldCheck className="size-3.5" />} tone={d.pending.length ? "warning" : undefined} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Team workload" subtitle="Open tasks per member (overdue stacked)" action={<Link href="/tasks" className="text-xs text-accent-text hover:underline">Tasks</Link>} />
          <div className="px-2 pb-3">{d.workload.length ? <Bars data={d.workload.map((w) => ({ name: w.name, onTime: w.open - w.overdue, overdue: w.overdue }))} x="name" series={[{ key: "onTime", label: "Open", color: "var(--chart-1)" }, { key: "overdue", label: "Overdue", color: "var(--chart-5)" }]} stacked height={220} /> : <EmptyState title="No open tasks" />}</div>
        </Card>
        <Card>
          <CardHeader title="Overdue & due soon" action={<Link href="/tasks" className="text-xs text-accent-text hover:underline">All</Link>} />
          <div className="px-2 pb-2">
            {[...d.overdue, ...d.due].slice(0, 7).map((t) => (
              <Link key={t.id} href="/tasks" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <Clock className={cn("size-3.5 shrink-0", isPast(t.dueDate) && !isSameDay(t.dueDate) ? "text-danger" : "text-warning")} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                <span className="text-[11px] tabular-nums text-fg-3">{fmtShort(t.dueDate)}</span>
                <MemberAvatar id={t.assigneeId} size={18} />
              </Link>
            ))}
            {d.overdue.length + d.due.length === 0 && <p className="px-2 py-4 text-xs text-fg-3">Nothing due.</p>}
          </div>
        </Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Campaigns launching" subtitle="Planning or starting within 14 days" />
          <div className="px-2 pb-2">
            {d.launching.length === 0 && <p className="px-2 py-4 text-xs text-fg-3">No launches scheduled.</p>}
            {d.launching.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/campaigns?c=${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{c.name}</span><span className="text-xs text-fg-3">{clientName(c.clientId)} · starts {fmtShort(c.startDate)}</span></span>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Reports due & approvals" subtitle="Next 7 days" />
          <div className="px-2 pb-2">
            {d.reportsDue.slice(0, 4).map((s) => (
              <Link key={s.id} href={`/reports?client=${s.clientId}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className="truncate text-[13px]"><FileText className="mr-1.5 inline size-3.5 text-fg-3" />{clientName(s.clientId)} · {s.frequency}</span>
                <span className="text-[11px] text-fg-3">{relTime(s.nextRunAt)}</span>
              </Link>
            ))}
            {d.clientReview.slice(0, 3).map((c) => (
              <Link key={c.id} href={`/creative?c=${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className="truncate text-[13px]"><CheckCircle2 className="mr-1.5 inline size-3.5 text-warning" />{c.title}</span>
                <span className="text-[11px] text-fg-3">{clientName(c.clientId)}</span>
              </Link>
            ))}
            {d.pending.slice(0, 3).map((a) => (
              <Link key={a.id} href="/automations?tab=approvals" className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className="truncate text-[13px]"><ShieldCheck className="mr-1.5 inline size-3.5 text-accent-text" />{a.title}</span>
                <Badge tone="accent">{a.kind}</Badge>
              </Link>
            ))}
            {d.reportsDue.length + d.clientReview.length + d.pending.length === 0 && <p className="px-2 py-4 text-xs text-fg-3">Nothing due.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Meetings & activity" action={<Link href="/automations?tab=log" className="text-xs text-accent-text hover:underline">Log</Link>} />
          <div className="px-2 pb-2">
            {upcoming.map((x) => (
              <Link key={x.id} href="/meetings" className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className="w-12 shrink-0 text-center"><span className="block text-[10px] text-fg-3">{isSameDay(x.startsAt) ? "Today" : fmtShort(x.startsAt)}</span><span className="text-xs font-semibold tabular-nums">{fmtTime(x.startsAt)}</span></span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{x.title}</span>
              </Link>
            ))}
            <div className="my-1 border-t border-border" />
            {activities.slice(0, 4).map((a) => (
              <div key={a.id} className="flex gap-2 px-2 py-1">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", a.actor === "ai" ? "bg-accent" : a.actor === "system" ? "bg-fg-3" : "bg-success")} />
                <p className="min-w-0 truncate text-xs"><span className="font-medium">{a.actor === "ai" ? "AI" : a.actor === "system" ? "System" : team.find((t) => t.id === a.actorId)?.name.split(" ")[0] ?? "Someone"}</span> {a.action.toLowerCase()} <span className="text-fg-3">· {relTime(a.at)}</span></p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Finance ----------------
function FinanceSection() {
  const invoices = useCRM((s) => s.invoices);
  const clients = useCRM((s) => s.clients);
  const f = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const month = invoices.filter((i) => new Date(i.issuedAt) >= monthStart);
    const unpaid = invoices.filter((i) => i.status !== "Paid");
    const overdue = invoices.filter((i) => i.status === "Overdue");
    const revenue: { month: string; invoiced: number; collected: number }[] = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date();
      d.setMonth(d.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const inv = invoices.filter((x) => { const t = new Date(x.issuedAt); return `${t.getFullYear()}-${t.getMonth()}` === key; });
      revenue.push({ month: d.toLocaleDateString("en-IN", { month: "short" }), invoiced: sum(inv.map((x) => x.amount)), collected: sum(inv.map((x) => x.paid)) });
    }
    return {
      invoiced: sum(month.map((i) => i.amount)),
      collected: sum(month.map((i) => i.paid)),
      outstanding: sum(unpaid.map((i) => i.amount - i.paid)),
      unpaidCount: unpaid.length,
      overdueAmt: sum(overdue.map((i) => i.amount - i.paid)),
      overdue,
      mrr: sum(clients.map((c) => c.retainer)),
      revenue,
    };
  }, [invoices, clients]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Monthly revenue" value={compactMoney(f.invoiced)} hint={`${compactMoney(f.collected)} collected`} icon={<IndianRupee className="size-3.5" />} tone="success" />
        <Stat label="Outstanding invoices" value={compactMoney(f.outstanding)} hint={`${f.unpaidCount} unpaid`} icon={<Receipt className="size-3.5" />} tone="warning" />
        <Stat label="Overdue payments" value={compactMoney(f.overdueAmt)} hint={`${f.overdue.length} invoices`} icon={<AlertTriangle className="size-3.5" />} tone={f.overdue.length ? "danger" : "success"} />
        <Stat label="Recurring revenue (MRR)" value={compactMoney(f.mrr)} hint={`${compactMoney(f.mrr * 12)} ARR from retainers`} icon={<RefreshCcw className="size-3.5" />} />
        <Link href="/payments?tab=profitability" className="block"><Card className="h-full p-4 transition hover:border-border-strong"><p className="text-xs font-medium text-fg-3">Client profitability</p><p className="mt-2 flex items-center gap-1 text-[13px] font-medium text-accent-text">Open margins by client <ArrowRight className="size-3.5" /></p><p className="mt-1 text-xs text-fg-3">Retainer vs team, freelancer & tool cost</p></Card></Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue" subtitle="Invoiced vs collected, last 6 months" action={<Link href="/payments" className="text-xs text-accent-text hover:underline">Finance</Link>} />
          <div className="px-2 pb-3"><Bars data={f.revenue} x="month" series={[{ key: "invoiced", label: "Invoiced", color: "var(--chart-6)" }, { key: "collected", label: "Collected", color: "var(--chart-3)" }]} fmt={compactMoney} height={240} /></div>
        </Card>
        <Card>
          <CardHeader title="Overdue payments" subtitle="Reminders follow the Payment reminders approval mode" />
          <div className="px-2 pb-2">
            {f.overdue.length === 0 && <p className="flex items-center gap-2 px-2 py-4 text-xs text-fg-3"><CheckCircle2 className="size-4 text-success" /> Nothing overdue.</p>}
            {f.overdue.slice(0, 6).map((i) => (
              <Link key={i.id} href="/payments" className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-2">
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{clientName(i.clientId)}</span><span className="text-xs text-fg-3">{i.number} · due {fmtShort(i.dueDate)} · {i.remindersSent} reminder(s)</span></span>
                <span className="text-[13px] font-semibold tabular-nums text-danger">{compactMoney(i.amount - i.paid)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Client portal dashboard ----------------
function ClientDashboard({ clientId }: { clientId: string }) {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const invoices = useCRM((s) => s.invoices);
  const tasks = useCRM((s) => s.tasks);
  const reports = useCRM((s) => s.reports);
  const creatives = useCRM((s) => s.creatives);
  const meetings = useCRM((s) => s.meetings);
  const [now] = useState(() => Date.now());
  const client = clients.find((c) => c.id === clientId);
  const mine = useMemo(() => campaigns.filter((c) => c.clientId === clientId), [campaigns, clientId]);
  const rows = useMemo(() => aggregateMetrics(mine.flatMap((c) => c.metrics.slice(-30))), [mine]);
  const prev = useMemo(() => totals(aggregateMetrics(mine.flatMap((c) => c.metrics.slice(-60, -30)))), [mine]);
  const t = totals(rows);
  const myInvoices = invoices.filter((i) => i.clientId === clientId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const due = myInvoices.filter((i) => i.status !== "Paid");
  const toApprove = creatives.filter((c) => c.clientId === clientId && c.status === "Client Review");
  const myReports = reports.filter((r) => r.clientId === clientId && r.sent).slice(0, 4);
  const myMeetings = meetings.filter((m) => m.clientId === clientId && new Date(m.startsAt).getTime() >= now - 3_600_000).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
  // Client-visible tasks: only tasks attached to their own client record.
  const myTasks = tasks.filter((x) => x.related?.type === "client" && x.related.id === clientId && x.status !== "Done").slice(0, 6);
  if (!client) return <p className="text-sm text-fg-3">No client account linked.</p>;
  return (
    <div className="space-y-5">
      <PageHeader title={`Welcome, ${client.company}`} description="Your campaigns, performance, reports, approvals, invoices and meetings with Adbibe — last 30 days." />
      {toApprove.length > 0 && (
        <Link href="/creative" className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning">
          <CheckCircle2 className="size-4" /> <b>{toApprove.length} creative{toApprove.length > 1 ? "s" : ""}</b> waiting for your approval <ArrowRight className="ml-auto size-4" />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Spend" value={compactMoney(t.spend)} delta={delta(t.spend, prev.spend)} hint="vs prev 30d" />
        <Stat label="Leads" value={compact(t.leads)} delta={delta(t.leads, prev.leads)} hint="vs prev 30d" />
        <Stat label="Conversions" value={compact(t.conversions)} delta={delta(t.conversions, prev.conversions)} hint="vs prev 30d" />
        <Stat label="CPA" value={compactMoney(t.cpa)} hint="cost per acquisition" />
        <Stat label="ROAS" value={`${t.roas.toFixed(2)}x`} delta={delta(t.roas, prev.roas)} tone="success" hint="vs prev 30d" />
        <Stat label="Amount due" value={compactMoney(sum(due.map((i) => i.amount - i.paid)))} tone={due.some((i) => i.status === "Overdue") ? "danger" : "warning"} hint={`${due.length} open invoice(s)`} />
      </div>
      <Card>
        <CardHeader title="Performance" subtitle="Spend vs revenue, last 30 days" action={<Link href={`/reports?client=${clientId}`} className="text-xs text-accent-text">Full report</Link>} />
        <div className="px-2 pb-3">
          {rows.length ? <AreaTrend data={rows.map((r) => ({ ...r, date: fmtShort(r.date) }))} x="date" series={[{ key: "revenue", label: "Revenue" }, { key: "spend", label: "Spend" }]} fmt={compactMoney} height={260} /> : <EmptyState title="No performance data yet" />}
        </div>
      </Card>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Your campaigns" action={<Link href="/campaigns" className="text-xs text-accent-text">View all</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {mine.length === 0 && <p className="text-xs text-fg-3">No campaigns yet.</p>}
            {mine.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{c.name}</span><StatusBadge status={c.status} /></div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Approvals" subtitle="Creatives waiting for you" action={<Link href="/creative" className="text-xs text-accent-text">Creative</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {toApprove.length === 0 && <p className="flex items-center gap-2 text-xs text-fg-3"><CheckCircle2 className="size-4 text-success" /> Nothing waiting.</p>}
            {toApprove.slice(0, 5).map((c) => (
              <Link key={c.id} href={`/creative?c=${c.id}`} className="flex items-center justify-between gap-2 text-[13px] hover:underline"><span className="truncate">{c.title}</span><span className="text-xs text-fg-3">{c.format}</span></Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Reports" action={<Link href={`/reports?client=${clientId}`} className="text-xs text-accent-text">Open</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {myReports.length === 0 && <p className="text-xs text-fg-3">Your live report dashboard is always available.</p>}
            {myReports.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{r.period}</span><Badge>{r.format === "Presentation" ? "PPT" : r.format}</Badge></div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Invoices" action={<Link href="/payments" className="text-xs text-accent-text">Billing</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {myInvoices.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{i.number} · {fmtShort(i.issuedAt)}</span><span className="flex items-center gap-2"><span className="tabular-nums">{compactMoney(i.amount)}</span><StatusBadge status={i.status} /></span></div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming meetings" action={<Link href="/meetings" className="text-xs text-accent-text">Meetings</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {myMeetings.length === 0 && <p className="text-xs text-fg-3">No meetings scheduled.</p>}
            {myMeetings.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{m.title}</span><span className="shrink-0 text-xs text-fg-3">{fmtShort(m.startsAt)} · {fmtTime(m.startsAt)}</span></div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Work in progress" action={<Link href="/tasks" className="text-xs text-accent-text">Tasks</Link>} />
          <div className="space-y-2 px-4 pb-4">
            {myTasks.length === 0 && <p className="text-xs text-fg-3">No open items.</p>}
            {myTasks.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{x.title}</span><span className="text-xs text-fg-3">{fmtShort(x.dueDate)}</span></div>
            ))}
          </div>
        </Card>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-fg-3"><Bot className="size-3" /> Figures come from your connected ad accounts. Questions? Message your team in <Link href="/inbox" className="text-accent-text hover:underline">Messages</Link>. <Wallet className="ml-2 size-3" /> Payments due: {money(sum(due.map((i) => i.amount - i.paid)))}</p>
    </div>
  );
}
