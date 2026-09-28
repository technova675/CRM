"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Activity, Check, HelpCircle, Lightbulb, Rocket, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { AGENTS } from "@/lib/ai/agents";
import { delta, homeSnapshot } from "@/lib/ai/command";
import { cn, compactMoney } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, InsightTag } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const PRIO = { High: 0, Medium: 1, Low: 2 } as const;

function Panel({ n, title, question, icon, children, prompts, onAsk }: { n: number; title: string; question: string; icon: ReactNode; children: ReactNode; prompts: string[]; onAsk: (q: string) => void }) {
  return (
    <Card className="flex min-w-0 flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-text">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">
            {n}. {title}
          </p>
          <p className="text-[13px] font-semibold">{question}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2">{children}</div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
        {prompts.map((p) => (
          <button key={p} onClick={() => onAsk(p)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-2 hover:border-accent hover:text-accent-text">
            {p}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Delta({ label, value, d, invert }: { label: string; value: string; d: number; invert?: boolean }) {
  const good = invert ? d <= 0 : d >= 0;
  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <p className="text-[11px] text-fg-3">{label}</p>
      <p className="text-[15px] font-semibold tabular-nums">{value}</p>
      <p className={cn("text-[11px] font-medium tabular-nums", good ? "text-success" : "text-danger")}>
        {d >= 0 ? "↑" : "↓"} {Math.abs(d).toFixed(0)}% vs prev 30d
      </p>
    </div>
  );
}

export function HomePanels({ onAsk }: { onAsk: (q: string) => void }) {
  const me = useMe();
  const state = useCRM((s) => s);
  const act = useCRM((s) => s.actOnRecommendation);
  const snap = useMemo(() => homeSnapshot(state, me), [state, me]);
  const writable = can(me.role, "performance", "write") || can(me.role, "campaigns", "write");
  const recs = useMemo(() => [...snap.recommendations].sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || b.createdAt.localeCompare(a.createdAt)), [snap.recommendations]);
  const whys = recs.filter((r) => r.why && (r.status === "New" || r.status === "Awaiting Approval")).slice(0, 3);
  const todo = recs.filter((r) => r.status === "New").slice(0, 4);
  const pendingApprovals = state.approvals.filter((a) => a.status === "pending").length;
  const running = state.aiTasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const awaiting = state.aiTasks.filter((t) => t.status === "awaiting_approval").length;
  const autos = state.automations.filter((a) => a.enabled);
  const aiTasksOpen = state.tasks.filter((t) => t.createdBy !== "human" && t.status !== "Done").length;
  const p = snap.perf;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Panel n={1} title="What is happening" question="Key metrics & anomalies" icon={<Activity className="size-3.5" />} onAsk={onAsk} prompts={["Compare this month's performance with last month.", "Which campaigns need attention?"]}>
        {snap.access.media ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
              <Delta label="Spend" value={compactMoney(p.curr.spend)} d={delta(p.curr.spend, p.prev.spend)} />
              <Delta label="Revenue" value={compactMoney(p.curr.revenue)} d={delta(p.curr.revenue, p.prev.revenue)} />
              <Delta label="ROAS" value={`${p.curr.roas.toFixed(2)}x`} d={delta(p.curr.roas, p.prev.roas)} />
              <Delta label="CPA" value={compactMoney(p.curr.cpa)} d={delta(p.curr.cpa, p.prev.cpa)} invert />
            </div>
            {snap.anomalies.map((a) => (
              <Link key={a.id} href={a.href} className="flex items-start gap-2 rounded-lg px-1 py-1 text-xs hover:bg-surface-2">
                <Badge tone="warning">Anomaly</Badge>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">{a.label}</span> <span className="text-fg-3">· {a.text}</span>
                </span>
              </Link>
            ))}
            <p className="text-[11px] text-fg-3">Source: campaign metrics, last 30 vs previous 30 days</p>
          </>
        ) : (
          <p className="text-xs text-fg-3">Campaign performance isn&apos;t available for your role.</p>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {snap.access.leads && <Badge tone="info">{snap.followUpsDue} follow-ups due</Badge>}
          {snap.access.payments && <Badge tone={snap.overdueInvoices.length ? "danger" : "success"}>{snap.overdueInvoices.length} overdue invoices</Badge>}
          {snap.access.clients && <Badge tone={snap.atRisk ? "warning" : "success"}>{snap.atRisk} clients not healthy</Badge>}
        </div>
      </Panel>

      <Panel n={2} title="Why" question="AI explanations" icon={<HelpCircle className="size-3.5" />} onAsk={onAsk} prompts={["Find campaigns with rising CPA.", "Which clients are underperforming?"]}>
        {whys.length ? (
          whys.map((r) => (
            <div key={r.id} className="space-y-1 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-1.5">
                <AgentChip name={AGENTS[r.agent].short} color={AGENTS[r.agent].color} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.title}</span>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-fg-2">
                <InsightTag kind="data" />
                <span>
                  {r.finding}
                  {r.evidence[0] && <span className="text-[11px] text-fg-3"> · {r.evidence[0].source}</span>}
                </span>
              </p>
              <p className="flex items-start gap-1.5 text-xs text-fg-2">
                <InsightTag kind="assumption" />
                <span>{r.why}</span>
              </p>
            </div>
          ))
        ) : (
          <p className="text-xs text-fg-3">No open AI explanations yet. Ask the media agent to analyse today&apos;s performance to generate findings with reasoning.</p>
        )}
      </Panel>

      <Panel n={3} title="What should we do" question="Top recommendations" icon={<Lightbulb className="size-3.5" />} onAsk={onAsk} prompts={["What should the media team optimize today?", "Which clients can we upsell?", "Which clients are at risk?"]}>
        {todo.length ? (
          todo.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Badge tone={r.priority === "High" ? "danger" : r.priority === "Medium" ? "warning" : "neutral"}>{r.priority}</Badge>
                  <span className="truncate text-xs font-medium">{r.title}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-fg-3">{r.recommendation}</p>
                {r.impact && <p className="mt-0.5 text-[11px] text-fg-3">Impact: {r.impact}</p>}
              </div>
              {writable && (
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { act(r.id, "approve"); toast("Recommendation approved", "Executed according to your approval settings."); }} className="grid size-7 place-items-center rounded-md border border-border text-success hover:bg-success-soft" aria-label="Approve" title="Approve">
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={() => act(r.id, "dismiss")} className="grid size-7 place-items-center rounded-md border border-border text-fg-3 hover:bg-surface-2" aria-label="Dismiss" title="Dismiss">
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-fg-3">No new recommendations.</p>
            {snap.access.media && (
              <Button size="xs" variant="ai" onClick={() => onAsk("What should the media team optimize today?")}>
                Run today&apos;s media analysis
              </Button>
            )}
          </div>
        )}
      </Panel>

      <Panel n={4} title="How do we execute" question="Automation + human approval" icon={<Rocket className="size-3.5" />} onAsk={onAsk} prompts={["Show me all leads that need follow-up.", "Create a performance summary."]}>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/automations?tab=approvals" className="rounded-lg border border-border px-2.5 py-2 hover:bg-surface-2">
            <p className="text-[11px] text-fg-3">Pending approvals</p>
            <p className={cn("text-[15px] font-semibold tabular-nums", pendingApprovals && "text-warning")}>{pendingApprovals}</p>
          </Link>
          <div className="rounded-lg border border-border px-2.5 py-2">
            <p className="text-[11px] text-fg-3">AI tasks running</p>
            <p className="text-[15px] font-semibold tabular-nums">
              {running}
              {awaiting > 0 && <span className="ml-1 text-[11px] font-normal text-warning">+{awaiting} awaiting approval</span>}
            </p>
          </div>
          <Link href="/automations" className="rounded-lg border border-border px-2.5 py-2 hover:bg-surface-2">
            <p className="text-[11px] text-fg-3">Active automations</p>
            <p className="text-[15px] font-semibold tabular-nums">
              {autos.length}
              <span className="ml-1 text-[11px] font-normal text-fg-3">{autos.reduce((a, x) => a + x.runs, 0)} runs</span>
            </p>
          </Link>
          <Link href="/tasks" className="rounded-lg border border-border px-2.5 py-2 hover:bg-surface-2">
            <p className="text-[11px] text-fg-3">Open AI / automation tasks</p>
            <p className="text-[15px] font-semibold tabular-nums">{aiTasksOpen}</p>
          </Link>
        </div>
        <p className="text-[11px] text-fg-3">
          Task creation mode: <span className="font-medium text-fg-2">{state.settings.approvalModes["Task creation"]}</span> · Campaign changes: <span className="font-medium text-fg-2">{state.settings.approvalModes["Campaign changes"]}</span>
        </p>
      </Panel>
    </div>
  );
}
