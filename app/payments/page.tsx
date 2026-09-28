"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Plus } from "lucide-react";
import { useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button, PageHeader, Tabs } from "@/components/ui";
import { FlowStrip } from "@/components/finance/FlowStrip";
import { InvoicesPanel, NewInvoiceModal } from "@/components/finance/InvoicesPanel";
import { OverviewPanel } from "@/components/finance/OverviewPanel";
import { ExpensesPanel } from "@/components/finance/ExpensesPanel";
import { ProfitabilityPanel } from "@/components/finance/ProfitabilityPanel";
import { ForecastPanel } from "@/components/finance/ForecastPanel";
import { useFinance } from "@/components/finance/useFinance";

type Tab = "overview" | "invoices" | "expenses" | "profitability" | "forecast";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
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
        title="Finance"
        description="Revenue, invoices, expenses, profitability and cash-flow forecast."
        actions={
          canWrite && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>
              New invoice
            </Button>
          )
        }
      />
      <FlowStrip k={data.kpis} />
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
      </div>
      {tab === "overview" && <OverviewPanel data={data} canWrite={canWrite} />}
      {tab === "invoices" && <InvoicesPanel isClient={false} canWrite={canWrite} />}
      {tab === "expenses" && <ExpensesPanel canWrite={canWrite} />}
      {tab === "profitability" && <ProfitabilityPanel data={data} />}
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
