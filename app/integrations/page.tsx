"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Plug, Search as SearchIcon, Layers } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { INTEGRATION_CATEGORIES, type Integration, type IntegrationCategory } from "@/lib/types";
import { disconnectIntegration, syncIntegration } from "@/lib/domain/integrations";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, Readonly, SearchInput, Segmented, Stat, Tabs } from "@/components/ui";
import { ConnectorCard } from "@/components/integrations/ConnectorCard";
import { ConnectModal } from "@/components/integrations/ConnectModal";
import { ArchitecturePanel } from "@/components/integrations/ArchitecturePanel";
import { ApiKeysCard } from "@/components/integrations/ApiKeysCard";
import { toast } from "@/components/shell/toast";

type Tab = "connectors" | "api" | "architecture";
type StatusFilter = "all" | Integration["status"];

function IntegrationsInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const integrations = useCRM((s) => s.integrations);
  const slug = useCRM((s) => s.organization.slug);
  const writable = can(me.role, "integrations", "write") && me.role !== "client";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [connecting, setConnecting] = useState<Integration | null>(null);

  const rawTab = params.get("tab");
  const tab: Tab = rawTab === "api" || rawTab === "architecture" ? rawTab : "connectors";
  const rawCat = params.get("category");
  const category = (INTEGRATION_CATEGORIES as readonly string[]).includes(rawCat ?? "") ? (rawCat as IntegrationCategory) : "All";
  const nav = (next: { tab?: Tab; category?: string }) => {
    const t = next.tab ?? tab;
    const c = next.category ?? category;
    const sp = new URLSearchParams();
    if (t !== "connectors") sp.set("tab", t);
    if (c !== "All" && t === "connectors") sp.set("category", c);
    router.replace(`/integrations${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: integrations.length };
    integrations.forEach((i) => (m[i.category] = (m[i.category] ?? 0) + 1));
    return m;
  }, [integrations]);
  const stats = useMemo(
    () => ({
      connected: integrations.filter((i) => i.status === "connected").length,
      errors: integrations.filter((i) => i.status === "error").length,
      available: integrations.filter((i) => i.status === "available").length,
      accounts: integrations.reduce((a, i) => a + (i.status === "connected" ? (i.accounts?.length ?? 0) : 0), 0),
    }),
    [integrations],
  );

  const rows = useMemo(
    () =>
      integrations
        .filter((i) => (category === "All" || i.category === category) && (status === "all" || i.status === status))
        .filter((i) => !q || `${i.name} ${i.category} ${i.description ?? ""} ${i.scopes.join(" ")}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => {
          const rank = { error: 0, connected: 1, available: 2 } as const;
          return rank[a.status] - rank[b.status] || (a.phase ?? 9) - (b.phase ?? 9) || a.name.localeCompare(b.name);
        }),
    [integrations, category, status, q],
  );

  return (
    <div>
      <PageHeader title="Integrations" description="A connector framework for ad platforms, analytics, messaging, commerce and more — each with scoped auth, sync and approval-gated writes." />
      {!writable && <Readonly>You can view integrations; only admins and the AI/Automation team can connect or disconnect them.</Readonly>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Connected" value={stats.connected} hint={`${stats.accounts} linked accounts`} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
        <Stat label="Needs attention" value={stats.errors} hint="auth errors" icon={<AlertTriangle className="size-3.5" />} tone={stats.errors ? "danger" : "success"} />
        <Stat label="Available" value={stats.available} icon={<Plug className="size-3.5" />} />
        <Stat label="Categories" value={Object.keys(counts).length - 1} icon={<Layers className="size-3.5" />} />
      </div>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(t) => nav({ tab: t })}
          tabs={[
            { value: "connectors", label: "Connectors", count: integrations.length },
            { value: "api", label: "API keys & webhooks" },
            { value: "architecture", label: "Architecture" },
          ]}
        />
      </div>

      {tab === "connectors" && (
        <>
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchInput value={q} onChange={setQ} placeholder="Search connectors, scopes…" className="lg:w-72" />
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "connected", label: "Connected" },
                { value: "error", label: "Errors" },
                { value: "available", label: "Available" },
              ]}
            />
          </div>
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            {(["All", ...INTEGRATION_CATEGORIES] as const)
              .filter((c) => c === "All" || counts[c])
              .map((c) => (
                <button
                  key={c}
                  onClick={() => nav({ category: c })}
                  className={cn("h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium transition", category === c ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}
                >
                  {c} <span className="tabular-nums text-fg-3">{counts[c] ?? 0}</span>
                </button>
              ))}
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<SearchIcon className="size-5" />} title="No connectors match" description="Try another category or search term." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((i) => (
                <ConnectorCard
                  key={i.key}
                  it={i}
                  writable={writable}
                  onConnect={() => setConnecting(i)}
                  onDisconnect={() => {
                    disconnectIntegration(i.key);
                    toast(`${i.name} disconnected`, "Stored tokens are revoked and deleted server-side.", "info");
                  }}
                  onSync={() => {
                    syncIntegration(i.key);
                    toast(`Syncing ${i.name}`, "Sync job queued — last sync time updated.", "info");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
      {tab === "api" && <ApiKeysCard writable={writable} />}
      {tab === "architecture" && <ArchitecturePanel />}
      {connecting && <ConnectModal it={connecting} orgSlug={slug} onClose={() => setConnecting(null)} />}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsInner />
    </Suspense>
  );
}
