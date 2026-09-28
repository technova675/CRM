"use client";

import { useMemo, useState } from "react";
import { Check, HeartPulse, Sparkles, TrendingUp, TriangleAlert, X } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Client, InsightItem, Recommendation } from "@/lib/types";
import { AGENTS } from "@/lib/ai/agents";
import { runAgentJob } from "@/lib/ai/client";
import { clientHealth } from "@/lib/ai/client-success";
import { cn, relTime, uid } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, EmptyState, InsightLegend, InsightList, Progress, StatusBadge } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { useClientHealth, useHealthData } from "./useClientHealth";

export function HealthRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "var(--success)" : score >= 55 ? "var(--warning)" : "var(--danger)";
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute text-lg font-semibold tabular-nums">{score}</span>
    </span>
  );
}

export function ClientInsights({ client, writable }: { client: Client; writable: boolean }) {
  const health = useClientHealth(client);
  const data = useHealthData();
  const allRecs = useCRM((s) => s.recommendations);
  const act = useCRM((s) => s.actOnRecommendation);
  const [busy, setBusy] = useState(false);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [out, setOut] = useState<InsightItem[] | null>(null);
  const recs = useMemo(() => allRecs.filter((r) => r.clientId === client.id && (r.status === "New" || r.status === "Awaiting Approval")), [allRecs, client.id]);

  if (!health) return null;

  const run = async () => {
    setBusy(true);
    const res = await runAgentJob({ agent: "client_success", title: `Client health check — ${client.company}`, clientId: client.id, local: () => clientHealth(client, data).insights });
    setBusy(false);
    if (res) {
      setOut(res);
      setRanAt(new Date().toISOString());
    }
  };

  const toRecommendations = () => {
    const now = new Date().toISOString();
    const rs: Recommendation[] = health.upsell.map((u) => ({
      id: uid("rec"),
      agent: "client_success",
      clientId: client.id,
      title: `${u.title} — ${client.company}`,
      category: "Upsell",
      finding: u.reason,
      evidence: [
        { label: "Health score", value: `${health.score}/100`, source: "Client Success engine" },
        { label: "30-day ROAS", value: `${health.metrics.roas30.toFixed(2)}x`, source: "Ad platforms · last 30 days" },
      ],
      assumptions: ["Fit is based on industry benchmarks and current performance — confirm budget appetite with the client."],
      recommendation: `Prepare a ${u.service ?? "growth"} proposal and raise it at the next review call.`,
      priority: u.kind === "headroom" ? "High" : "Medium",
      impact: "Estimate — depends on client budget",
      status: "New",
      action: { type: "create_task", label: `Prepare upsell: ${u.title} — ${client.company}` },
      createdAt: now,
    }));
    if (health.churnReasons.length >= 2)
      rs.push({
        id: uid("rec"),
        agent: "client_success",
        clientId: client.id,
        title: `Retention plan — ${client.company}`,
        category: "Retention",
        finding: `Churn signals: ${health.churnReasons.join("; ")}.`,
        evidence: health.factors.filter((f) => f.points / f.max < 0.5).map((f) => ({ label: f.label, value: f.reason, source: "Client Success engine" })),
        recommendation: "Book a review call with a recovery plan and fix the weakest health factors first.",
        priority: health.score < 50 ? "High" : "Medium",
        status: "New",
        action: { type: "create_task", label: `Retention call — ${client.company}` },
        createdAt: now,
      });
    useCRM.getState().addRecommendations(rs);
    toast(`${rs.length} recommendation${rs.length === 1 ? "" : "s"} created`, "Approve below or in Performance → Recommendations.", "ai");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <HealthRing score={health.score} size={84} />
            <div>
              <p className="text-xs text-fg-3">Client health</p>
              <StatusBadge status={health.band} />
              <p className="mt-1 text-[11px] text-fg-3">Computed · manual label: {client.health}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {health.factors.map((f) => {
              const r = f.points / f.max;
              return (
                <li key={f.key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="tabular-nums text-fg-3">
                      {f.points}/{f.max}
                    </span>
                  </div>
                  <Progress value={r * 100} tone={r >= 0.7 ? "success" : r >= 0.4 ? "warning" : "danger"} />
                  <p className="mt-0.5 text-[11px] text-fg-3">{f.reason}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Client Success agent"
              subtitle={ranAt ? `Last run ${relTime(ranAt)}` : "Health, churn risk and upsell — from live CRM data"}
              action={
                <div className="flex items-center gap-2">
                  <AgentChip name={AGENTS.client_success.short} color={AGENTS.client_success.color} className="hidden sm:inline-flex" />
                  <Button size="xs" variant="ai" loading={busy} onClick={run} icon={<Sparkles className="size-3" />}>
                    Run health check
                  </Button>
                </div>
              }
            />
            <div className="space-y-3 px-4 pb-4">
              <InsightList items={out ?? health.insights} />
              <InsightLegend />
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Churn risk" action={<TriangleAlert className={cn("size-4", health.churnReasons.length ? "text-warning" : "text-fg-3")} />} />
              <div className="px-4 pb-4">
                {health.churnReasons.length ? (
                  <ul className="space-y-1.5 text-[13px] text-fg-2">
                    {health.churnReasons.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-3">No churn signals detected.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Upsell opportunities"
                action={
                  writable && (health.upsell.length > 0 || health.churnReasons.length >= 2) ? (
                    <Button size="xs" variant="ghost" icon={<TrendingUp className="size-3" />} onClick={toRecommendations}>
                      Create recs
                    </Button>
                  ) : undefined
                }
              />
              <div className="px-4 pb-4">
                {health.upsell.length ? (
                  <ul className="space-y-2">
                    {health.upsell.map((u) => (
                      <li key={u.title} className="text-[13px]">
                        <p className="flex items-center gap-1.5 font-medium">
                          {u.title} <Badge tone={u.kind === "headroom" ? "success" : "accent"}>{u.kind === "headroom" ? "ROAS headroom" : "Service fit"}</Badge>
                        </p>
                        <p className="text-xs text-fg-3">{u.reason}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-fg-3">No upsell signals right now.</p>
                )}
                {client.upsellNotes && <p className="mt-3 border-t border-border pt-2 text-xs text-fg-2">Notes: {client.upsellNotes}</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Open AI recommendations" subtitle="Approve → executes per approval mode · Dismiss → archived" action={<HeartPulse className="size-4 text-fg-3" />} />
        {recs.length === 0 ? (
          <EmptyState title="No open recommendations for this client" />
        ) : (
          <ul className="divide-y divide-border">
            {recs.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    {r.title}
                    <Badge tone={r.priority === "High" ? "danger" : r.priority === "Medium" ? "warning" : "neutral"}>{r.priority}</Badge>
                    <Badge>{r.category}</Badge>
                    <AgentChip name={AGENTS[r.agent].short} color={AGENTS[r.agent].color} />
                  </p>
                  <p className="mt-0.5 text-xs text-fg-2">{r.finding}</p>
                  <p className="mt-0.5 text-xs text-fg-3">→ {r.recommendation}</p>
                </div>
                {r.status === "Awaiting Approval" ? (
                  <Badge tone="warning">Awaiting approval</Badge>
                ) : (
                  writable && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="xs" variant="ghost" icon={<X className="size-3" />} onClick={() => act(r.id, "dismiss")}>
                        Dismiss
                      </Button>
                      <Button size="xs" icon={<Check className="size-3" />} onClick={() => { act(r.id, "approve"); toast("Recommendation approved", r.title); }}>
                        Approve
                      </Button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
