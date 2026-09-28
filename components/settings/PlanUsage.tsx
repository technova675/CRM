"use client";

import { useMemo, useState } from "react";
import { Building2, Check, Layers } from "lucide-react";
import { useCRM } from "@/lib/store";
import { PLAN_LIMITS, PLAN_PRICE } from "@/lib/seeds/org";
import { AGENTS } from "@/lib/ai/agents";
import { PLANS, type Organization, type Plan, type UsageKey } from "@/lib/types";
import { cn, compact, fmtDate, money } from "@/lib/utils";
import { AgentChip, Badge, Button, Card, CardHeader, Field, Input, Modal, Progress, Select } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const USAGE_LABEL: Record<UsageKey, { label: string; unit?: string }> = {
  aiCredits: { label: "AI credits" },
  leads: { label: "Leads" },
  clients: { label: "Clients" },
  campaigns: { label: "Campaigns" },
  reports: { label: "Reports" },
  videoMinutes: { label: "Video processing", unit: "min" },
  storageGb: { label: "Storage", unit: "GB" },
  teamMembers: { label: "Team members" },
};
const REGIONS: Organization["region"][] = ["India (Mumbai)", "Singapore", "EU (Frankfurt)", "US (Virginia)"];
const PLAN_BLURB: Record<Plan, string> = {
  Starter: "Freelancers & small studios",
  Growth: "Growing agencies",
  Agency: "Multi-team agencies",
  Enterprise: "Networks & holding groups",
};

const fmtLimit = (n: number, unit?: string) => (n === -1 ? "Unlimited" : `${compact(n)}${unit ? ` ${unit}` : ""}`);

export function PlanUsage({ admin }: { admin: boolean }) {
  const org = useCRM((s) => s.organization);
  const update = useCRM((s) => s.updateOrganization);
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const team = useCRM((s) => s.team);
  const aiTasks = useCRM((s) => s.aiTasks);
  const [pending, setPending] = useState<Plan | null>(null);

  // Live counts from the store where we have them; metered counters otherwise.
  const usage = useMemo<Record<UsageKey, { value: number; live: boolean }>>(
    () => ({
      aiCredits: { value: org.usage.aiCredits, live: false },
      leads: { value: leads.length, live: true },
      clients: { value: clients.length, live: true },
      campaigns: { value: campaigns.length, live: true },
      reports: { value: org.usage.reports, live: false },
      videoMinutes: { value: org.usage.videoMinutes, live: false },
      storageGb: { value: org.usage.storageGb, live: false },
      teamMembers: { value: team.filter((m) => m.role !== "client" && m.status !== "disabled").length, live: true },
    }),
    [org.usage, leads.length, clients.length, campaigns.length, team],
  );

  const byAgent = useMemo(() => {
    const m = new Map<string, { credits: number; runs: number }>();
    aiTasks.forEach((t) => {
      const cur = m.get(t.agent) ?? { credits: 0, runs: 0 };
      m.set(t.agent, { credits: cur.credits + t.credits, runs: cur.runs + 1 });
    });
    return [...m.entries()].map(([agent, v]) => ({ agent, ...v })).sort((a, b) => b.credits - a.credits);
  }, [aiTasks]);
  const maxAgent = byAgent[0]?.credits ?? 1;
  const trackedCredits = byAgent.reduce((a, b) => a + b.credits, 0);

  const overLimits = (p: Plan) => (Object.keys(usage) as UsageKey[]).filter((k) => PLAN_LIMITS[p][k] !== -1 && usage[k].value > PLAN_LIMITS[p][k]);

  const changePlan = (p: Plan) => {
    update({ plan: p, limits: PLAN_LIMITS[p] });
    toast(`Plan changed to ${p}`, p === "Enterprise" ? "Our team will contact you to finalise pricing." : `${money(PLAN_PRICE[p])}/month from the next billing cycle.`);
    setPending(null);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader title="Organization" subtitle="Tenant identity. Region determines where this organization's data is stored." className="px-0 pt-0" action={<Building2 className="size-4 text-accent" />} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organization name">
            <Input value={org.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Slug" hint={`app.adbibe.com/${org.slug}`}>
            <Input value={org.slug} onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
          </Field>
          <Field label="Data region" hint="Changing region triggers a migration">
            <Select value={org.region} onChange={(e) => update({ region: e.target.value as Organization["region"] })}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Billing email">
            <Input type="email" value={org.billingEmail} onChange={(e) => update({ billingEmail: e.target.value })} />
          </Field>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-3">
          <Layers className="mt-0.5 size-3.5 shrink-0" />
          Multi-tenant: each organization has isolated users, clients, leads, campaigns, data, AI context (knowledge base & prompts), integrations and billing. Nothing is shared across organizations.
        </p>
      </Card>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold">Plans</p>
          <p className="text-xs text-fg-3">Renews {fmtDate(org.renewsAt)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const current = org.plan === p;
            return (
              <Card key={p} className={cn("flex flex-col p-4", current && "border-accent ring-2 ring-[var(--ring)]")}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{p}</p>
                  {current && <Badge tone="accent">Current</Badge>}
                </div>
                <p className="text-xs text-fg-3">{PLAN_BLURB[p]}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {p === "Enterprise" ? "Custom" : money(PLAN_PRICE[p])}
                  {p !== "Enterprise" && <span className="text-xs font-normal text-fg-3">/mo</span>}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-fg-2">
                  {(Object.keys(USAGE_LABEL) as UsageKey[]).map((k) => (
                    <li key={k} className="flex items-center gap-1.5">
                      <Check className="size-3 text-success" />
                      <span className="flex-1">{USAGE_LABEL[k].label}</span>
                      <span className="tabular-nums text-fg">{fmtLimit(PLAN_LIMITS[p][k], USAGE_LABEL[k].unit)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-3">
                  {current ? (
                    <Button size="sm" className="w-full" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button size="sm" variant={PLANS.indexOf(p) > PLANS.indexOf(org.plan) ? "primary" : "secondary"} className="w-full" disabled={!admin} onClick={() => setPending(p)}>
                      {p === "Enterprise" ? "Contact sales" : PLANS.indexOf(p) > PLANS.indexOf(org.plan) ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Usage this billing period" subtitle={`Against ${org.plan} plan limits`} />
          <div className="space-y-3 px-4 pb-4">
            {(Object.keys(USAGE_LABEL) as UsageKey[]).map((k) => {
              const limit = org.limits[k];
              const v = usage[k].value;
              const ratio = limit === -1 ? 0 : (v / Math.max(1, limit)) * 100;
              return (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span>
                      {USAGE_LABEL[k].label}
                      <span className="ml-1.5 text-[10px] text-fg-3">{usage[k].live ? "live count" : "metered"}</span>
                    </span>
                    <span className={cn("tabular-nums", ratio >= 100 ? "font-semibold text-danger" : ratio >= 80 ? "text-warning" : "text-fg-2")}>
                      {compact(v)}
                      {USAGE_LABEL[k].unit ? ` ${USAGE_LABEL[k].unit}` : ""} / {fmtLimit(limit, USAGE_LABEL[k].unit)}
                    </span>
                  </div>
                  <Progress value={limit === -1 ? 4 : ratio} tone={ratio >= 100 ? "danger" : ratio >= 80 ? "warning" : "accent"} />
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="AI credits by agent" subtitle={`${compact(trackedCredits)} credits across ${aiTasks.length} recorded AI tasks`} />
          {byAgent.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-fg-3">No AI tasks recorded yet.</p>
          ) : (
            <ul className="space-y-2.5 px-4 pb-4">
              {byAgent.map((a) => {
                const def = AGENTS[a.agent as keyof typeof AGENTS];
                return (
                  <li key={a.agent}>
                    <div className="mb-1 flex items-center justify-between">
                      <AgentChip name={def?.short ?? a.agent} color={def?.color ?? "var(--accent)"} />
                      <span className="text-xs tabular-nums text-fg-2">
                        {a.credits} cr · {a.runs} run{a.runs === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Progress value={(a.credits / maxAgent) * 100} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="px-4 pb-3 text-[11px] text-fg-3">The metered total ({compact(org.usage.aiCredits)}) includes tasks older than the recent AI task history shown here.</p>
        </Card>
      </div>

      {pending && (
        <Modal
          open
          size="sm"
          onClose={() => setPending(null)}
          title={`Switch to ${pending}?`}
          footer={
            <>
              <Button onClick={() => setPending(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => changePlan(pending)}>
                Confirm
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-[13px] text-fg-2">
            <p>
              {org.plan} ({org.plan === "Enterprise" ? "Custom" : `${money(PLAN_PRICE[org.plan])}/mo`}) → {pending} ({pending === "Enterprise" ? "Custom pricing" : `${money(PLAN_PRICE[pending])}/mo`}). Limits update immediately.
            </p>
            {overLimits(pending).length > 0 && (
              <p className="rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                Current usage exceeds the {pending} limits for {overLimits(pending).map((k) => USAGE_LABEL[k].label).join(", ")}. New items will be blocked until usage is below the limit.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
