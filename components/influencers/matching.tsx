"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, ListPlus, Sparkles, Target } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Influencer, InfluencerEngagement } from "@/lib/types";
import { CREATOR_CATEGORIES, CREATOR_CONTENT, defaultRequirements, matchSummary, rankCreators, tierOf, type MatchRequirements, type MatchResult } from "@/lib/ai/influencer";
import { runAgentJob } from "@/lib/ai/client";
import { cn, compact, money, uid } from "@/lib/utils";
import { AgentChip, Avatar, Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, InsightLegend, InsightList, Select, StatusBadge } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const AGE_BANDS = ["18-24", "25-34", "35-44"];
const STEPS = ["Client campaign requirements", "Creator database", "AI matching", "Shortlist"];

export function MatchingPanel({ writable, onShortlisted }: { writable: boolean; onShortlisted: () => void }) {
  const clients = useCRM((s) => s.clients);
  const campaigns = useCRM((s) => s.campaigns);
  const influencers = useCRM((s) => s.influencers);
  const engagements = useCRM((s) => s.engagements);
  const initialCampaign = campaigns.find((c) => c.service === "Influencer Marketing");
  const [req, setReq] = useState<MatchRequirements>(() => defaultRequirements(clients.find((c) => c.id === initialCampaign?.clientId), initialCampaign));
  const [results, setResults] = useState<{ i: Influencer; m: MatchResult }[] | null>(null);
  const [ranFor, setRanFor] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === req.clientId);
  const clientCampaigns = useMemo(() => campaigns.filter((c) => c.clientId === req.clientId), [campaigns, req.clientId]);
  const locations = useMemo(() => [...new Set(influencers.map((i) => i.location))].sort(), [influencers]);
  const already = useMemo(() => new Set(engagements.filter((e) => e.campaignId === req.campaignId).map((e) => e.influencerId)), [engagements, req.campaignId]);
  const reqKey = JSON.stringify(req);
  const stale = results && ranFor !== reqKey;
  const summary = useMemo(() => (results ? matchSummary(results.filter((r) => !r.m.excluded), req) : []), [results, req]);
  const step = results ? (selected.length ? 3 : 2) : 0;

  const pickClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    const camp = campaigns.find((x) => x.clientId === id && x.service === "Influencer Marketing") ?? campaigns.find((x) => x.clientId === id);
    setReq(defaultRequirements(c, camp));
    setSelected([]);
  };
  const toggle = <K extends "categories" | "contentTypes">(k: K, v: string) => setReq((r) => ({ ...r, [k]: r[k].includes(v) ? r[k].filter((x) => x !== v) : [...r[k], v] }));

  const run = async () => {
    setBusy(true);
    const out = await runAgentJob({ agent: "social", title: `Creator matching · ${client?.company ?? "custom brief"}`, clientId: req.clientId || undefined, local: () => rankCreators(influencers, req, engagements) });
    setBusy(false);
    if (!out) return;
    setResults(out);
    setRanFor(reqKey);
    setSelected(out.filter((r) => !r.m.excluded && !already.has(r.i.id)).slice(0, 5).map((r) => r.i.id));
  };

  const shortlist = () => {
    const camp = campaigns.find((c) => c.id === req.campaignId);
    if (!camp || !results) return toast("Pick a campaign to shortlist into", undefined, "warning");
    const s = useCRM.getState();
    const now = new Date().toISOString();
    const fresh = selected.filter((id) => !already.has(id));
    fresh.forEach((id) => {
      const r = results.find((x) => x.i.id === id);
      const e: InfluencerEngagement = { id: uid("eng"), influencerId: id, campaignId: camp.id, clientId: camp.clientId, stage: "Shortlisted", agreedFee: 0, deliverables: [], paymentStatus: "Unpaid", matchScore: r?.m.total, notes: r ? `AI match ${r.m.total}/100 — ${r.m.factors.filter((f) => f.points >= f.max * 0.8).map((f) => f.label.toLowerCase()).join(", ")}` : "", updatedAt: now };
      s.upsert("engagements", e);
    });
    s.updateCampaign(camp.id, { influencerIds: [...new Set([...camp.influencerIds, ...fresh])] });
    s.log({ actor: "human", actorId: s.currentUserId, entity: "influencer", entityId: camp.id, action: "Shortlisted creators", detail: `${fresh.length} creators → ${camp.name}` });
    toast(`${fresh.length} creators shortlisted`, camp.name);
    setSelected([]);
    onShortlisted();
  };

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("rounded-full border px-2 py-0.5", i < step ? "border-success/30 bg-success-soft text-success" : i === step ? "border-accent bg-accent-soft text-accent-text font-medium" : "border-border text-fg-3")}>{i + 1}. {s}</li>
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="p-3 space-y-3 h-fit">
          <p className="text-[13px] font-semibold">Campaign requirements</p>
          <Field label="Client"><Select value={req.clientId} onChange={(e) => pickClient(e.target.value)}><option value="">— Custom brief —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
          <Field label="Campaign"><Select value={req.campaignId} onChange={(e) => setReq({ ...req, campaignId: e.target.value })}><option value="">—</option>{clientCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <div>
            <p className="text-xs font-medium text-fg-2 mb-1">Category</p>
            <div className="flex flex-wrap gap-1">{CREATOR_CATEGORIES.map((c) => <Chip key={c} on={req.categories.includes(c)} onClick={() => toggle("categories", c)}>{c}</Chip>)}</div>
          </div>
          <Field label="Geography"><Select value={req.geography} onChange={(e) => setReq({ ...req, geography: e.target.value })}><option value="">Any</option>{locations.map((l) => <option key={l}>{l}</option>)}</Select></Field>
          <Field label="Budget per creator (₹)"><Input type="number" value={req.budget} onChange={(e) => setReq({ ...req, budget: Number(e.target.value) })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min followers"><Input type="number" value={req.minFollowers} onChange={(e) => setReq({ ...req, minFollowers: Number(e.target.value) })} /></Field>
            <Field label="Max followers" hint="0 = no cap"><Input type="number" value={req.maxFollowers} onChange={(e) => setReq({ ...req, maxFollowers: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Min engagement %"><Input type="number" step="0.5" value={req.minEngagement} onChange={(e) => setReq({ ...req, minEngagement: Number(e.target.value) })} /></Field>
          <div>
            <p className="text-xs font-medium text-fg-2 mb-1">Content types</p>
            <div className="flex flex-wrap gap-1">{CREATOR_CONTENT.map((c) => <Chip key={c} on={req.contentTypes.includes(c)} onClick={() => toggle("contentTypes", c)}>{c}</Chip>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Audience gender"><Select value={req.gender} onChange={(e) => setReq({ ...req, gender: e.target.value as MatchRequirements["gender"] })}><option>Any</option><option>Female-skewed</option><option>Male-skewed</option></Select></Field>
            <Field label="Audience age"><Select value={req.ageBand} onChange={(e) => setReq({ ...req, ageBand: e.target.value })}><option value="">Any</option>{AGE_BANDS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
          </div>
          <Button variant="ai" className="w-full" loading={busy} icon={<Sparkles className="size-3.5" />} onClick={run}>{results ? "Re-run AI matching" : "Run AI matching"}</Button>
          <p className="text-[11px] text-fg-3">Scores {influencers.length} creators on category, geography, ER vs tier benchmark, budget, audience, availability, past performance and verification.</p>
        </Card>

        <div className="space-y-3">
          {!results ? (
            <Card><EmptyState icon={<Target className="size-5" />} title="Set the brief, then run AI matching" description="Every point in the score is explained so the shortlist is defensible to the client." /></Card>
          ) : (
            <>
              <Card>
                <CardHeader title={<span className="flex items-center gap-2">Match summary <AgentChip name="Influencer matching" color="#f43f5e" /></span>} subtitle={stale ? "Requirements changed — re-run to refresh" : `${results.length} creators scored`} action={writable && <Button variant="primary" size="xs" icon={<ListPlus className="size-3" />} disabled={!selected.length || !req.campaignId} onClick={shortlist}>Shortlist {selected.filter((x) => !already.has(x)).length}</Button>} />
                <div className="px-4 pb-3 space-y-2"><InsightList items={summary} compact /><InsightLegend /></div>
              </Card>
              {results.slice(0, 20).map(({ i, m }, idx) => {
                const inCampaign = already.has(i.id);
                return (
                  <div key={i.id} className={cn("rounded-xl border p-3 bg-surface", selected.includes(i.id) ? "border-accent bg-accent-soft/40" : "border-border", m.excluded && "opacity-60")}>
                    <div className="flex items-center gap-3">
                      {writable && <Checkbox checked={selected.includes(i.id)} onChange={(v) => setSelected(v ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />}
                      <span className="w-6 text-xs text-fg-3 tabular-nums">#{idx + 1}</span>
                      <Avatar name={i.name} size={30} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate flex items-center gap-1">{i.name}{i.verification === "Verified" && <BadgeCheck className="size-3.5 text-info" />} <span className="text-xs text-fg-3 font-normal">{i.instagram}</span></p>
                        <p className="text-xs text-fg-3 truncate">{i.category} · {i.location} · {compact(i.followers)} ({tierOf(i.followers)}) · {i.engagement}% ER · {money(i.pricePerPost)}</p>
                      </div>
                      {inCampaign && <Badge tone="info">In campaign</Badge>}
                      <StatusBadge status={i.availability} />
                      <button onClick={() => setExpanded(expanded === i.id ? null : i.id)} className="text-right shrink-0">
                        <p className={cn("text-lg font-semibold tabular-nums", m.total >= 80 ? "text-success" : m.total >= 60 ? "text-accent-text" : "text-fg-2")}>{m.total}</p>
                        <p className="text-[10px] text-fg-3">match · why?</p>
                      </button>
                    </div>
                    {expanded === i.id && (
                      <div className="mt-3 grid gap-1.5 border-t border-border pt-3">
                        {m.factors.map((f) => (
                          <div key={f.key} className="grid grid-cols-[120px_48px_1fr] items-center gap-2 text-xs">
                            <span className="text-fg-3">{f.label}</span>
                            <span className="tabular-nums font-medium">{f.points}/{f.max}</span>
                            <span className="text-fg-2">{f.reason}</span>
                          </div>
                        ))}
                        {m.excluded && <p className="text-xs text-warning">Creator is unavailable — not recommended for this flight.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3")}>{children}</button>;
}
