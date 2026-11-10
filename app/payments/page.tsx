"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Plus } from "lucide-react";
import { useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button, PageHeader, Tabs } from "@/components/ui";
import { BillingResults } from "@/components/finance/BillingResults";
import { RetainersPanel } from "@/components/finance/RetainersPanel";
import { InvoicesPanel, NewInvoiceModal } from "@/components/finance/InvoicesPanel";
import { OverviewPanel } from "@/components/finance/OverviewPanel";
import { ExpensesPanel } from "@/components/finance/ExpensesPanel";
import { ProfitabilityPanel } from "@/components/finance/ProfitabilityPanel";
import { ForecastPanel } from "@/components/finance/ForecastPanel";
import { useFinance } from "@/components/finance/useFinance";

type Tab = "overview" | "retainers" | "invoices" | "expenses" | "profitability" | "forecast";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "retainers", label: "Retainers" },
  { value: "invoices", label: "Invoices" },
  { value: "expenses", label: "Expenses" },
  { value: "profitability", label: "Profitability" },
  { value: "forecast", label: "Forecast" },
];

// Client portal: only their own invoices, read-only — never expenses, costs, margins or other clients.
function ClientBilling() {
  const me = useMe();
  return (
    <div>
      <PageHeader title="Billing" description="Your invoices and payment history." />
      <InvoicesPanel isClient clientId={me.clientId} canWrite={false} />
    </div>
  );
}

function FinanceInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const canWrite = can(me.role, "payments", "write");
  const data = useFinance();
  const [creating, setCreating] = useState(false);
  const raw = params.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.some((t) => t.value === raw) ? raw : "overview";
  const setTab = (t: Tab) => router.replace(t === "overview" ? "/payments" : `/payments?tab=${t}`, { scroll: false });

  return (
    <div>
      <PageHeader
        title="Finance & Billing"
        description="Revenue, invoices, expenses, profitability and cash-flow forecast."
        actions={
          canWrite && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              New invoice
            </Button>
          )
        }
      />

      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
      </div>
      {tab === "overview" && <div className="space-y-4"><BillingResults/><OverviewPanel data={data} canWrite={canWrite} /></div>}
      {tab === "retainers" && <RetainersPanel writable={canWrite}/>}
      {tab === "invoices" && <InvoicesPanel isClient={false} canWrite={canWrite} />}
      {tab === "expenses" && <ExpensesPanel canWrite={canWrite} />}
      {tab === "profitability" && <div className="space-y-4"><BillingResults details/><details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer font-medium">Retainer run-rate estimates</summary><div className="mt-4"><ProfitabilityPanel data={data}/></div></details></div>}
      {tab === "forecast" && <ForecastPanel data={data} />}
      {creating && <NewInvoiceModal open onClose={() => setCreating(false)} />}
    </div>
  );
}

function FinancePage() {
  const me = useMe();
  if (me.role === "client") return <ClientBilling />;
  return <FinanceInner />;
}

export default function Page() {
  return (
    <Suspense>
      <FinancePage />
    </Suspense>
  );
}
