"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CheckCircle2, Clock, FileText, Plus, Send, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/types";
import { cn, compactMoney, fmtDate, money, pct, relTime } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, CardHeader, Drawer, EmptyState, PageHeader, Readonly, SearchInput, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ProposalGenerator } from "@/components/proposals/ProposalGenerator";
import { ProposalWorkflow } from "@/components/proposals/ProposalWorkflow";
import { proposalContractValue, proposalMonthly, proposalOneTime, proposalTotal } from "@/components/proposals/workflow";

function ProposalsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const proposals = useCRM((s) => s.proposals);
  const deals = useCRM((s) => s.deals);
  const mode = useCRM((s) => s.settings.approvalModes.Proposals);
  const canWrite = can(me.role, "proposals", "write") && me.role !== "client";
  const [status, setStatus] = useState<ProposalStatus | "All">("All");
  const [q, setQ] = useState("");
  const [genOpen, setGenOpen] = useState(() => params.get("new") === "1" && canWrite);
  const openId = params.get("p");
  const setOpen = (id: string | null) => router.replace(id ? `/proposals?p=${id}` : "/proposals", { scroll: false });

  const rows = useMemo(
    () => proposals.filter((p) => (status === "All" || p.status === status) && `${p.company} ${p.title}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [proposals, status, q],
  );
  const counts = useMemo(() => Object.fromEntries(PROPOSAL_STATUSES.map((s) => [s, proposals.filter((p) => p.status === s).length])), [proposals]);
  const stats = useMemo(() => {
    const open = proposals.filter((p) => ["Sent", "Viewed"].includes(p.status));
    const decided = proposals.filter((p) => ["Accepted", "Rejected"].includes(p.status));
    const accepted = proposals.filter((p) => p.status === "Accepted");
    return {
      review: proposals.filter((p) => p.status === "Internal Review" || (p.status === "Draft" && p.approval === "Awaiting")).length,
      awaitingApproval: proposals.filter((p) => p.status === "Internal Review" && p.approval === "Awaiting").length,
      openCount: open.length,
      openValue: open.reduce((a, p) => a + proposalContractValue(p), 0),
      acceptRate: decided.length ? (accepted.length / decided.length) * 100 : 0,
      acceptedValue: accepted.reduce((a, p) => a + proposalContractValue(p), 0),
    };
  }, [proposals]);
  const open = proposals.find((p) => p.id === openId);
  const openDeal = open ? deals.find((d) => d.id === open.dealId) : undefined;

  if (me.role === "client") return <Readonly>Proposals are managed by the Adbibe team.</Readonly>;

  return (
    <div>
      <PageHeader
        title={<>Proposals <AIBadge>Generator</AIBadge></>}
        description="AI-generated proposals from discovery notes, strategy and your price book — reviewed internally before they reach the client."
        actions={canWrite && <Button variant="ai" icon={<Plus className="size-3.5" />} onClick={() => setGenOpen(true)}>New proposal</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In internal review" value={stats.review} hint={`${stats.awaitingApproval} awaiting approval · mode ${mode}`} icon={<ShieldCheck className="size-3.5" />} tone={stats.awaitingApproval ? "warning" : undefined} />
        <Stat label="Out with clients" value={stats.openCount} hint={`${compactMoney(stats.openValue)} year-1 value`} icon={<Send className="size-3.5" />} />
        <Stat label="Acceptance rate" value={pct(stats.acceptRate, 0)} hint="accepted / decided" icon={<TrendingUp className="size-3.5" />} tone="success" />
        <Stat label="Accepted value" value={compactMoney(stats.acceptedValue)} hint={`${counts.Accepted ?? 0} proposals`} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {(["All", ...PROPOSAL_STATUSES] as const).map((s) => (
              <button key={s} onClick={() => setStatus(s)} className={cn("h-7 rounded-md px-2.5 text-xs font-medium", status === s ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2")}>
                {s} <span className="opacity-60 tabular-nums">{s === "All" ? proposals.length : counts[s]}</span>
              </button>
            ))}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Search company…" className="sm:w-60" />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No proposals" description="Generate one from a deal or lead." action={canWrite && <Button variant="ai" icon={<Sparkles className="size-3.5" />} onClick={() => setGenOpen(true)}>Generate proposal</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Proposal</Th>
                <Th className="hidden md:table-cell">Services</Th>
                <Th className="text-right">Monthly</Th>
                <Th className="hidden sm:table-cell text-right">One-time</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Approval</Th>
                <Th className="hidden lg:table-cell">Updated</Th>
                <Th className="hidden lg:table-cell">Expires</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const expired = new Date(p.expiresAt) < new Date() && !["Accepted", "Rejected"].includes(p.status);
                return (
                  <tr key={p.id} className={cn("cursor-pointer hover:bg-surface-2/60", p.id === openId && "bg-accent-soft/40")} onClick={() => setOpen(p.id)}>
                    <Td>
                      <p className="font-medium">{p.company}</p>
                      <p className="text-xs text-fg-3">{p.title}{p.strategySummary ? " · AI" : ""}</p>
                    </Td>
                    <Td className="hidden md:table-cell text-xs text-fg-2 max-w-56 truncate">{[...new Set(p.lines.map((l) => l.service))].join(", ")}</Td>
                    <Td className="text-right tabular-nums font-medium">{money(proposalMonthly(p))}</Td>
                    <Td className="hidden sm:table-cell text-right tabular-nums text-fg-2">{money(proposalOneTime(p))}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td className="hidden md:table-cell"><Badge tone={p.approval === "Approved" ? "success" : p.approval === "Awaiting" ? "warning" : "neutral"}>{p.approval}</Badge></Td>
                    <Td className="hidden lg:table-cell text-xs text-fg-3">{relTime(p.viewedAt ?? p.sentAt ?? p.createdAt)}</Td>
                    <Td className={cn("hidden lg:table-cell text-xs", expired ? "text-danger font-medium" : "text-fg-2")}>{fmtDate(p.expiresAt)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {open && (
        <Drawer open onClose={() => setOpen(null)} width={640} title={open.title} subtitle={<span className="flex items-center gap-2"><StatusBadge status={open.status} /> {open.company} · created {fmtDate(open.createdAt)}</span>}>
          <div className="space-y-5">
            <ProposalWorkflow proposal={open} canWrite={canWrite} />
            <Card>
              <CardHeader title="Investment" subtitle={`Year-1 contract value ${money(proposalContractValue(open))}`} />
              <div className="divide-y divide-border border-t border-border text-[13px]">
                {open.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="min-w-0"><span className="block font-medium">{l.service}</span><span className="block truncate text-xs text-fg-3">{l.description}</span></span>
                    <span className="text-right tabular-nums">{money(l.price)}<span className="block text-[11px] text-fg-3">{l.billing}</span></span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 font-semibold"><span>Total (first invoice)</span><span className="tabular-nums">{money(proposalTotal(open))}</span></div>
              </div>
            </Card>
            {open.strategySummary && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-3">Strategy summary</p>
                <p className="text-[13px] text-fg-2">{open.strategySummary}</p>
              </div>
            )}
            {open.discoveryNotes && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-3">Discovery notes <Badge className="ml-1">Internal</Badge></p>
                <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-xs text-fg-2">{open.discoveryNotes}</p>
              </div>
            )}
            {open.deliverables?.length ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-3">Deliverables</p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg-2">{open.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
              </div>
            ) : null}
            {openDeal && (
              <Link href={`/pipeline?deal=${openDeal.id}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px] hover:bg-surface-2">
                <span>Deal: <b className="font-medium">{openDeal.title}</b></span>
                <span className="flex items-center gap-2 text-xs text-fg-3"><Clock className="size-3" /> {fmtDate(openDeal.expectedClose)} <StatusBadge status={openDeal.stage} /></span>
              </Link>
            )}
          </div>
        </Drawer>
      )}

      {genOpen && (
        <ProposalGenerator
          open
          dealId={params.get("deal") ?? undefined}
          leadId={params.get("lead") ?? undefined}
          onClose={() => { setGenOpen(false); if (params.get("new")) router.replace("/proposals", { scroll: false }); }}
          onCreated={(id) => setTimeout(() => setOpen(id), 0)}
        />
      )}
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <Suspense>
      <ProposalsInner />
    </Suspense>
  );
}
