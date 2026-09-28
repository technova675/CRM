"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Compass, ExternalLink, Megaphone, Rocket, Send, Settings2, Sparkles, UserPlus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Client, Service } from "@/lib/types";
import { cn, DAY, daysBetween, fmtDate, relTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, InsightList, MemberAvatar, PageHeader, Progress, Readonly, Segmented, Stat, StatusBadge } from "@/components/ui";
import { toast } from "@/components/shell/toast";

// Deal Won → Welcome email → Onboarding form → Business info → Brand assets → Account access →
// Tracking → Workspace → Project → Tasks → Assign team → Strategy → Campaign setup → Launch
const PHASES = [
  { key: "kickoff", label: "Kick-off", match: /welcome|onboarding form|kick/i },
  { key: "collect", label: "Collecting info", match: /collect|access|asset|tracking|business|pixel|catalog|console|mcc|partner/i },
  { key: "setup", label: "Workspace & team", match: /workspace|project|task|assign|team|knowledge/i },
  { key: "launch", label: "Strategy & launch", match: /strategy|campaign|launch|brief|keyword|audience|creator|content|audit|structure/i },
] as const;
type PhaseKey = (typeof PHASES)[number]["key"];
const PAID: Service[] = ["Meta Ads", "Google Ads", "LinkedIn Ads", "Programmatic", "Retail Media", "Quick Commerce"];
const PLATFORM: Partial<Record<Service, string>> = { "Meta Ads": "Meta (FB + IG)", "Google Ads": "Google Ads", "LinkedIn Ads": "LinkedIn", Programmatic: "DV360", "Retail Media": "Amazon Ads", "Quick Commerce": "Blinkit Ads" };

function phaseOf(label?: string): PhaseKey {
  if (!label) return "launch";
  return PHASES.find((p) => p.match.test(label))?.key ?? "setup";
}

function useOnboardingInfo(c: Client) {
  const strategies = useCRM((s) => s.strategies);
  return useMemo(() => {
    const total = c.onboarding.length;
    const done = c.onboarding.filter((s) => s.done).length;
    const current = c.onboarding.find((s) => !s.done);
    const days = Math.max(0, -daysBetween(c.createdAt));
    const blockers: string[] = [];
    const open = (re: RegExp) => c.onboarding.find((s) => !s.done && re.test(s.label));
    const access = open(/access|partner|mcc|console/i);
    if (access && days >= 3) blockers.push(`Access not collected (${days}d since won)`);
    const assets = open(/brand asset/i);
    if (assets && days >= 5) blockers.push("Brand assets missing");
    const tracking = open(/tracking|pixel/i);
    if (tracking && days >= 5) blockers.push("Tracking requirements pending");
    const strat = strategies.find((s) => s.clientId === c.id);
    if (open(/strategy/i) && strat && strat.status !== "Approved") blockers.push(`Strategy “${strat.title}” is ${strat.status}`);
    if (current && days > 21) blockers.push(`Onboarding running ${days} days — target is 21`);
    return { total, done, pct: total ? (done / total) * 100 : 100, current, days, blockers, phase: phaseOf(current?.label), strategy: strat };
  }, [c, strategies]);
}

function ClientCard({ c, active, onOpen }: { c: Client; active: boolean; onOpen: () => void }) {
  const info = useOnboardingInfo(c);
  return (
    <button onClick={onOpen} className={cn("w-full rounded-xl border bg-surface p-3 text-left shadow-card transition hover:border-border-strong", active ? "border-accent ring-2 ring-[var(--ring)]" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{c.company}</p>
          <p className="truncate text-[11px] text-fg-3">{c.services.join(" · ")}</p>
        </div>
        <MemberAvatar id={c.accountManagerId} size={20} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Progress value={info.pct} tone={info.pct === 100 ? "success" : info.blockers.length ? "warning" : "accent"} className="flex-1" />
        <span className="text-[11px] tabular-nums text-fg-3">{info.done}/{info.total}</span>
      </div>
      <p className="mt-1.5 truncate text-xs text-fg-2">{info.current ? <>Next: <span className="font-medium">{info.current.label}</span></> : "All steps complete"}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
        <span>{info.days}d since won</span>
        {info.blockers.length > 0 && <Badge tone="warning"><AlertTriangle className="size-3" /> {info.blockers.length} blocker{info.blockers.length > 1 ? "s" : ""}</Badge>}
      </div>
    </button>
  );
}

function OnboardingDetail({ c, writable }: { c: Client; writable: boolean }) {
  const info = useOnboardingInfo(c);
  const templates = useCRM((s) => s.settings.onboardingTemplates);
  const mode = useCRM((s) => s.settings.approvalModes["Client communication"]);
  const approvals = useCRM((s) => s.approvals);
  const tasks = useCRM((s) => s.tasks);
  const projects = useCRM((s) => s.projects);
  const campaigns = useCRM((s) => s.campaigns);
  const deals = useCRM((s) => s.deals);
  const toggle = useCRM((s) => s.toggleOnboardingStep);
  const router = useRouter();

  const clientTasks = tasks.filter((t) => t.related?.type === "client" && t.related.id === c.id);
  const openTasks = clientTasks.filter((t) => t.status !== "Done");
  const clientProjects = projects.filter((p) => p.clientId === c.id);
  const clientCampaigns = campaigns.filter((x) => x.clientId === c.id);
  const deal = deals.find((d) => d.id === c.fromDealId);
  const formStep = c.onboarding.find((s) => /onboarding form/i.test(s.label));
  const pendingForm = approvals.some((a) => a.status === "pending" && a.ref?.id === c.id && /onboarding form/i.test(a.title));
  const serviceTemplates = templates.filter((t) => t.service !== "Default" && c.services.includes(t.service as Service));

  const sendForm = () => {
    const s = useCRM.getState();
    const contact = c.contacts[0];
    const title = `Send onboarding form to ${contact?.name ?? c.company}`;
    const nextSteps = c.onboarding.map((o) => (o.key === formStep?.key ? { ...o, done: true, doneAt: new Date().toISOString() } : o));
    if (mode === "Automatic") {
      if (formStep && !formStep.done) toggle(c.id, formStep.key);
      s.log({ actor: "ai", agent: "client_success", entity: "client", entityId: c.id, action: "Sent onboarding form", detail: `${c.company} · ${contact?.email ?? "primary contact"}` });
      toast("Onboarding form sent", "Client communication is Automatic.", "ai");
    } else if (mode === "Approval Required") {
      s.requestApproval({ kind: "Client communication", title, detail: `${c.company} — business info, brand assets, account access and tracking checklist`, ref: { type: "client", id: c.id }, agent: "client_success", apply: formStep ? { collection: "clients", id: c.id, patch: { onboarding: nextSteps } } : undefined });
      toast("Sent for approval", "The form goes out once approved in Automations → Approvals.", "warning");
    } else {
      s.addTask({ title, description: "Manual mode: send the onboarding form (business info, brand assets, access, tracking) and tick the step.", assigneeId: c.accountManagerId, priority: "High", dueDate: new Date(Date.now() + DAY).toISOString(), status: "Todo", related: { type: "client", id: c.id }, createdBy: "ai" });
      toast("Task created for the account manager", "Client communication is Manual.");
    }
  };

  const createCampaign = () => {
    const svc = c.services.find((x) => PAID.includes(x)) ?? c.services[0];
    if (!svc) return;
    const s = useCRM.getState();
    const name = `${c.company} · ${svc} launch`;
    s.addCampaign({ name, clientId: c.id, service: svc, platform: PLATFORM[svc] ?? svc, objective: "Launch", budget: c.monthlyAdSpend ?? 100000, startDate: new Date(Date.now() + 7 * DAY).toISOString(), endDate: new Date(Date.now() + 97 * DAY).toISOString(), teamIds: [c.accountManagerId], status: "Planning", ownerId: c.accountManagerId });
    const created = useCRM.getState().campaigns.find((x) => x.name === name && x.clientId === c.id);
    toast("Campaign created (Planning)", name);
    if (created) router.push(`/campaigns?c=${created.id}`);
  };

  const guidance = [
    { kind: "data" as const, text: `${info.done} of ${info.total} steps complete · ${info.days} days since the deal was won`, source: "Onboarding checklist" },
    ...info.blockers.map((b) => ({ kind: "data" as const, text: b, source: "Checklist + strategy status" })),
    ...(info.current ? [{ kind: "recommendation" as const, text: `Next: ${info.current.label}` }] : []),
    ...(openTasks.length ? [{ kind: "data" as const, text: `${openTasks.length} open onboarding task(s) for the team`, source: "Tasks" }] : []),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{c.company}</h2>
              <StatusBadge status={c.health} />
            </div>
            <p className="text-xs text-fg-3">{c.industry} · {c.location} · won {fmtDate(c.createdAt)}{deal ? ` · ${deal.title}` : ""}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-fg-2"><MemberAvatar id={c.accountManagerId} showName /> account manager</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" href={`/clients/${c.id}`} icon={<ExternalLink className="size-3.5" />}>Client profile</Button>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3">
          <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Progress</span><span className="tabular-nums text-fg-3">{Math.round(info.pct)}%</span></div>
          <Progress value={info.pct} tone={info.pct === 100 ? "success" : "accent"} />
        </div>
      </Card>

      {writable && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button variant="secondary" icon={<Send className="size-3.5" />} disabled={pendingForm} onClick={sendForm} title={`Client communication mode: ${mode}`}>
            {pendingForm ? "Form awaiting approval" : formStep?.done ? "Resend onboarding form" : "Send onboarding form"}
          </Button>
          <Button variant="secondary" icon={<Compass className="size-3.5" />} href={`/strategy?new=1&client=${c.id}`}>{info.strategy ? "Open / new strategy" : "Create strategy"}</Button>
          <Button variant="secondary" icon={<Megaphone className="size-3.5" />} onClick={createCampaign}>Create campaign</Button>
        </div>
      )}
      <p className="-mt-2 text-[11px] text-fg-3">Client communication mode: <b className="font-medium text-fg-2">{mode}</b> — {mode === "Approval Required" ? "client-facing sends wait for approval." : mode === "Automatic" ? "sends go out immediately and are logged." : "the AI creates a task; a human sends."}</p>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Onboarding workflow" subtitle="Default checklist + service-specific steps" />
          <ol className="px-2 pb-3">
            {c.onboarding.map((s, i) => {
              const isCurrent = s.key === info.current?.key;
              return (
                <li key={s.key}>
                  <button disabled={!writable} onClick={() => toggle(c.id, s.key)} className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition disabled:cursor-default", writable && "hover:bg-surface-2", isCurrent && "bg-accent-soft/60")}>
                    {s.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className={cn("size-4 shrink-0", isCurrent ? "text-accent" : "text-fg-3")} />}
                    <span className="w-5 shrink-0 text-[11px] tabular-nums text-fg-3">{i + 1}</span>
                    <span className={cn("min-w-0 flex-1 text-[13px]", s.done && "text-fg-3 line-through")}>{s.label}</span>
                    {isCurrent && <Badge tone="accent">Current</Badge>}
                    {s.doneAt && <span className="shrink-0 text-[11px] text-fg-3">{relTime(s.doneAt)}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Status & blockers" subtitle="Derived from the checklist, tasks and strategy" />
            <div className="px-4 pb-4"><InsightList items={guidance} compact /></div>
          </Card>
          <Card>
            <CardHeader title="Workspace" />
            <div className="space-y-2 px-4 pb-4 text-[13px]">
              <div className="flex items-center justify-between"><span className="text-fg-3">Projects</span><span>{clientProjects.map((p) => p.name).join(", ") || "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-3">Open tasks</span><Link href={`/tasks`} className="hover:underline">{openTasks.length} / {clientTasks.length}</Link></div>
              <div className="flex items-center justify-between"><span className="text-fg-3">Campaigns</span><span>{clientCampaigns.length ? `${clientCampaigns.filter((x) => x.status === "Active").length} active · ${clientCampaigns.length} total` : "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-3">Strategy</span><span>{info.strategy ? `${info.strategy.title} · ${info.strategy.status}` : "Not started"}</span></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Service templates" subtitle="Steps added for this client's services" action={<Link href="/settings?tab=onboarding" className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline"><Settings2 className="size-3" /> Edit</Link>} />
            <div className="space-y-3 px-4 pb-4">
              {serviceTemplates.length === 0 && <p className="text-xs text-fg-3">No service-specific templates for {c.services.join(", ")}.</p>}
              {serviceTemplates.map((t) => (
                <div key={t.service}>
                  <p className="mb-1 text-xs font-medium">{t.service}</p>
                  <ul className="space-y-0.5 text-xs text-fg-2">
                    {t.steps.map((st) => {
                      const on = c.onboarding.find((o) => o.label === st);
                      return <li key={st} className="flex items-center gap-1.5">{on?.done ? <CheckCircle2 className="size-3 text-success" /> : <Circle className="size-3 text-fg-3" />}{st}{!on && <span className="text-[10px] text-fg-3">(not in checklist)</span>}</li>;
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const clients = useCRM((s) => s.clients);
  const writable = can(me.role, "onboarding", "write") && me.role !== "client";
  const [view, setView] = useState<"board" | "list">("board");
  const [showDone, setShowDone] = useState(false);

  const inOnboarding = useMemo(() => clients.filter((c) => c.onboarding.some((s) => !s.done)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [clients]);
  const completed = useMemo(() => clients.filter((c) => c.onboarding.length > 0 && c.onboarding.every((s) => s.done)), [clients]);
  const shown = showDone ? [...inOnboarding, ...completed] : inOnboarding;
  const selectedId = params.get("client") ?? shown[0]?.id;
  const selected = clients.find((c) => c.id === selectedId);
  const open = (id: string) => router.replace(`/onboarding?client=${id}`, { scroll: false });

  const stats = useMemo(() => {
    const ages = inOnboarding.map((c) => Math.max(0, -daysBetween(c.createdAt)));
    const blocked = inOnboarding.filter((c) => {
      const d = Math.max(0, -daysBetween(c.createdAt));
      return c.onboarding.some((s) => !s.done && /access/i.test(s.label)) && d >= 3;
    }).length;
    return { active: inOnboarding.length, avgDays: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0, blocked, completed: completed.length };
  }, [inOnboarding, completed]);

  if (me.role === "client") return <Readonly>Your onboarding checklist is shared by your account manager.</Readonly>;

  return (
    <div>
      <PageHeader
        title="Client onboarding"
        description="Deal won → welcome → onboarding form → info, assets, access & tracking → workspace, project & team → strategy → campaign setup → launch."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
            <Button variant={showDone ? "primary" : "secondary"} onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide completed" : "Show completed"}</Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In onboarding" value={stats.active} icon={<UserPlus className="size-3.5" />} />
        <Stat label="Avg. days since won" value={stats.avgDays} hint="target ≤ 21 days" icon={<ClipboardList className="size-3.5" />} tone={stats.avgDays > 21 ? "warning" : undefined} />
        <Stat label="Blocked on access" value={stats.blocked} hint="≥ 3 days without access" icon={<AlertTriangle className="size-3.5" />} tone={stats.blocked ? "danger" : "success"} />
        <Stat label="Launched" value={stats.completed} hint="all steps complete" icon={<Rocket className="size-3.5" />} tone="success" />
      </div>

      {shown.length === 0 ? (
        <Card><EmptyState icon={<Sparkles className="size-5" />} title="No clients in onboarding" description="When a deal is won, the client appears here with its onboarding workflow." action={<Button href="/pipeline">Open pipeline</Button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="min-w-0">
            {view === "board" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {PHASES.map((ph) => {
                  const col = shown.filter((c) => phaseOf(c.onboarding.find((s) => !s.done)?.label) === ph.key && c.onboarding.some((s) => !s.done));
                  return (
                    <div key={ph.key} className="rounded-xl border border-border bg-surface-2/60 p-2">
                      <p className="flex items-center justify-between px-1 pb-2 text-xs font-semibold">{ph.label}<span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-fg-2">{col.length}</span></p>
                      <div className="space-y-2">
                        {col.map((c) => <ClientCard key={c.id} c={c} active={c.id === selectedId} onOpen={() => open(c.id)} />)}
                        {col.length === 0 && <p className="rounded-lg border border-dashed border-border py-4 text-center text-[11px] text-fg-3">—</p>}
                      </div>
                    </div>
                  );
                })}
                {showDone && completed.length > 0 && (
                  <div className="rounded-xl border border-border bg-surface-2/60 p-2 sm:col-span-2">
                    <p className="px-1 pb-2 text-xs font-semibold">Launched</p>
                    <div className="grid gap-2 sm:grid-cols-2">{completed.map((c) => <ClientCard key={c.id} c={c} active={c.id === selectedId} onOpen={() => open(c.id)} />)}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">{shown.map((c) => <ClientCard key={c.id} c={c} active={c.id === selectedId} onOpen={() => open(c.id)} />)}</div>
            )}
          </div>
          <div className="min-w-0">{selected ? <OnboardingDetail key={selected.id} c={selected} writable={writable} /> : <Card><EmptyState title="Select a client" /></Card>}</div>
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingInner />
    </Suspense>
  );
}
