"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Expense } from "@/lib/types";
import { compactMoney, downloadFile, fmtDate, money, toCSV, uid } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Modal, SearchInput, Select, Stat, Table, Td, Th } from "@/components/ui";
import { Donut, Legend } from "@/components/charts";
import { toast } from "@/components/shell/toast";

export const EXPENSE_CATEGORIES: Expense["category"][] = ["Team", "Freelancer", "Software", "Production", "Influencer", "Media", "Office", "Other"];
const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "all", label: "All time" },
];

function ExpenseModal({ initial, onClose }: { initial: Expense | null; onClose: () => void }) {
  const clients = useCRM((s) => s.clients);
  const upsert = useCRM((s) => s.upsert);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);
  const [e, setE] = useState<Expense>(
    () => initial ?? { id: uid("exp"), date: new Date().toISOString(), category: "Software", vendor: "", amount: 0, description: "", billable: false },
  );
  const set = (p: Partial<Expense>) => setE((x) => ({ ...x, ...p }));
  const save = () => {
    upsert("expenses", e);
    const client = clients.find((c) => c.id === e.clientId)?.company;
    log({ actor: "human", actorId: me, entity: "expense", entityId: e.id, action: initial ? "Edited expense" : "Added expense", detail: `${e.vendor} · ${client ?? "Agency"}`, before: initial ? money(initial.amount) : undefined, after: money(e.amount) });
    toast(initial ? "Expense updated" : "Expense added", `${e.vendor} · ${money(e.amount)}`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit expense" : "Add expense"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!e.vendor.trim() || e.amount <= 0} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={e.date.slice(0, 10)} onChange={(ev) => set({ date: new Date(`${ev.target.value}T12:00:00`).toISOString() })} />
        </Field>
        <Field label="Amount (₹)">
          <Input type="number" min={0} value={e.amount || ""} onChange={(ev) => set({ amount: Number(ev.target.value) })} />
        </Field>
        <Field label="Category">
          <Select value={e.category} onChange={(ev) => set({ category: ev.target.value as Expense["category"] })}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor">
          <Input value={e.vendor} onChange={(ev) => set({ vendor: ev.target.value })} placeholder="e.g. Figma, freelance editor" />
        </Field>
        <Field label="Client" hint="Leave as agency overhead if not client-specific" className="col-span-2">
          <Select value={e.clientId ?? ""} onChange={(ev) => set({ clientId: ev.target.value || undefined, billable: ev.target.value ? e.billable : false })}>
            <option value="">Agency overhead (no client)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="col-span-2">
          <Input value={e.description} onChange={(ev) => set({ description: ev.target.value })} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-[13px]">
          <Checkbox checked={e.billable} onChange={(v) => set({ billable: v && !!e.clientId })} />
          Billable — re-invoice to the client at cost (excluded from margin)
        </label>
        {e.category === "Team" && <p className="col-span-2 text-[11px] text-warning">Salaries already come from each member&apos;s monthly cost in Team — only log one-off team costs (bonuses, training) here.</p>}
      </div>
    </Modal>
  );
}

export function ExpensesPanel({ canWrite }: { canWrite: boolean }) {
  const expenses = useCRM((s) => s.expenses);
  const clients = useCRM((s) => s.clients);
  const remove = useCRM((s) => s.remove);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Expense["category"] | "All">("All");
  const [client, setClient] = useState("All");
  const [billable, setBillable] = useState<"All" | "yes" | "no">("All");
  const [period, setPeriod] = useState("180");
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const [now] = useState(() => Date.now());

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.company])), [clients]);
  const rows = useMemo(() => {
    const since = period === "all" ? 0 : now - Number(period) * 86_400_000;
    return expenses
      .filter((e) => {
        if (new Date(e.date).getTime() < since) return false;
        if (cat !== "All" && e.category !== cat) return false;
        if (client === "agency" ? !!e.clientId : client !== "All" && e.clientId !== client) return false;
        if (billable !== "All" && e.billable !== (billable === "yes")) return false;
        if (q && !`${e.vendor} ${e.description} ${clientName.get(e.clientId ?? "") ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, period, cat, client, billable, q, clientName, now]);

  const summary = useMemo(() => {
    const total = rows.reduce((a, e) => a + e.amount, 0);
    const billableAmt = rows.filter((e) => e.billable).reduce((a, e) => a + e.amount, 0);
    const clientAmt = rows.filter((e) => e.clientId).reduce((a, e) => a + e.amount, 0);
    const byCat = EXPENSE_CATEGORIES.map((c) => ({ name: c, value: rows.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    return { total, billableAmt, clientAmt, overhead: total - clientAmt, byCat };
  }, [rows]);

  const exportCSV = () => {
    downloadFile(
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows.map((e) => ({ date: e.date.slice(0, 10), category: e.category, vendor: e.vendor, client: clientName.get(e.clientId ?? "") ?? "Agency overhead", description: e.description, amount: e.amount, billable: e.billable ? "yes" : "no" }))),
      "text/csv",
    );
    toast("CSV exported", `${rows.length} expenses`);
  };

  const del = (e: Expense) => {
    remove("expenses", e.id);
    log({ actor: "human", actorId: me, entity: "expense", entityId: e.id, action: "Deleted expense", detail: e.vendor, before: money(e.amount), after: "deleted" });
    toast("Expense deleted", e.vendor, "info");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total expenses" value={compactMoney(summary.total)} hint={`${rows.length} entries`} icon={<Receipt className="size-3.5" />} />
        <Stat label="Client direct costs" value={compactMoney(summary.clientAmt)} hint="linked to a client" tone="warning" icon={<Receipt className="size-3.5" />} />
        <Stat label="Billable (re-invoice)" value={compactMoney(summary.billableAmt)} hint="pass-through at cost" tone="success" icon={<Receipt className="size-3.5" />} />
        <Stat label="Agency overhead" value={compactMoney(summary.overhead)} hint="software, office, other" icon={<Receipt className="size-3.5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3 min-w-0">
          <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Search vendor, description…" className="lg:w-56" />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="sm:w-36">
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Select value={cat} onChange={(e) => setCat(e.target.value as Expense["category"] | "All")} className="sm:w-36">
                <option value="All">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <Select value={client} onChange={(e) => setClient(e.target.value)} className="sm:w-40">
                <option value="All">All clients</option>
                <option value="agency">Agency overhead</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                  </option>
                ))}
              </Select>
              <Select value={billable} onChange={(e) => setBillable(e.target.value as "All" | "yes" | "no")} className="sm:w-32">
                <option value="All">Billable: any</option>
                <option value="yes">Billable</option>
                <option value="no">Non-billable</option>
              </Select>
            </div>
            <div className="flex gap-2 lg:ml-auto">
              <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCSV} disabled={!rows.length}>
                CSV
              </Button>
              {canWrite && (
                <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
                  Add expense
                </Button>
              )}
            </div>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Receipt className="size-5" />} title="No expenses match" description="Try a wider period or clear filters." />
          ) : (
            <Table className="max-h-[560px]">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Category</Th>
                  <Th>Client</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Billable</Th>
                  {canWrite && <Th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2">
                    <Td className="whitespace-nowrap text-fg-2">{fmtDate(e.date)}</Td>
                    <Td>
                      <p className="font-medium">{e.vendor}</p>
                      <p className="max-w-64 truncate text-xs text-fg-3">{e.description}</p>
                    </Td>
                    <Td>
                      <Badge>{e.category}</Badge>
                    </Td>
                    <Td>
                      {e.clientId ? (
                        <Link href={`/clients/${e.clientId}`} className="hover:underline">
                          {clientName.get(e.clientId) ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-fg-3">Agency</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{money(e.amount)}</Td>
                    <Td>{e.billable ? <Badge tone="success">Billable</Badge> : <span className="text-xs text-fg-3">—</span>}</Td>
                    {canWrite && (
                      <Td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(e)} className="rounded p-1 text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label="Edit expense">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => del(e)} className="rounded p-1 text-fg-3 hover:bg-surface-3 hover:text-danger" aria-label="Delete expense">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="By category" subtitle="Filtered period" />
          <div className="px-4 pb-4">
            {summary.byCat.length ? (
              <>
                <Donut data={summary.byCat} height={170} fmt={compactMoney} center={<span className="text-sm font-semibold tabular-nums">{compactMoney(summary.total)}</span>} />
                <div className="mt-3">
                  <Legend items={summary.byCat.map((c) => ({ label: c.name, value: compactMoney(c.value) }))} />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-fg-3">No data.</p>
            )}
          </div>
        </Card>
      </div>
      {editing && <ExpenseModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
