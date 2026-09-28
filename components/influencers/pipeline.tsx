"use client";

import { useMemo, useState } from "react";
import { useCRM } from "@/lib/store";
import { INFLUENCER_STAGES, type InfluencerEngagement, type InfluencerStage } from "@/lib/types";
import { engagementEconomics } from "@/lib/ai/influencer";
import { cn, compact, compactMoney } from "@/lib/utils";
import { Avatar, Badge, Card, Progress, Select } from "@/components/ui";

// Spec tracking phases mapped onto the engagement stages.
export const PHASE: Record<InfluencerStage, string> = {
  Shortlisted: "Shortlist",
  Outreach: "Outreach",
  Negotiation: "Negotiation",
  Contracted: "Deliverables",
  "Content Submitted": "Content",
  Approved: "Content",
  Live: "Performance",
  Paid: "Payment",
};
const PAY_TONE = { Unpaid: "neutral", "Advance Paid": "warning", Paid: "success" } as const;

export function InfluencerPipeline({ writable, onOpen }: { writable: boolean; onOpen: (e: InfluencerEngagement) => void }) {
  const engagements = useCRM((s) => s.engagements);
  const influencers = useCRM((s) => s.influencers);
  const campaigns = useCRM((s) => s.campaigns);
  const clients = useCRM((s) => s.clients);
  const [campaignId, setCampaignId] = useState("All");
  const [over, setOver] = useState<InfluencerStage | null>(null);
  const campaignIds = useMemo(() => [...new Set(engagements.map((e) => e.campaignId))], [engagements]);
  const list = useMemo(() => engagements.filter((e) => campaignId === "All" || e.campaignId === campaignId), [engagements, campaignId]);

  const move = (e: InfluencerEngagement, stage: InfluencerStage) => {
    const s = useCRM.getState();
    const patch: Partial<InfluencerEngagement> = { stage, updatedAt: new Date().toISOString() };
    if (stage === "Paid") patch.paymentStatus = "Paid";
    s.patch("engagements", e.id, patch, { entity: "influencer", action: `Moved creator to ${stage}`, field: "stage" });
  };

  const totals = useMemo(() => {
    const fee = list.reduce((a, e) => a + e.agreedFee, 0);
    const withR = list.filter((e) => e.results);
    const eng = withR.reduce((a, e) => a + e.results!.engagements, 0);
    const feeR = withR.reduce((a, e) => a + e.agreedFee, 0);
    return { fee, cpe: eng ? feeR / eng : 0, live: withR.length, unpaid: list.filter((e) => e.agreedFee > 0 && e.paymentStatus !== "Paid").reduce((a, e) => a + e.agreedFee, 0) };
  }, [list]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-64">
          <option value="All">All influencer campaigns</option>
          {campaignIds.map((id) => <option key={id} value={id}>{campaigns.find((c) => c.id === id)?.name ?? id}</option>)}
        </Select>
        <span className="text-xs text-fg-3">{list.length} creators · committed {compactMoney(totals.fee)} · outstanding {compactMoney(totals.unpaid)} · blended CPE {totals.cpe ? `₹${totals.cpe.toFixed(2)}` : "—"}</span>
        {writable && <span className="ml-auto hidden sm:inline text-[11px] text-fg-3">Drag cards between stages</span>}
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 min-w-max">
          {INFLUENCER_STAGES.map((stage) => {
            const col = list.filter((e) => e.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(ev) => { if (writable) { ev.preventDefault(); setOver(stage); } }}
                onDragLeave={() => setOver((o) => (o === stage ? null : o))}
                onDrop={(ev) => {
                  ev.preventDefault();
                  setOver(null);
                  const e = list.find((x) => x.id === ev.dataTransfer.getData("text/eng"));
                  if (e && e.stage !== stage) move(e, stage);
                }}
                className={cn("rounded-xl border border-border bg-surface-2/50 p-2 min-h-60 w-[220px] lg:w-auto", over === stage && "border-accent bg-accent-soft")}
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div><p className="text-xs font-semibold">{stage}</p><p className="text-[10px] text-fg-3">{PHASE[stage]}</p></div>
                  <span className="text-[11px] text-fg-3 tabular-nums">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((e) => {
                    const inf = influencers.find((i) => i.id === e.influencerId);
                    const done = e.deliverables.filter((d) => d.done).length;
                    const eco = engagementEconomics(e);
                    return (
                      <Card key={e.id} draggable={writable} onDragStart={(ev) => ev.dataTransfer.setData("text/eng", e.id)} onClick={() => onOpen(e)} className="p-2.5 cursor-pointer hover:border-border-strong">
                        <div className="flex items-center gap-2">
                          <Avatar name={inf?.name ?? "?"} size={24} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate">{inf?.name ?? "Unknown creator"}</p>
                            <p className="text-[11px] text-fg-3 truncate">{clients.find((c) => c.id === e.clientId)?.company} · {inf ? compact(inf.followers) : ""}</p>
                          </div>
                          {e.matchScore !== undefined && <span className="text-xs font-semibold tabular-nums text-accent-text" title="AI match score">{e.matchScore}</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {e.agreedFee > 0 && <Badge>{compactMoney(e.agreedFee)}</Badge>}
                          {e.agreedFee > 0 && <Badge tone={PAY_TONE[e.paymentStatus]}>{e.paymentStatus}</Badge>}
                          {eco && <Badge tone="info">₹{eco.cpe.toFixed(1)} CPE</Badge>}
                        </div>
                        {e.deliverables.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <Progress value={(done / e.deliverables.length) * 100} tone={done === e.deliverables.length ? "success" : "accent"} />
                            <span className="text-[10px] text-fg-3 tabular-nums">{done}/{e.deliverables.length}</span>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  {col.length === 0 && <p className="px-1 py-6 text-center text-[11px] text-fg-3">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
