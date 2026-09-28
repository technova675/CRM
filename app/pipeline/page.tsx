"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, CalendarClock, FileText, KanbanSquare, PartyPopper, Plus, Sparkles, TrendingUp, Trophy, Wallet, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { DEAL_STAGES, PROPOSAL_STATUSES, SERVICES, type Deal, type DealStage, type ProposalStatus, type Service } from "@/lib/types";
import { cn, compactMoney, fmtDate, fmtShort, money, pct, sum } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Field, Input, MemberAvatar, Modal, PageHeader, SearchInput, Segmented, Select, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { DealDrawer, ServicePicker } from "@/components/deals/DealDrawer";

const STAGE_DOT: Record<DealStage, string> = {
  "New Lead": "bg-info",
  Qualified: "bg-accent",
  Contacted: "bg-fg-3",
  Meeting: "bg-warning",
  Proposal: "bg-warning",
  Negotiation: "bg-success/60",
  Won: "bg-success",
  Lost: "bg-danger",
};

function MoveMenu({ deal, onMove }: { deal: Deal; onMove: (s: DealStage) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="grid size-6 place-items-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Move deal to stage" title="Move to…">
        <ArrowRightLeft className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-in absolute right-0 top-7 z-30 w-40 rounded-lg border border-border bg-surface p-1 shadow-pop">
            <p className="px-2 py-1 text-[11px] text-fg-3">Move to</p>
            {DEAL_STAGES.filter((s) => s !== deal.stage).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setOpen(false);
                  onMove(s);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
              >
                <span className={cn("size-1.5 rounded-full", STAGE_DOT[s])} />
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DealCard({ deal, canWrite, onOpen, onMove }: { deal: Deal; canWrite: boolean; onOpen: () => void; onMove: (s: DealStage) => void }) {
  const overdue = !["Won", "Lost"].includes(deal.stage) && new Date(deal.expectedClose) < new Date();
  return (
    <div
      draggable={canWrite}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/deal", deal.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      tabIndex={0}
      role="button"
      className="group cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-card transition hover:border-border-strong hover:shadow-pop active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{deal.company}</p>
          <p className="truncate text-xs text-fg-3">{deal.title.split(" — ")[1] ?? deal.title}</p>
        </div>
        {canWrite && <MoveMenu deal={deal} onMove={onMove} />}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[15px] font-semibold tabular-nums">{compactMoney(deal.value)}</span>
        <span className="text-[11px] text-fg-3 tabular-nums">{deal.probability}%</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${deal.probability}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {deal.services.slice(0, 2).map((s) => (
          <Badge key={s}>{s}</Badge>
        ))}
        {deal.services.length > 2 && <Badge>+{deal.services.length - 2}</Badge>}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className={cn("inline-flex items-center gap-1", overdue ? "text-danger font-medium" : "text-fg-3")}>
          <CalendarClock className="size-3" />
          {fmtShort(deal.expectedClose)}
        </span>
        <span className="flex items-center gap-1.5">
          {deal.stage === "Won" && <StatusBadge status={deal.paymentStatus} />}
          <MemberAvatar id={deal.ownerId} size={20} />
        </span>
      </div>
    </div>
  );
}

function NewDealModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addDeal = useCRM((s) => s.addDeal);
  const leads = useCRM((s) => s.leads);
  const team = useCRM((s) => s.team);
  const me = useMe();
  const [company, setCompany] = useState("");
  const [leadId, setLeadId] = useState("");
  const [value, setValue] = useState(150000);
  const [services, setServices] = useState<Service[]>(["Meta Ads"]);
  const [stage, setStage] = useState<DealStage>("Qualified");
  const [owner, setOwner] = useState(me.id);
  const [close, setClose] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const PROB: Record<DealStage, number> = { "New Lead": 10, Qualified: 20, Contacted: 25, Meeting: 40, Proposal: 60, Negotiation: 80, Won: 100, Lost: 0 };
  const lead = leads.find((l) => l.id === leadId);
  const name = company || lead?.company || "";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New deal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name}
            onClick={() => {
              addDeal({ title: `${name} — ${services[0] ?? "Growth retainer"}`, company: name, leadId: leadId || undefined, value, services, probability: PROB[stage], expectedClose: new Date(`${close}T12:00:00`).toISOString(), ownerId: owner, stage, notes: "", paymentStatus: "Pending" });
              toast("Deal created", name);
              onClose();
            }}
          >
            Create deal
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Linked lead (optional)" className="col-span-2">
          <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">— None —</option>
            {leads
              .filter((l) => !["Won", "Lost"].includes(l.status))
              .slice(0, 300)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company} · {l.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Company" className="col-span-2">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={lead?.company ?? "Company name"} />
        </Field>
        <Field label="Estimated value (₹)">
          <Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        </Field>
        <Field label="Stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
            {DEAL_STAGES.filter((s) => s !== "Won" && s !== "Lost").map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {team
              .filter((t) => t.role !== "client")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Expected close">
          <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} />
        </Field>
        <Field label="Services" className="col-span-2">
          <ServicePicker value={services} onChange={setServices} />
        </Field>
      </div>
    </Modal>
  );
}

function ProposalsView() {
  const router = useRouter();
  const proposals = useCRM((s) => s.proposals);
  const [status, setStatus] = useState<ProposalStatus | "All">("All");
  const [q, setQ] = useState("");
  const rows = useMemo(() => proposals.filter((p) => (status === "All" || p.status === status) && p.company.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [proposals, status, q]);
  const counts = useMemo(() => Object.fromEntries(PROPOSAL_STATUSES.map((s) => [s, proposals.filter((p) => p.status === s).length])), [proposals]);
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {(["All", ...PROPOSAL_STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={cn("h-7 rounded-md px-2.5 text-xs font-medium", status === s ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2")}>
              {s} <span className="opacity-60 tabular-nums">{s === "All" ? proposals.length : counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search company…" className="sm:w-60" />
          <Button size="sm" variant="ai" icon={<Sparkles className="size-3.5" />} href="/proposals">Proposal generator</Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" />} title="No proposals" description="Generate proposals in the Proposal Generator." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Proposal</Th>
              <Th>Services</Th>
              <Th className="text-right">Value</Th>
              <Th>Status</Th>
              <Th>Approval</Th>
              <Th>Sent</Th>
              <Th>Expires</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const expired = new Date(p.expiresAt) < new Date() && !["Accepted", "Rejected"].includes(p.status);
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/proposals?p=${p.id}`)}>
                  <Td>
                    <p className="font-medium">{p.company}</p>
                    <p className="text-xs text-fg-3">{p.title}</p>
                  </Td>
                  <Td className="text-xs text-fg-2">{p.lines.map((l) => l.service).join(", ")}</Td>
                  <Td className="text-right tabular-nums font-medium">{money(sum(p.lines.map((l) => l.price)))}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td>
                    <Badge tone={p.approval === "Approved" ? "success" : p.approval === "Awaiting" ? "warning" : "neutral"}>{p.approval}</Badge>
                  </Td>
                  <Td className="text-fg-2">{fmtDate(p.sentAt)}</Td>
                  <Td className={cn(expired ? "text-danger font-medium" : "text-fg-2")}>{fmtDate(p.expiresAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function PipelineInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("deal");
  const deals = useCRM((s) => s.deals);
  const team = useCRM((s) => s.team);
  const moveDeal = useCRM((s) => s.moveDeal);
  const me = useMe();
  const canWrite = can(me.role, "pipeline", "write");
  const [view, setView] = useState<"board" | "proposals">("board");
  const [owner, setOwner] = useState("all");
  const [service, setService] = useState<Service | "all">("all");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [dragOver, setDragOver] = useState<DealStage | null>(null);
  const [won, setWon] = useState<{ company: string; clientId?: string } | null>(null);

  const setOpen = (id: string | null) => router.replace(id ? `/pipeline?deal=${id}` : "/pipeline", { scroll: false });

  const filtered = useMemo(
    () =>
      deals.filter(
        (d) =>
          (owner === "all" || d.ownerId === owner) &&
          (service === "all" || d.services.includes(service)) &&
          (!q || `${d.company} ${d.title}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [deals, owner, service, q],
  );

  const stats = useMemo(() => {
    const open = filtered.filter((d) => !["Won", "Lost"].includes(d.stage));
    const won = filtered.filter((d) => d.stage === "Won");
    const lost = filtered.filter((d) => d.stage === "Lost");
    return {
      openValue: sum(open.map((d) => d.value)),
      openCount: open.length,
      weighted: sum(open.map((d) => (d.value * d.probability) / 100)),
      winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
      wonValue: sum(won.map((d) => d.value)),
      wonCount: won.length,
    };
  }, [filtered]);

  const handleMove = (deal: Deal, stage: DealStage) => {
    if (deal.stage === stage) return;
    moveDeal(deal.id, stage);
    if (stage === "Won") {
      const clientId = useCRM.getState().deals.find((d) => d.id === deal.id)?.clientId;
      toast(`Deal won: ${deal.company} 🎉`, clientId ? "Client profile created and onboarding automation started." : undefined);
      setWon({ company: deal.company, clientId });
    } else toast(`Moved to ${stage}`, deal.company, "info");
  };

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag deals between stages. Moving a deal to Won creates the client and starts onboarding."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "board", label: "Board" },
                { value: "proposals", label: "Proposals" },
              ]}
            />
            {canWrite && (
              <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setNewOpen(true)}>
                New deal
              </Button>
            )}
          </>
        }
      />

      {won && (
        <div className="animate-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-4 py-2.5 text-[13px] text-success">
          <PartyPopper className="size-4" />
          <span><b>{won.company}</b> won — {won.clientId ? "client created and onboarding started." : "deal closed."}</span>
          {won.clientId && <Link href={`/onboarding?client=${won.clientId}`} className="font-medium underline">Open onboarding →</Link>}
          <button onClick={() => setWon(null)} className="ml-auto rounded p-0.5 hover:bg-success/10" aria-label="Dismiss"><X className="size-3.5" /></button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={compactMoney(stats.openValue)} hint={`${stats.openCount} open deals`} icon={<KanbanSquare className="size-3.5" />} />
        <Stat label="Weighted forecast" value={compactMoney(stats.weighted)} hint="value × probability" icon={<TrendingUp className="size-3.5" />} />
        <Stat label="Win rate" value={pct(stats.winRate, 0)} hint="won / closed" icon={<Trophy className="size-3.5" />} tone="success" />
        <Stat label="Won value" value={compactMoney(stats.wonValue)} hint={`${stats.wonCount} deals`} icon={<Wallet className="size-3.5" />} tone="success" />
      </div>

      {view === "proposals" ? (
        <ProposalsView />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={q} onChange={setQ} placeholder="Search deals…" className="sm:w-64" />
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="sm:w-44">
              <option value="all">All owners</option>
              {team
                .filter((t) => t.role !== "client")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
            <Select value={service} onChange={(e) => setService(e.target.value as Service | "all")} className="sm:w-48">
              <option value="all">All services</option>
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-6 lg:px-6">
            <div className="flex gap-3" style={{ minWidth: DEAL_STAGES.length * 272 }}>
              {DEAL_STAGES.map((stage) => {
                const col = filtered.filter((d) => d.stage === stage).sort((a, b) => b.value - a.value);
                const total = sum(col.map((d) => d.value));
                const weighted = sum(col.map((d) => (d.value * d.probability) / 100));
                return (
                  <div
                    key={stage}
                    onDragOver={(e) => {
                      if (!canWrite) return;
                      e.preventDefault();
                      setDragOver(stage);
                    }}
                    onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(null);
                      const id = e.dataTransfer.getData("text/deal");
                      const deal = deals.find((d) => d.id === id);
                      if (deal) handleMove(deal, stage);
                    }}
                    className={cn("flex w-64 shrink-0 flex-col rounded-xl border bg-surface-2/60 transition", dragOver === stage ? "border-accent bg-accent-soft/60" : "border-border")}
                  >
                    <div className="px-3 pt-3 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", STAGE_DOT[stage])} />
                        <span className="text-[13px] font-semibold">{stage}</span>
                        <span className="rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-fg-2">{col.length}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-fg-3 tabular-nums">
                        {compactMoney(total)}
                        {!["Won", "Lost"].includes(stage) && <> · weighted {compactMoney(weighted)}</>}
                      </p>
                    </div>
                    <div className="flex max-h-[calc(100dvh-340px)] min-h-32 flex-col gap-2 overflow-y-auto px-2 pb-2">
                      {col.map((d) => (
                        <DealCard key={d.id} deal={d} canWrite={canWrite} onOpen={() => setOpen(d.id)} onMove={(s) => handleMove(d, s)} />
                      ))}
                      {col.length === 0 && <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-fg-3">Drop deals here</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <DealDrawer dealId={openId} onClose={() => setOpen(null)} />
      <NewDealModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-xl" />}>
      <PipelineInner />
    </Suspense>
  );
}
