"use client";

import {OnboardingWorkspace} from "@/components/onboarding/OnboardingWorkspace";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Rocket, Sparkles, UserPlus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Client } from "@/lib/types";
import { cn, daysBetween } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, MemberAvatar, PageHeader, Progress, Readonly, Segmented, Stat } from "@/components/ui";

// Deal Won → Welcome email → Onboarding form → Business info → Brand assets → Account access →
// Tracking → Workspace → Project → Tasks → Assign team → Strategy → Campaign setup → Launch
const PHASES = [
  { key: "kickoff", label: "Kick-off", match: /review won|welcome|onboarding form|kick/i },
  { key: "collect", label: "Collecting info", match: /collect|access|asset|tracking|business|pixel|catalog|console|mcc|partner/i },
  { key: "setup", label: "Workspace & team", match: /workspace|project|task|assign|team|knowledge/i },
  { key: "launch", label: "Strategy & launch", match: /strategy|campaign|launch|brief|keyword|audience|creator|content|audit|structure/i },
] as const;
type PhaseKey = (typeof PHASES)[number]["key"];

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
    if (access && days >= 3) blockers.push(`Access verification pending (${days}d since won)`);
    const assets = open(/brand asset/i);
    if (assets && days >= 5) blockers.push("Brand asset review pending");
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
        <Stat label="Onboarding complete" value={stats.completed} hint="all steps complete" icon={<Rocket className="size-3.5" />} tone="success" />
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
                    <p className="px-1 pb-2 text-xs font-semibold">Completed</p>
                    <div className="grid gap-2 sm:grid-cols-2">{completed.map((c) => <ClientCard key={c.id} c={c} active={c.id === selectedId} onOpen={() => open(c.id)} />)}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">{shown.map((c) => <ClientCard key={c.id} c={c} active={c.id === selectedId} onOpen={() => open(c.id)} />)}</div>
            )}
          </div>
          <div className="min-w-0">{selected ? <OnboardingWorkspace key={selected.id} client={selected} writable={writable} /> : <Card><EmptyState title="Select a client" /></Card>}</div>
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

