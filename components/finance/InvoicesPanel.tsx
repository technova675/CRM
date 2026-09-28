"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock, IndianRupee, Receipt, Settings2, Timer } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Invoice, PaymentStatus } from "@/lib/types";
import { cn, compactMoney, DAY, fmtShort, money, sum } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { Bars } from "@/components/charts";
import { toast } from "@/components/shell/toast";

const TABS: (PaymentStatus | "All")[] = ["All", "Pending", "Partially Paid", "Paid", "Overdue"];

function PaymentModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const record = useCRM((s) => s.recordPayment);
  const [amount, setAmount] = useState(0);
  if (!invoice) return null;
  const pending = invoice.amount - invoice.paid;
  const value = amount || pending;
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Record payment · ${invoice.number}`}
      subtitle={`${money(pending)} outstanding of ${money(invoice.amount)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={value <= 0}
            onClick={() => {
              record(invoice.id, Math.min(value, pending));
              toast("Payment recorded", `${money(Math.min(value, pending))} · ${value >= pending ? "Invoice fully paid" : "Partially paid"}`);
              onClose();
            }}
          >
            Record {money(Math.min(value, pending))}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Amount received (₹)">
          <Input type="number" autoFocus value={amount || ""} placeholder={String(pending)} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <div className="flex gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} size="xs" onClick={() => setAmount(Math.round(pending * f))}>
              {f === 1 ? "Full" : `${f * 100}%`}
            </Button>
          ))}
        </div>
        <p className="text-xs text-fg-3">
          Connect Razorpay or Stripe in{" "}
          <Link href="/integrations?category=Payments" className="text-accent-text hover:underline">
            Integrations
          </Link>{" "}
          to reconcile payments automatically.
        </p>
      </div>
    </Modal>
  );
}

export function NewInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useCRM((s) => s.clients);
  const addInvoice = useCRM((s) => s.addInvoice);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const client = clients.find((c) => c.id === clientId);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(() => new Date(Date.now() + 15 * DAY).toISOString().slice(0, 10));
  const amt = amount || client?.retainer || 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New invoice"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!clientId || amt <= 0}
            onClick={() => {
              addInvoice({ clientId, amount: amt, issuedAt: new Date().toISOString(), dueDate: new Date(`${due}T12:00:00`).toISOString(), description: description || `Monthly retainer — ${client?.services.join(", ")}` });
              toast("Invoice created", `${client?.company} · ${money(amt)}`);
              onClose();
            }}
          >
            Create invoice
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" className="col-span-2">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" hint={client ? `Retainer: ${money(client.retainer)}` : undefined}>
          <Input type="number" value={amount || ""} placeholder={String(client?.retainer ?? "")} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Description" className="col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={client ? `Monthly retainer — ${client.services.join(", ")}` : ""} />
        </Field>
      </div>
    </Modal>
  );
}

// Invoices, collections and payment reminders. Client-portal users see only their own invoices, read-only.
export function InvoicesPanel({ isClient, clientId, canWrite }: { isClient: boolean; clientId?: string; canWrite: boolean }) {
  const allInvoices = useCRM((s) => s.invoices);
  const clients = useCRM((s) => s.clients);
  const approvalMode = useCRM((s) => s.settings.approvalModes["Payment reminders"]);
  const sendReminder = useCRM((s) => s.sendPaymentReminder);
  const [tab, setTab] = useState<PaymentStatus | "All">("All");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<Invoice | null>(null);

  const invoices = useMemo(() => (isClient ? allInvoices.filter((i) => i.clientId === clientId) : allInvoices), [allInvoices, isClient, clientId]);
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.company])), [clients]);

  const rows = useMemo(
    () =>
      invoices
        .filter((i) => (tab === "All" || i.status === tab) && `${i.number} ${clientName.get(i.clientId) ?? ""}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (a.status === "Overdue" ? -1 : 0) - (b.status === "Overdue" ? -1 : 0) || b.issuedAt.localeCompare(a.issuedAt)),
    [invoices, tab, q, clientName],
  );

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.paidAt);
    const dso = paid.length ? sum(paid.map((i) => (new Date(i.paidAt!).getTime() - new Date(i.issuedAt).getTime()) / DAY)) / paid.length : 0;
    const overdue = invoices.filter((i) => i.status === "Overdue");
    return {
      invoiced: sum(invoices.map((i) => i.amount)),
      collected: sum(invoices.map((i) => i.paid)),
      pending: sum(invoices.filter((i) => i.status !== "Paid").map((i) => i.amount - i.paid)),
      overdue: sum(overdue.map((i) => i.amount - i.paid)),
      overdueCount: overdue.length,
      dso,
    };
  }, [invoices]);

  const monthly = useMemo(() => {
    const out: { month: string; collected: number; outstanding: number }[] = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const inMonth = invoices.filter((i) => {
        const x = new Date(i.issuedAt);
        return `${x.getFullYear()}-${x.getMonth()}` === key;
      });
      out.push({ month: d.toLocaleDateString("en-IN", { month: "short" }), collected: sum(inMonth.map((i) => i.paid)), outstanding: sum(inMonth.map((i) => i.amount - i.paid)) });
    }
    return out;
  }, [invoices]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, t === "All" ? invoices.length : invoices.filter((i) => i.status === t).length])), [invoices]);

  const remind = (inv: Invoice) => {
    sendReminder(inv.id);
    if (approvalMode === "Approval Required") toast("Reminder queued for approval", `${inv.number} — approve it in Automations → Approvals.`, "warning");
    else toast("Payment reminder sent", `${inv.number} · ${clientName.get(inv.clientId)}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Invoiced" value={compactMoney(stats.invoiced)} hint="last 6 months" icon={<Receipt className="size-3.5" />} />
        <Stat label="Collected" value={compactMoney(stats.collected)} hint={`${stats.invoiced ? Math.round((stats.collected / stats.invoiced) * 100) : 0}% collection rate`} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
        <Stat label="Pending" value={compactMoney(stats.pending)} icon={<Clock className="size-3.5" />} tone="warning" />
        <Stat label="Overdue" value={compactMoney(stats.overdue)} hint={`${stats.overdueCount} invoices`} icon={<AlertTriangle className="size-3.5" />} tone="danger" />
        <Stat label="Avg. days to pay" value={`${stats.dso.toFixed(0)}d`} hint="issue → paid" icon={<Timer className="size-3.5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={isClient ? "lg:col-span-3" : "lg:col-span-2"}>
          <CardHeader title="Collections by month" subtitle="Collected vs still outstanding, by invoice month" />
          <div className="px-2 pb-3">
            <Bars
              data={monthly}
              x="month"
              stacked
              fmt={compactMoney}
              series={[
                { key: "collected", label: "Collected", color: "var(--chart-3)" },
                { key: "outstanding", label: "Outstanding", color: "var(--chart-4)" },
              ]}
            />
          </div>
        </Card>
        {!isClient && (
          <Card>
            <CardHeader title="Automated reminders" subtitle="Friendly AI-drafted reminders for overdue invoices" action={<BellRing className="size-4 text-accent" />} />
            <ol className="space-y-2 px-4 pb-3">
              {[
                ["Day 1 overdue", "Gentle nudge with invoice link"],
                ["Day 7 overdue", "Reminder + payment options"],
                ["Day 14 overdue", "Escalate to account manager"],
              ].map(([d, t], i) => (
                <li key={d} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-text">{i + 1}</span>
                  <span className="text-[13px]">
                    <span className="font-medium">{d}</span>
                    <span className="block text-xs text-fg-3">{t}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-xs text-fg-3">
                Mode: <Badge tone={approvalMode === "Automatic" ? "success" : approvalMode === "Manual" ? "neutral" : "warning"}>{approvalMode}</Badge>
              </span>
              <Button href="/settings?tab=ai" size="xs" variant="ghost" icon={<Settings2 className="size-3" />}>
                Approval settings
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("h-7 rounded-md px-2.5 text-xs font-medium", tab === t ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2")}>
                {t} <span className="opacity-60 tabular-nums">{counts[t]}</span>
              </button>
            ))}
          </div>
          {!isClient && <SearchInput value={q} onChange={setQ} placeholder="Search invoice or client…" className="sm:w-64" />}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<IndianRupee className="size-5" />} title="No invoices" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                {!isClient && <Th>Client</Th>}
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Pending</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Paid on</Th>
                <Th>Status</Th>
                {!isClient && <Th className="text-center">Reminders</Th>}
                {canWrite && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const pending = i.amount - i.paid;
                return (
                  <tr key={i.id} className="hover:bg-surface-2">
                    <Td>
                      <p className="font-medium">{i.number}</p>
                      <p className="max-w-48 truncate text-xs text-fg-3">{i.description}</p>
                    </Td>
                    {!isClient && (
                      <Td>
                        <Link href={`/clients/${i.clientId}`} className="hover:underline">
                          {clientName.get(i.clientId) ?? "—"}
                        </Link>
                      </Td>
                    )}
                    <Td className="text-right tabular-nums">{money(i.amount)}</Td>
                    <Td className="text-right tabular-nums text-fg-2">{money(i.paid)}</Td>
                    <Td className={cn("text-right tabular-nums font-medium", pending > 0 && (i.status === "Overdue" ? "text-danger" : "text-warning"))}>{money(pending)}</Td>
                    <Td className="text-fg-2">{fmtShort(i.issuedAt)}</Td>
                    <Td className={cn(i.status === "Overdue" ? "text-danger" : "text-fg-2")}>{fmtShort(i.dueDate)}</Td>
                    <Td className="text-fg-2">{fmtShort(i.paidAt)}</Td>
                    <Td>
                      <StatusBadge status={i.status} />
                    </Td>
                    {!isClient && <Td className="text-center tabular-nums text-fg-2">{i.remindersSent}</Td>}
                    {canWrite && (
                      <Td>
                        {i.status !== "Paid" && (
                          <div className="flex justify-end gap-1">
                            <Button size="xs" onClick={() => setPaying(i)}>
                              Record
                            </Button>
                            <Button size="xs" variant="ghost" icon={<BellRing className="size-3" />} onClick={() => remind(i)} title="Send payment reminder">
                              Remind
                            </Button>
                          </div>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <PaymentModal key={paying?.id ?? "none"} invoice={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
