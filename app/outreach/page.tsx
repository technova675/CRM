"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { MessageSquareReply, Plus, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { pct } from "@/lib/utils";
import { AIBadge, Button, PageHeader, Stat, Tabs } from "@/components/ui";
import { CampaignDetail, CampaignList, funnel, NewCampaignModal, SequenceBuilder, SuppressionCard, useOpenCampaignEvents } from "@/components/sales/Outreach";

function OutreachInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const canWrite = can(me.role, "outreach", "write");
  const outreach = useCRM((s) => s.outreach);
  const [tab, setTab] = useState<"campaigns" | "sequences">("campaigns");
  const [newOpen, setNewOpen] = useState(() => params.get("new") === "1" && canWrite);
  const openId = params.get("c");
  const presetIds = useMemo(() => params.get("leads")?.split(",").filter(Boolean), [params]);

  const open = useCallback((id: string) => router.push(`/outreach?c=${id}`), [router]);
  useOpenCampaignEvents(useCallback(() => {}, []));

  const totals = useMemo(() => {
    let contacted = 0, replied = 0, pending = 0, leads = 0;
    for (const c of outreach) { const f = funnel(c); contacted += f.contacted; replied += f.replied; pending += f.drafted; leads += f.total; }
    return { contacted, replied, pending, leads, rate: contacted ? (replied / contacted) * 100 : 0 };
  }, [outreach]);

  if (openId) return <CampaignDetail key={openId} id={openId} canWrite={canWrite} onBack={() => router.push("/outreach")} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Outreach <AIBadge>Agent</AIBadge></>}
        description="AI researches each lead, picks the right Adbibe service and drafts a personal message — you review, it sends and follows up."
        actions={canWrite && <Button variant="ai" icon={<Plus className="size-3.5" />} onClick={() => setNewOpen(true)}>New outreach campaign</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leads in outreach" value={totals.leads} hint={`${outreach.length} campaigns`} icon={<Users className="size-3.5" />} />
        <Stat label="Contacted" value={totals.contacted} icon={<Send className="size-3.5" />} />
        <Stat label="Reply rate" value={pct(totals.rate)} hint={`${totals.replied} replies`} icon={<MessageSquareReply className="size-3.5" />} tone="success" />
        <Stat label="Awaiting approval" value={totals.pending} hint="drafts to review" icon={<ShieldCheck className="size-3.5" />} tone="warning" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "campaigns", label: "Campaigns", count: outreach.length }, { value: "sequences", label: "Sequences & compliance" }]} />
      {tab === "campaigns" ? (
        <CampaignList onOpen={open} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2"><SequenceBuilder canWrite={canWrite} /></div>
          <div className="space-y-4">
            <SuppressionCard canWrite={canWrite} />
            <div className="rounded-xl border border-border bg-surface p-4 text-xs text-fg-3">
              <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-fg"><Sparkles className="size-3.5 text-accent" /> Deliverability tips</p>
              Keep daily limits under 150 per mailbox, warm up new domains, and always include an opt-out line. Replies containing “stop” or “unsubscribe” are suppressed automatically.
            </div>
          </div>
        </div>
      )}
      <NewCampaignModal open={newOpen} presetIds={presetIds} onClose={() => { setNewOpen(false); if (params.get("new")) router.replace("/outreach"); }} />
    </div>
  );
}

export default function OutreachPage() {
  return (
    <Suspense>
      <OutreachInner />
    </Suspense>
  );
}
