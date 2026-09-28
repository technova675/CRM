"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Compass, Plus } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { StrategyDoc } from "@/lib/types";
import { compactMoney, relTime } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, MemberAvatar, PageHeader, Readonly, SearchInput, Select, Table, Td, Th } from "@/components/ui";
import { StrategyGenerator } from "@/components/strategy/StrategyGenerator";
import { STRATEGY_TONE, StrategyView } from "@/components/strategy/StrategyView";

const STATUSES: StrategyDoc["status"][] = ["Draft", "In Review", "Approved"];

function StrategyInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const strategies = useCRM((s) => s.strategies);
  const clients = useCRM((s) => s.clients);
  const readable = can(me.role, "strategy", "read") && me.role !== "client";
  const writable = can(me.role, "strategy", "write") && me.role !== "client";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StrategyDoc["status"] | "All">("All");
  const [clientId, setClientId] = useState("All");

  const openId = params.get("id");
  const open = strategies.find((s) => s.id === openId);
  const creating = params.get("new") === "1" && writable;
  const initialClient = params.get("client") ?? undefined;
  const initialBudget = Number(params.get("budget")) || undefined;
  const go = (qs?: string) => router.replace(qs ? `/strategy?${qs}` : "/strategy", { scroll: false });
  const clientName = (id?: string) => clients.find((c) => c.id === id)?.company ?? "—";

  const visible = useMemo(
    () =>
      strategies
        .filter((s) => (status === "All" || s.status === status) && (clientId === "All" || s.clientId === clientId) && (!q || `${s.title} ${s.summary}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [strategies, status, clientId, q],
  );
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, strategies.filter((x) => x.status === s).length])) as Record<StrategyDoc["status"], number>, [strategies]);

  if (!readable) return <EmptyState icon={<Compass className="size-5" />} title="No access" description="Marketing strategy is available to the agency team." />;

  const generator = creating && (
    <StrategyGenerator
      key={`${initialClient}-${initialBudget}`}
      initialClientId={initialClient}
      initialBudget={initialBudget}
      onClose={() => go(openId ? `id=${openId}` : undefined)}
      onCreated={(d) => go(`id=${d.id}`)}
    />
  );

  if (open) {
    return (
      <>
        <StrategyView key={open.id} doc={open} onBack={() => go()} />
        {generator}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Marketing Strategy"
        icon={<Compass className="size-5 text-fg-3" />}
        description="AI strategy workspace — personas, funnel, channels, budget, testing and KPIs. Humans review and approve before execution."
        actions={writable && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => go("new=1")}>New strategy</Button>}
      />
      {!writable && <Readonly>You have read-only access to strategies.</Readonly>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card className="p-3"><p className="text-xs text-fg-3">Strategies</p><p className="text-xl font-semibold tabular-nums mt-1">{strategies.length}</p></Card>
        {STATUSES.map((s) => (
          <Card key={s} className="p-3"><p className="text-xs text-fg-3">{s}</p><p className="text-xl font-semibold tabular-nums mt-1">{counts[s]}</p></Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
          <SearchInput value={q} onChange={setQ} placeholder="Search strategies…" className="w-full sm:w-64" />
          <Select value={status} onChange={(e) => setStatus(e.target.value as StrategyDoc["status"] | "All")} className="w-36">
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
            <option value="All">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
          <span className="ml-auto self-center text-xs text-fg-3">{visible.length} strategies</span>
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={<Compass className="size-5" />} title="No strategies yet" description="Generate one from a client's record, performance and knowledge base." action={writable && <Button variant="ai" onClick={() => go("new=1")}>Generate a strategy</Button>} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Strategy</Th><Th>Client</Th><Th>Budget / mo</Th><Th>Channels</Th><Th>Status</Th><Th>Version</Th><Th>Owner</Th><Th>Updated</Th></tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} onClick={() => go(`id=${s.id}`)} className="cursor-pointer hover:bg-surface-2/60">
                  <Td className="min-w-56"><p className="font-medium">{s.title}</p><p className="text-xs text-fg-3 line-clamp-1">{s.summary}</p></Td>
                  <Td className="text-fg-2 whitespace-nowrap">{clientName(s.clientId)}</Td>
                  <Td className="tabular-nums">{compactMoney(s.inputs.monthlyBudget)}</Td>
                  <Td><div className="flex flex-wrap gap-1 min-w-40">{s.budget.slice(0, 3).map((b) => <Badge key={b.channel}>{b.channel} {b.pct}%</Badge>)}{s.budget.length > 3 && <Badge>+{s.budget.length - 3}</Badge>}</div></Td>
                  <Td><Badge tone={STRATEGY_TONE[s.status]} dot>{s.status}</Badge></Td>
                  <Td className="tabular-nums">v{s.version}</Td>
                  <Td><MemberAvatar id={s.ownerId} showName /></Td>
                  <Td className="text-xs text-fg-3 whitespace-nowrap">{relTime(s.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {generator}
    </div>
  );
}

export default function StrategyPage() {
  return (
    <Suspense>
      <StrategyInner />
    </Suspense>
  );
}
