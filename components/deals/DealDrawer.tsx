"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ExternalLink, FileText, PartyPopper, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { DEAL_STAGES, SERVICES, type Deal, type PaymentStatus, type Service } from "@/lib/types";
import { cn, fmtDate, money, relTime, sum } from "@/lib/utils";
import { Button, Drawer, Field, Input, Select, StatusBadge, Textarea } from "@/components/ui";
import { ProposalWorkflow } from "@/components/proposals/ProposalWorkflow";
import { toast } from "@/components/shell/toast";

export function ServicePicker({ value, onChange, disabled }: { value: Service[]; onChange: (v: Service[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SERVICES.map((s) => {
        const on = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className={cn("rounded-md border px-2 py-1 text-xs transition", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (v: string) => new Date(`${v}T12:00:00`).toISOString();

function ProposalSection({ deal, canWrite }: { deal: Deal; canWrite: boolean }) {
  const proposals = useCRM((s) => s.proposals);
  const proposal = proposals.find((p) => p.id === deal.proposalId) ?? proposals.find((p) => p.dealId === deal.id);

  if (!proposal)
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center">
        <FileText className="mx-auto size-5 text-fg-3" />
        <p className="mt-1 text-[13px] font-medium">No proposal yet</p>
        <p className="text-xs text-fg-3">The AI generator drafts scope, deliverables, timeline and pricing from this deal.</p>
        {canWrite && (
          <Button className="mt-3" size="sm" variant="ai" icon={<Sparkles className="size-3.5" />} href={`/proposals?new=1&deal=${deal.id}`}>
            Generate proposal
          </Button>
        )}
      </div>
    );

  const total = sum(proposal.lines.map((l) => l.price));
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/proposals?p=${proposal.id}`} className="block truncate text-[13px] font-semibold hover:underline">{proposal.title}</Link>
          <p className="text-xs text-fg-3">
            Created {fmtDate(proposal.createdAt)} · Expires{" "}
            <span className={cn(new Date(proposal.expiresAt) < new Date() && proposal.status !== "Accepted" && "text-danger")}>{fmtDate(proposal.expiresAt)}</span> · {money(total)} first invoice
          </p>
        </div>
        <StatusBadge status={proposal.status} />
      </div>
      <ProposalWorkflow proposal={proposal} canWrite={canWrite} />
    </div>
  );
}

export function DealDrawer({ dealId, onClose }: { dealId: string | null; onClose: () => void }) {
  const deals = useCRM((s) => s.deals);
  const leads = useCRM((s) => s.leads);
  const team = useCRM((s) => s.team);
  const activities = useCRM((s) => s.activities);
  const meetings = useCRM((s) => s.meetings);
  const tasks = useCRM((s) => s.tasks);
  const updateDeal = useCRM((s) => s.updateDeal);
  const moveDeal = useCRM((s) => s.moveDeal);
  const me = useMe();
  const canWrite = can(me.role, "pipeline", "write");
  const deal = deals.find((d) => d.id === dealId);
  const lead = deal?.leadId ? leads.find((l) => l.id === deal.leadId) : undefined;
  const history = useMemo(() => (deal ? activities.filter((a) => a.entityId === deal.id || (deal.proposalId && a.entityId === deal.proposalId) || (deal.leadId && a.entityId === deal.leadId) || (deal.clientId && a.entityId === deal.clientId)).slice(0, 25) : []), [activities, deal]);
  const dealMeetings = useMemo(() => (deal ? meetings.filter((m) => m.dealId === deal.id || (deal.leadId && m.leadId === deal.leadId)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)) : []), [meetings, deal]);
  const dealTasks = useMemo(() => (deal ? tasks.filter((t) => (t.related?.type === "deal" && t.related.id === deal.id) || (deal.leadId && t.related?.type === "lead" && t.related.id === deal.leadId)) : []), [tasks, deal]);
  const actorName = (a: (typeof activities)[number]) => (a.actor === "ai" ? "AI" : a.actor === "system" ? "System" : a.actor === "api" ? "API" : team.find((t) => t.id === a.actorId)?.name ?? "Team");

  if (!deal) return null;
  const up = (patch: Partial<Deal>) => updateDeal(deal.id, patch);

  return (
    <Drawer
      open={!!deal}
      onClose={onClose}
      width={620}
      title={deal.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={deal.stage} /> {money(deal.value)} · {deal.probability}% probability
        </span>
      }
    >
      <div className="space-y-6">
        {deal.stage === "Won" && deal.clientId && (
          <Link href={`/onboarding?client=${deal.clientId}`} className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-3 py-2.5 text-[13px] text-success hover:opacity-90">
            <PartyPopper className="size-4" /> Deal won — client onboarding has started. <span className="ml-auto font-medium">Open onboarding →</span>
          </Link>
        )}
        <section className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <Select
              disabled={!canWrite}
              value={deal.stage}
              onChange={(e) => {
                const stage = e.target.value as Deal["stage"];
                moveDeal(deal.id, stage);
                if (stage === "Won") toast("Deal won 🎉", "Client profile created — onboarding started (see the link in this drawer).");
              }}
            >
              {DEAL_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated value (₹)">
            <Input disabled={!canWrite} type="number" value={deal.value} onChange={(e) => up({ value: Number(e.target.value) })} />
          </Field>
          <Field label={`Probability — ${deal.probability}%`}>
            <input disabled={!canWrite} type="range" min={0} max={100} step={5} value={deal.probability} onChange={(e) => up({ probability: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label="Expected close">
            <Input disabled={!canWrite} type="date" value={toDateInput(deal.expectedClose)} onChange={(e) => e.target.value && up({ expectedClose: fromDateInput(e.target.value) })} />
          </Field>
          <Field label="Assigned to">
            <Select disabled={!canWrite} value={deal.ownerId} onChange={(e) => up({ ownerId: e.target.value })}>
              {team
                .filter((t) => t.role !== "client")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Payment status">
            <Select disabled={!canWrite} value={deal.paymentStatus} onChange={(e) => up({ paymentStatus: e.target.value as PaymentStatus })}>
              {(["Pending", "Partially Paid", "Paid", "Overdue"] as const).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          {deal.stage === "Lost" && (
            <Field label="Lost reason" className="col-span-2">
              <Input disabled={!canWrite} value={deal.lostReason ?? ""} onChange={(e) => up({ lostReason: e.target.value })} placeholder="Budget, timing, competitor…" />
            </Field>
          )}
          <Field label="Services" className="col-span-2">
            <ServicePicker disabled={!canWrite} value={deal.services} onChange={(services) => up({ services })} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea disabled={!canWrite} value={deal.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="Context, objections, next steps…" />
          </Field>
        </section>

        {(lead || deal.clientId) && (
          <section className="flex flex-wrap gap-2">
            {lead && (
              <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2">
                Lead: {lead.name} · {lead.company} <ExternalLink className="size-3" />
              </Link>
            )}
            {deal.clientId && (
              <Link href={`/clients/${deal.clientId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success-soft px-2.5 py-1.5 text-xs text-success">
                Client profile <ExternalLink className="size-3" />
              </Link>
            )}
          </section>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Proposal</h4>
          <ProposalSection deal={deal} canWrite={canWrite} />
        </section>

        {(dealMeetings.length > 0 || dealTasks.length > 0) && (
          <section className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Meetings ({dealMeetings.length})</h4>
              {dealMeetings.slice(0, 4).map((m) => (
                <Link key={m.id} href="/meetings" className="flex items-center justify-between gap-2 py-1 text-[13px] hover:underline">
                  <span className="truncate">{m.title}</span>
                  <span className="shrink-0 text-[11px] text-fg-3">{fmtDate(m.startsAt)}</span>
                </Link>
              ))}
              {dealMeetings.length === 0 && <p className="text-xs text-fg-3">None</p>}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Tasks ({dealTasks.length})</h4>
              {dealTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-1 text-[13px]">
                  <span className={cn("truncate", t.status === "Done" && "text-fg-3 line-through")}>{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
              ))}
              {dealTasks.length === 0 && <p className="text-xs text-fg-3">None</p>}
            </div>
          </section>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Activity timeline</h4>
          {history.length === 0 ? (
            <p className="text-xs text-fg-3">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-2 border-l border-border pl-3">
              {history.map((a) => (
                <li key={a.id} className="relative text-[13px]">
                  <span className={cn("absolute -left-[17px] top-1.5 size-2 rounded-full", a.actor === "ai" ? "bg-accent" : a.actor === "system" ? "bg-info" : "bg-fg-3")} />
                  <span className="font-medium">{a.action}</span>
                  {a.detail && <span className="text-fg-3"> — {a.detail}</span>}
                  <span className="block text-[11px] text-fg-3">
                    {actorName(a)} · {relTime(a.at)}
                    {a.before && a.after && <> · {a.before} → {a.after}</>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  );
}
