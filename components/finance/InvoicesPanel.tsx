"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock, IndianRupee, Receipt, Timer } from "lucide-react";
import { billingStatus,balance,receipts,rupeeAmount } from "@/lib/domain/billing";
import { deadlineDay } from "@/lib/domain/projectTasks";
import { useDeadlineToday } from "@/components/tasks/useDeadlineToday";
import { useCRM } from "@/lib/store";
import type { Invoice, PaymentStatus } from "@/lib/types";
import { cn, compactMoney, DAY, fmtShort, money, sum } from "@/lib/utils";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, SearchInput, Select, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { Bars } from "@/components/charts";
import { toast } from "@/components/shell/toast";

const TABS: (PaymentStatus | "All")[] = ["All", "Pending", "Partially Paid", "Paid", "Overdue"];

function PaymentModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const today = useDeadlineToday();  const record = useCRM((s) => s.recordPayment);
  const [amount, setAmount] = useState("");
  const [received,setReceived]=useState(()=>deadlineDay(Date.now()));
  const [reference,setReference]=useState("");
  if (!invoice) return null;
  const pending = balance(invoice);
  const value = amount===""?pending:rupeeAmount(Number(amount));
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
            disabled={!Number.isFinite(value)||value<=0||value>pending||!received||received>today||received<deadlineDay(invoice.issuedAt)}
            onClick={() => {
              if(!record(invoice.id,value,received,reference)){toast("Check the amount and payment date",undefined,"warning");return;}
              toast("Payment recorded", `${money(Math.min(value, pending))} · ${value >= pending ? "Invoice fully paid" : "Partially paid"}`);
              onClose();
            }}
          >
            Record {money(value)}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Amount received (₹)">
          <Input type="number" autoFocus value={amount || ""} placeholder={String(pending)} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <Button key={f} size="xs" onClick={() => setAmount(String(rupeeAmount(pending*f)))}>
              {f === 1 ? "Full" : `${f * 100}%`}
            </Button>
          ))}
        </div>
        <Field label="Payment date"><Input type="date" value={received} onChange={e=>setReceived(e.target.value)}/></Field>
        <Field label="Payment reference"><Input value={reference} maxLength={180} onChange={e=>setReference(e.target.value)}/></Field>
        {receipts(invoice).length>0&&<ul className="space-y-1 text-sm text-fg-2">
          {receipts(invoice).map(payment=><li key={payment.id}>{payment.receivedOn} · {money(payment.amount)} {payment.reference}</li>)}
        </ul>}
      </div>
    </Modal>
  );
}

export function NewInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useDeadlineToday();  const clients = useCRM((s) => s.clients);
  const projects=useCRM(s=>s.projects);
  const [projectId,setProject]=useState("");
  const addInvoice = useCRM((s) => s.addInvoice);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const client = clients.find((c) => c.id === clientId);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(() => new Date(Date.now() + 15 * DAY).toISOString().slice(0, 10));
  const amt = rupeeAmount(amount===""?client?.retainer??0:Number(amount));
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
            disabled={!clientId||!Number.isFinite(amt)||amt<=0||!due||due<today}
            onClick={() => {
              addInvoice({ clientId, projectId:projectId||undefined, amount: amt, issuedAt: new Date().toISOString(), dueDate: due, description: description || `Monthly retainer — ${client?.services.join(", ")}` });
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
          <Select value={clientId} onChange={(e) => {setClientId(e.target.value);setProject("");}}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" hint={client ? `Retainer: ${money(client.retainer)}` : undefined}>
          <Input type="number" value={amount || ""} placeholder={String(client?.retainer ?? "")} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Project" className="col-span-2"><Select value={projectId} onChange={e=>setProject(e.target.value)}><option value="">No project</option>{projects.filter(p=>p.clientId===clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
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
  const today=useDeadlineToday();
  const [tab, setTab] = useState<PaymentStatus | "All">("All");
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [reminder,setReminder]=useState<Invoice>();
  const [history,setHistory]=useState<Invoice>();

  const invoices = useMemo(() => (isClient ? allInvoices.filter((i) => i.clientId === clientId) : allInvoices).map(i=>({...i,status:billingStatus(i,today)})), [allInvoices,isClient,clientId,today]);
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



  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Invoiced" value={compactMoney(stats.invoiced)} hint="all invoices" icon={<Receipt className="size-3.5" />} />
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
            <CardHeader title="Overdue reminders" subtitle="Open a draft for an overdue invoice or use the invoice workflow in Automations." action={<BellRing className="size-4 text-accent" />} />
            <div className="px-4 pb-4"><Button href="/automations" className="min-h-11">Open reminder workflows</Button></div>
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

                    {canWrite && (
                      <Td>
                        <div className="flex justify-end gap-1">
                          {i.paid>0&&<Button className="min-h-11" onClick={()=>setHistory(i)}>Payment history</Button>}
                          {balance(i)>0&&<Button className="min-h-11" onClick={()=>setPaying(i)}>Record payment</Button>}
                          {i.status==="Overdue"&&<Button className="min-h-11" onClick={()=>setReminder(i)}>Draft reminder</Button>}
                        </div>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {reminder&&<Modal open onClose={()=>setReminder(undefined)} title={"Reminder · "+reminder.number}>
        <p className="mb-2 text-sm text-fg-2">Review and copy this draft for your client.</p>
        <textarea aria-label="Payment reminder draft" readOnly rows={5} className="w-full rounded-lg border border-border bg-surface p-3 text-sm" value={`Hello, invoice ${reminder.number} has an outstanding balance of ${money(balance(reminder))}. It was due on ${deadlineDay(reminder.dueDate)}. Please let us know when we can expect payment. Thank you.`}/>
      </Modal>}
      {history&&<Modal open onClose={()=>setHistory(undefined)} title={"Payment history · "+history.number}>
        <ul className="space-y-2 text-sm">{receipts(history).map(p=><li key={p.id}>{p.receivedOn} · {money(p.amount)} {p.reference}</li>)}</ul>
        {history.paid>receipts(history).reduce((total,p)=>total+p.amount,0)&&<p className="mt-2 text-sm text-fg-2">Some earlier payments have no saved receipt date.</p>}
      </Modal>}
      <PaymentModal key={paying?.id ?? "none"} invoice={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
