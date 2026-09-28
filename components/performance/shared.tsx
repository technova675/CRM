"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, Plug, ShieldCheck, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Recommendation } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { AD_PLATFORMS, PLATFORM_INTEGRATION, PLATFORM_LABEL, fmtChange, type AdPlatform, type AdSignal } from "@/lib/ai/media";
import { cn, relTime } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, InsightList, StatusBadge, type Tone } from "@/components/ui";
import { toast } from "@/components/shell/toast";

// ---------- Signals ----------
export const SIGNAL_TONE: Record<AdSignal, Tone> = { Winner: "success", Scaling: "accent", Loser: "danger", Fatigue: "warning", "Rising CPA": "warning" };
export function SignalBadges({ signals }: { signals: AdSignal[] }) {
  if (!signals.length) return <span className="text-xs text-fg-3">Steady</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((s) => (
        <Badge key={s} tone={SIGNAL_TONE[s]}>{s}</Badge>
      ))}
    </div>
  );
}

// ---------- Metric tile with WoW delta ----------
export function DeltaText({ value, lowerBetter, className }: { value: number; lowerBetter?: boolean; className?: string }) {
  if (!Number.isFinite(value)) return <span className={cn("text-fg-3", className)}>—</span>;
  const good = lowerBetter ? value <= 0 : value >= 0;
  return <span className={cn("tabular-nums font-medium", Math.abs(value) < 0.5 ? "text-fg-3" : good ? "text-success" : "text-danger", className)}>{fmtChange(value)}</span>;
}
export function MetricTile({ label, value, delta, lowerBetter, hint }: { label: string; value: string; delta?: number; lowerBetter?: boolean; hint?: string }) {
  return (
    <div className="bg-surface p-3 min-w-0">
      <p className="text-[11px] text-fg-3 truncate" title={hint}>{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums truncate">{value}</p>
      {delta !== undefined && (
        <p className="text-[11px]">
          <DeltaText value={delta} lowerBetter={lowerBetter} /> <span className="text-fg-3">WoW</span>
        </p>
      )}
    </div>
  );
}

// ---------- Connected platforms ----------
export function useConnectedKeys() {
  const integrations = useCRM((s) => s.integrations);
  return useMemo(() => integrations.filter((i) => i.status === "connected").map((i) => i.key), [integrations]);
}

export function PlatformStatusGrid({ adCounts }: { adCounts: Partial<Record<AdPlatform, number>> }) {
  const integrations = useCRM((s) => s.integrations);
  return (
    <Card>
      <CardHeader title="Connected ad platforms" subtitle="Data freshness from the integration sync" action={<Link href="/integrations" className="text-xs text-accent-text hover:underline inline-flex items-center gap-1">Manage <ExternalLink className="size-3" /></Link>} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-border border-t border-border rounded-b-xl overflow-hidden">
        {AD_PLATFORMS.map((p) => {
          const it = integrations.find((i) => i.key === PLATFORM_INTEGRATION[p]);
          const status = it?.status ?? "available";
          const n = adCounts[p] ?? 0;
          return (
            <div key={p} className="bg-surface p-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium truncate">{PLATFORM_LABEL[p]}</p>
                <Plug className={cn("size-3.5 shrink-0", status === "connected" ? "text-success" : status === "error" ? "text-danger" : "text-fg-3")} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <StatusBadge status={status} />
              </div>
              <p className="mt-1.5 text-[11px] text-fg-3">
                {status === "connected" ? `Synced ${relTime(it?.lastSyncAt ?? it?.connectedAt)}` : n ? "Sample data — connect to sync live" : "Not connected"}
                {n > 0 && ` · ${n} ads`}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- Approval mode panel (read-only) ----------
export function useSpendMode() {
  const changes = useCRM((s) => s.settings.approvalModes["Campaign changes"]);
  const recs = useCRM((s) => s.settings.approvalModes["Campaign recommendations"]);
  const allow = useCRM((s) => s.settings.allowAutonomousSpendChanges);
  const effective = changes === "Automatic" && !allow ? "Approval Required" : changes;
  return { changes, recs, allow, effective };
}

export function ModePanel() {
  const { changes, recs, allow, effective } = useSpendMode();
  const approvals = useCRM((s) => s.approvals);
  const pending = approvals.filter((a) => a.status === "pending" && a.kind === "Campaign changes").length;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-md p-1.5 bg-accent-soft text-accent-text"><ShieldCheck className="size-4" /></span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13px] font-semibold">AI Recommendation → Human Approval → Execution</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
            <span>Campaign changes:</span>
            <Badge tone={effective === "Automatic" ? "danger" : effective === "Manual" ? "neutral" : "warning"}>{effective}</Badge>
            {changes === "Automatic" && !allow && <span className="text-fg-3">(set to Automatic, held by safety switch)</span>}
            <span className="ml-2">Other recommendations:</span>
            <Badge tone="neutral">{recs}</Badge>
          </div>
          <p className="text-xs text-fg-3">
            Autonomous spend changes: <span className={cn("font-medium", allow ? "text-danger" : "text-success")}>{allow ? "allowed by admin" : "off"}</span> ·{" "}
            <Link href="/settings?tab=ai" className="text-accent-text hover:underline">Change in AI settings</Link>
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
        <span className="text-xs text-fg-2"><span className="font-semibold tabular-nums">{pending}</span> campaign change{pending === 1 ? "" : "s"} awaiting approval</span>
        <Button size="xs" href="/automations?tab=approvals">Open approvals</Button>
      </div>
    </Card>
  );
}

// ---------- Recommendation card ----------
const PRIORITY_TONE = { High: "danger", Medium: "warning", Low: "neutral" } as const;
const STATUS_TONE: Record<Recommendation["status"], Tone> = { New: "info", "Awaiting Approval": "warning", Approved: "accent", Executed: "success", Dismissed: "neutral" };

function approveLabel(r: Recommendation, spendMode: string, recMode: string) {
  const type = r.action?.type ?? "none";
  const spend = type === "budget_change" || type === "pause_ad";
  const mode = spend ? spendMode : recMode;
  if (mode === "Manual") return "Accept → create task";
  if (spend && mode === "Approval Required") return "Send for approval";
  if (type === "budget_change") return "Approve & change budget";
  if (type === "pause_ad") return "Approve & pause ad";
  return "Approve & create task";
}

export function RecommendationCard({ rec, writable, defaultOpen, clientName, campaignName }: { rec: Recommendation; writable: boolean; defaultOpen?: boolean; clientName?: string; campaignName?: string }) {
  const act = useCRM((s) => s.actOnRecommendation);
  const { effective, recs } = useSpendMode();
  const [open, setOpen] = useState(!!defaultOpen);
  const agent = AGENTS[rec.agent];
  const actionable = rec.status === "New";
  const decide = (d: "approve" | "dismiss") => {
    act(rec.id, d);
    const after = useCRM.getState().recommendations.find((x) => x.id === rec.id)?.status;
    toast(
      d === "dismiss" ? "Recommendation dismissed" : after === "Awaiting Approval" ? "Sent for approval" : after === "Approved" ? "Task created for manual execution" : "Recommendation executed",
      d === "approve" && after === "Awaiting Approval" ? "Approve it in Automations → Approvals to apply the change." : rec.title,
      d === "dismiss" ? "info" : after === "Awaiting Approval" ? "warning" : "success",
    );
  };
  const insight = [
    ...(rec.why ? [{ kind: "assumption" as const, text: `Why: ${rec.why}` }] : []),
    ...(rec.assumptions ?? []).map((a) => ({ kind: "assumption" as const, text: a })),
    { kind: "recommendation" as const, text: rec.recommendation },
    ...(rec.test ? [{ kind: "recommendation" as const, text: `Test: ${rec.test}` }] : []),
  ];
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge tone={PRIORITY_TONE[rec.priority]} dot>{rec.priority}</Badge>
            <Badge tone="neutral">{rec.category}</Badge>
            <Badge tone={STATUS_TONE[rec.status]}>{rec.status}</Badge>
            {agent && <AgentChip name={agent.short} color={agent.color} />}
          </div>
          <p className="text-[13px] font-semibold leading-snug">{rec.title}</p>
          <p className="text-[11px] text-fg-3 mt-0.5 truncate">
            {[clientName, campaignName].filter(Boolean).join(" · ")}
            {rec.resolvedAt ? ` · resolved ${relTime(rec.resolvedAt)}` : ` · ${relTime(rec.createdAt)}`}
          </p>
        </div>
        <button onClick={() => setOpen(!open)} className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-fg-2 leading-relaxed">{rec.finding}</p>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {rec.evidence.map((e, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-2.5 py-1.5 text-fg-3 whitespace-nowrap align-top">{e.label}</td>
                    <td className="px-2.5 py-1.5 font-medium tabular-nums">{e.value}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-fg-3 hidden sm:table-cell">{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InsightList items={insight} compact />
          {rec.impact && <p className="text-xs text-fg-3"><Badge tone="warning">Estimate</Badge> {rec.impact.replace(/^Estimate:\s*/, "")}</p>}
          {rec.action && rec.action.type !== "none" && (
            <p className="text-xs text-fg-2">Proposed action: <span className="font-medium">{rec.action.label ?? rec.action.type}</span></p>
          )}
        </div>
      )}
      {actionable && writable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="xs" variant="primary" icon={<Check className="size-3" />} onClick={() => decide("approve")}>{approveLabel(rec, effective, recs)}</Button>
          <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => decide("dismiss")}>Dismiss</Button>
          {!open && <button onClick={() => setOpen(true)} className="text-xs text-accent-text hover:underline">Evidence</button>}
        </div>
      )}
      {rec.status === "Awaiting Approval" && (
        <p className="mt-3 text-xs text-fg-3">Waiting for a human in <Link href="/automations?tab=approvals" className="text-accent-text hover:underline">Automations → Approvals</Link>. Nothing changes on the ad platform until then.</p>
      )}
    </Card>
  );
}
