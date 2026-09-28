"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarClock, CalendarDays, FileText, HeartPulse, ListTodo, Megaphone, MessageSquare, Palette, Sparkles, Wallet } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Client } from "@/lib/types";
import { clientTasks } from "@/lib/ai/client-success";
import { cn, compactMoney, daysBetween, isPast, fmtDate, fmtDateTime, fmtShort, relTime, sum } from "@/lib/utils";
import { aggregateMetrics, Sparkline, totals } from "@/components/charts";
import { Badge, Card, CardHeader, InsightTag, MemberAvatar, Progress, StatusBadge } from "@/components/ui";
import { useClientHealth } from "./useClientHealth";
import { HealthRing } from "./ClientInsights";

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "warning" | "success" }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] text-fg-3">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p>
      {hint && <p className="truncate text-[11px] text-fg-3">{hint}</p>}
    </Card>
  );
}

function Panel({ title, icon, href, linkLabel = "View all", onOpen, children }: { title: string; icon: React.ReactNode; href?: string; linkLabel?: string; onOpen?: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-1.5">{icon}{title}</span>}
        action={
          href ? (
            <Link href={href} className="text-[11px] text-fg-3 hover:text-fg">{linkLabel} →</Link>
          ) : onOpen ? (
            <button onClick={onOpen} className="text-[11px] text-fg-3 hover:text-fg">{linkLabel} →</button>
          ) : undefined
        }
      />
      <div className="px-4 pb-3">{children}</div>
    </Card>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-1 text-xs text-fg-3">{children}</p>;

export function Client360({ client, isClient, onTab }: { client: Client; isClient: boolean; onTab: (t: string) => void }) {
  const campaignsAll = useCRM((s) => s.campaigns);
  const invoicesAll = useCRM((s) => s.invoices);
  const creativesAll = useCRM((s) => s.creatives);
  const meetingsAll = useCRM((s) => s.meetings);
  const tasksAll = useCRM((s) => s.tasks);
  const reportsAll = useCRM((s) => s.reports);
  const conversations = useCRM((s) => s.conversations);
  const messages = useCRM((s) => s.messages);
  const recsAll = useCRM((s) => s.recommendations);
  const health = useClientHealth(client);

  const d = useMemo(() => {
    const campaigns = campaignsAll.filter((c) => c.clientId === client.id);
    const agg = aggregateMetrics(campaigns.flatMap((c) => c.metrics.slice(-30)));
    const t = totals(agg);
    const invoices = invoicesAll.filter((i) => i.clientId === client.id);
    const outstanding = sum(invoices.filter((i) => i.status !== "Paid").map((i) => i.amount - i.paid));
    const overdue = invoices.some((i) => i.status === "Overdue");
    const pendingCreatives = creativesAll.filter((c) => c.clientId === client.id && c.status === "Client Review");
    const nextMeeting = meetingsAll.filter((m) => m.clientId === client.id && !isPast(m.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const openTasks = clientTasks(client.id, tasksAll, campaignsAll).filter((x) => x.status !== "Done").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const latestReport = reportsAll.filter((r) => r.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const convIds = new Set(conversations.filter((c) => c.clientId === client.id).map((c) => c.id));
    const recentMsgs = messages.filter((m) => convIds.has(m.conversationId)).sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 3);
    const team = [...new Set([client.accountManagerId, ...campaigns.flatMap((c) => [...c.teamIds, ...(c.ownerId ? [c.ownerId] : [])])])];
    const topRec = recsAll.find((r) => r.clientId === client.id && r.status === "New");
    return { campaigns, agg, t, outstanding, overdue, pendingCreatives, nextMeeting, openTasks, latestReport, recentMsgs, team, topRec };
  }, [campaignsAll, invoicesAll, creativesAll, meetingsAll, tasksAll, reportsAll, conversations, messages, recsAll, client]);

  const renewalDays = daysBetween(client.contractEnd);
  const totalDays = Math.max(1, daysBetween(client.contractEnd, client.contractStart));
  const elapsed = Math.min(100, Math.max(0, ((totalDays - renewalDays) / totalDays) * 100));
  const topInsight = health?.insights.find((i) => i.kind === "recommendation");

  return (
    <div className="space-y-4">
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", isClient ? "lg:grid-cols-5" : "lg:grid-cols-7")}>
        <Tile label="Monthly retainer" value={compactMoney(client.retainer)} hint={`${compactMoney(client.retainer * 12)}/yr`} />
        <Tile label="Managed ad spend" value={compactMoney(client.monthlyAdSpend ?? 0)} hint="per month" />
        <Tile label="Spend (30d)" value={compactMoney(d.t.spend)} hint={<span className="inline-block h-4 w-20 align-middle"><Sparkline data={d.agg.map((r) => r.spend)} height={16} /></span>} />
        <Tile label="Revenue (30d)" value={compactMoney(d.t.revenue)} hint="attributed" />
        <Tile label="ROAS (30d)" value={`${d.t.roas.toFixed(2)}x`} tone={d.t.roas >= 3 ? "success" : d.t.roas < 2 && d.t.spend > 0 ? "warning" : undefined} hint={`CPA ${compactMoney(d.t.cpa)}`} />
        {!isClient && health && <Tile label="Health score" value={`${health.score}/100`} tone={health.score >= 75 ? "success" : health.score >= 55 ? "warning" : "danger"} hint={health.band} />}
        {!isClient && <Tile label="Outstanding" value={d.outstanding ? compactMoney(d.outstanding) : "—"} tone={d.overdue ? "danger" : d.outstanding ? "warning" : undefined} hint={d.overdue ? "overdue" : "invoices"} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><CalendarDays className="size-3.5 text-fg-3" /> Contract</p>
          <div className="flex items-baseline justify-between text-xs text-fg-3">
            <span>{fmtDate(client.contractStart)}</span>
            <span>{fmtDate(client.contractEnd)}</span>
          </div>
          <Progress value={elapsed} tone={renewalDays < 30 ? "danger" : renewalDays < 60 ? "warning" : "accent"} className="my-1.5" />
          <p className={cn("text-[13px] font-medium", renewalDays < 30 ? "text-danger" : renewalDays < 60 ? "text-warning" : "")}>
            {renewalDays >= 0 ? `Renews in ${renewalDays} day${renewalDays === 1 ? "" : "s"}` : `Expired ${-renewalDays} days ago`}
          </p>
          <p className="mb-1.5 mt-3 text-xs font-medium text-fg-2">Services</p>
          <div className="flex flex-wrap gap-1">
            {client.services.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
          </div>
          <p className="mb-1.5 mt-3 text-xs font-medium text-fg-2">Team</p>
          <div className="flex flex-wrap gap-2">
            {d.team.map((id) => <MemberAvatar key={id} id={id} showName size={20} />)}
          </div>
        </Card>

        <Panel title="Campaigns" icon={<Megaphone className="size-3.5 text-fg-3" />} onOpen={() => onTab("campaigns")}>
          {d.campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
            <ul className="space-y-2">
              {d.campaigns.slice(0, 5).map((c) => {
                const t = totals(aggregateMetrics(c.metrics.slice(-30)));
                return (
                  <li key={c.id} className="flex items-center gap-2 text-[13px]">
                    <Link href={`/campaigns?c=${c.id}`} className="min-w-0 flex-1 truncate hover:underline">{c.service}</Link>
                    <span className="text-xs tabular-nums text-fg-3">{t.spend ? `${t.roas.toFixed(1)}x` : "—"}</span>
                    <StatusBadge status={c.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {!isClient && health ? (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Sparkles className="size-3.5 text-accent-text" /> Top AI insight</p>
              <button onClick={() => onTab("insights")} className="text-[11px] text-fg-3 hover:text-fg">AI insights →</button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <HealthRing score={health.score} size={56} />
              <div className="min-w-0 text-xs text-fg-3">
                <p className="flex items-center gap-1"><HeartPulse className="size-3" /> {health.band}</p>
                {health.churnReasons[0] && <p className="truncate">⚠ {health.churnReasons[0]}</p>}
              </div>
            </div>
            {d.topRec ? (
              <div className="mt-3 flex items-start gap-2 text-[13px]"><InsightTag kind="recommendation" /><span className="text-fg-2">{d.topRec.title}</span></div>
            ) : topInsight ? (
              <div className="mt-3 flex items-start gap-2 text-[13px]"><InsightTag kind="recommendation" /><span className="text-fg-2">{topInsight.text}</span></div>
            ) : (
              <p className="mt-3 text-xs text-fg-3">No open recommendations.</p>
            )}
          </Card>
        ) : (
          <Panel title="Latest report" icon={<FileText className="size-3.5 text-fg-3" />} onOpen={() => onTab("reports")}>
            <p className="text-[13px] font-medium">{client.lastReportAt ? fmtDate(client.lastReportAt) : "No report yet"}</p>
            {d.latestReport && <p className="text-xs text-fg-3">{d.latestReport.period} · {d.latestReport.format}</p>}
          </Panel>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title={isClient ? "Awaiting your approval" : "Creative approvals pending"} icon={<Palette className="size-3.5 text-fg-3" />} onOpen={() => onTab("creative")}>
          {d.pendingCreatives.length === 0 ? <Empty>Nothing waiting for client review.</Empty> : (
            <ul className="space-y-1.5">
              {d.pendingCreatives.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[13px]">
                  <Link href={`/creative?c=${c.id}`} className="min-w-0 flex-1 truncate hover:underline">{c.title}</Link>
                  <span className="text-[11px] text-fg-3">{relTime(c.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next meeting" icon={<CalendarClock className="size-3.5 text-fg-3" />} onOpen={() => onTab("meetings")}>
          {d.nextMeeting ? (
            <div className="text-[13px]">
              <p className="font-medium">{d.nextMeeting.title}</p>
              <p className="text-xs text-fg-3">{fmtDateTime(d.nextMeeting.startsAt)} · {d.nextMeeting.durationMin} min</p>
              {d.nextMeeting.link && <a href={d.nextMeeting.link} target="_blank" rel="noreferrer" className="text-xs text-accent-text hover:underline">Join link</a>}
            </div>
          ) : <Empty>No upcoming meeting.</Empty>}
        </Panel>

        <Panel title="Open tasks" icon={<ListTodo className="size-3.5 text-fg-3" />} onOpen={() => onTab("tasks")} linkLabel={`${d.openTasks.length} open`}>
          {d.openTasks.length === 0 ? <Empty>All caught up.</Empty> : (
            <ul className="space-y-1.5">
              {d.openTasks.slice(0, 4).map((t) => {
                const overdue = isPast(t.dueDate);
                return (
                  <li key={t.id} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className={cn("text-[11px] tabular-nums", overdue ? "font-medium text-danger" : "text-fg-3")}>{fmtShort(t.dueDate)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {isClient ? (
          <Panel title="Billing" icon={<Wallet className="size-3.5 text-fg-3" />} onOpen={() => onTab("billing")}>
            <p className={cn("text-[13px] font-medium", d.overdue && "text-danger")}>{d.outstanding ? `${compactMoney(d.outstanding)} outstanding` : "All invoices paid"}</p>
          </Panel>
        ) : (
          <Panel title="Recent communication" icon={<MessageSquare className="size-3.5 text-fg-3" />} onOpen={() => onTab("communication")}>
            {d.recentMsgs.length === 0 ? <Empty>No messages yet.</Empty> : (
              <ul className="space-y-1.5">
                {d.recentMsgs.map((m) => (
                  <li key={m.id} className="text-[13px]">
                    <p className="line-clamp-1 text-fg-2">{m.direction === "inbound" ? "← " : "→ "}{m.body}</p>
                    <p className="text-[11px] text-fg-3">{m.channel} · {relTime(m.sentAt)}{m.sentiment ? ` · ${m.sentiment}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {!isClient && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 text-xs text-fg-3">
          <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" /> Latest report: <b className="font-medium text-fg-2">{client.lastReportAt ? `${fmtDate(client.lastReportAt)} (${relTime(client.lastReportAt)})` : "never"}</b></span>
          {d.latestReport && <span>{d.latestReport.period} · {d.latestReport.format} · {d.latestReport.sent ? "sent" : "awaiting approval"}</span>}
          <button onClick={() => onTab("reports")} className="ml-auto hover:text-fg">Reports →</button>
        </Card>
      )}
    </div>
  );
}
