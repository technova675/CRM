"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { ClipboardCheck, Palette } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { EmptyState, PageHeader, Readonly, Tabs } from "@/components/ui";
import { ApprovalBoard } from "@/components/creative/ApprovalBoard";
import { ClientPortal, PORTAL_STATUSES } from "@/components/creative/ClientPortal";
import { ConceptsTab } from "@/components/creative/ConceptsTab";
import { CreativeDrawer } from "@/components/creative/CreativeDrawer";
import { IntelligenceTab } from "@/components/creative/IntelligenceTab";

type Tab = "approvals" | "concepts" | "intelligence";

function CreativeInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const creatives = useCRM((s) => s.creatives);
  const isClient = me.role === "client";
  const readable = can(me.role, "creative", "read");
  const writable = can(me.role, "creative", "write") && !isClient;

  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = !isClient && (tabParam === "concepts" || tabParam === "intelligence") ? tabParam : "approvals";
  const visible = useMemo(() => (isClient ? creatives.filter((c) => c.clientId === me.clientId && PORTAL_STATUSES.includes(c.status)) : creatives), [creatives, isClient, me.clientId]);
  const openId = params.get("c");
  const open = visible.find((c) => c.id === openId);

  const nav = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && sp.set(k, v));
    const qs = sp.toString();
    router.replace(qs ? `/creative?${qs}` : "/creative", { scroll: false });
  };
  const keep = { tab: tab === "approvals" ? undefined : tab, client: params.get("client") ?? undefined };
  const openCreative = (id?: string) => nav({ ...keep, c: id });

  const stats = useMemo(() => {
    const n = (s: string) => visible.filter((c) => c.status === s).length;
    return { internal: n("Internal Review"), client: n("Client Review"), changes: n("Changes Requested"), live: n("Live") };
  }, [visible]);

  if (!readable) return <EmptyState icon={<Palette className="size-5" />} title="No access" description="Creative Studio is available to the creative and account teams." />;

  if (isClient) {
    return (
      <div>
        <PageHeader title="Creative approvals" icon={<ClipboardCheck className="size-5 text-fg-3" />} description="Review what the team has prepared for you — approve it or tell us what to change." />
        <ClientPortal creatives={visible} onOpen={(id) => openCreative(id)} />
        {open && <CreativeDrawer key={open.id} creative={open} clientMode writable={false} onClose={() => openCreative()} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Creative Studio"
        icon={<Palette className="size-5 text-fg-3" />}
        description="Creative approvals, AI concepts and creative intelligence — Draft → Internal Review → Client Review → Approved → Live."
      />
      {!writable && <Readonly>You have read-only access to Creative Studio.</Readonly>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[["Internal review", stats.internal], ["Awaiting client", stats.client], ["Changes requested", stats.changes], ["Live", stats.live]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-surface shadow-card p-3"><p className="text-xs text-fg-3">{l}</p><p className="text-xl font-semibold tabular-nums mt-1">{v}</p></div>
        ))}
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(t) => nav({ tab: t === "approvals" ? undefined : t })}
          tabs={[
            { value: "approvals", label: "Approvals", count: creatives.filter((c) => c.status !== "Archived").length },
            { value: "concepts", label: "AI concepts" },
            { value: "intelligence", label: "Creative intelligence" },
          ]}
        />
      </div>

      {tab === "approvals" && <ApprovalBoard creatives={visible} writable={writable} onOpen={(id) => openCreative(id)} />}
      {tab === "concepts" && (
        <ConceptsTab
          key={params.get("client") ?? "default"}
          initialClientId={params.get("client") ?? undefined}
          initialCount={Number(params.get("count")) || undefined}
          autoRun={!!params.get("count")}
          writable={writable}
          onOpenCreative={(id) => nav({ tab: "concepts", client: params.get("client") ?? undefined, c: id })}
        />
      )}
      {tab === "intelligence" && <IntelligenceTab writable={writable} onGenerateFor={(cid) => nav({ tab: "concepts", client: cid })} />}

      {open && <CreativeDrawer key={open.id} creative={open} clientMode={false} writable={writable} onClose={() => openCreative()} />}
    </div>
  );
}

export default function CreativePage() {
  return (
    <Suspense>
      <CreativeInner />
    </Suspense>
  );
}
