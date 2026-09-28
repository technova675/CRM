"use client";

import { useMemo, useState } from "react";
import { useCRM } from "@/lib/store";
import type { Influencer } from "@/lib/types";
import { CREATOR_CATEGORIES, CREATOR_CONTENT, engagementEconomics, ER_BENCHMARK, tierOf } from "@/lib/ai/influencer";
import { cn, compact, money } from "@/lib/utils";
import { Badge, Button, Field, Input, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const PLATFORMS: NonNullable<Influencer["platform"]>[] = ["Instagram", "YouTube", "LinkedIn", "X", "Moj"];
const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45+"];

export function CreatorModal({ creator, onClose, writable }: { creator: Influencer | null; onClose: () => void; writable: boolean }) {
  const add = useCRM((s) => s.addInfluencer);
  const update = useCRM((s) => s.updateInfluencer);
  const engagements = useCRM((s) => s.engagements);
  const campaigns = useCRM((s) => s.campaigns);
  const [f, setF] = useState<Omit<Influencer, "id">>(
    creator ?? { name: "", instagram: "", youtube: "", email: "", platform: "Instagram", category: "Lifestyle", location: "Mumbai", followers: 10000, engagement: 3, contentTypes: ["Reels"], pricePerPost: 5000, availability: "Available", verification: "Pending", previousProjects: [], performanceScore: 7, notes: "" },
  );
  const history = useMemo(() => (creator ? engagements.filter((e) => e.influencerId === creator.id) : []), [engagements, creator]);
  const tier = tierOf(f.followers);

  const save = () => {
    if (!f.name.trim()) return toast("Name is required", undefined, "warning");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast("Enter a valid email", undefined, "warning");
    if (creator) update(creator.id, f);
    else add(f);
    toast(creator ? "Creator updated" : "Creator added");
    onClose();
  };
  const setAud = (patch: Partial<NonNullable<Influencer["audience"]>>) => setF({ ...f, audience: { topCity: f.audience?.topCity ?? f.location, ageBand: f.audience?.ageBand ?? "18-24", femalePct: f.audience?.femalePct ?? 50, ...patch } });

  return (
    <Modal open onClose={onClose} size="lg" title={creator ? creator.name : "Add creator"} subtitle={creator ? `${tier} creator · ER benchmark ${ER_BENCHMARK[tier]}%` : undefined} footer={writable ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></> : <Button onClick={onClose}>Close</Button>}>
      <fieldset disabled={!writable} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Primary platform"><Select value={f.platform ?? "Instagram"} onChange={(e) => setF({ ...f, platform: e.target.value as Influencer["platform"] })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Email (contact)"><Input type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="creator@email.com" /></Field>
        <Field label="Instagram"><Input value={f.instagram ?? ""} onChange={(e) => setF({ ...f, instagram: e.target.value })} /></Field>
        <Field label="YouTube"><Input value={f.youtube ?? ""} onChange={(e) => setF({ ...f, youtube: e.target.value })} /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CREATOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Followers"><Input type="number" value={f.followers} onChange={(e) => setF({ ...f, followers: Number(e.target.value) })} /></Field>
        <Field label="Engagement %"><Input type="number" step="0.1" value={f.engagement} onChange={(e) => setF({ ...f, engagement: Number(e.target.value) })} /></Field>
        <Field label="Price per post (₹)"><Input type="number" value={f.pricePerPost} onChange={(e) => setF({ ...f, pricePerPost: Number(e.target.value) })} /></Field>
        <Field label="Performance (0–10)"><Input type="number" step="0.1" min={0} max={10} value={f.performanceScore} onChange={(e) => setF({ ...f, performanceScore: Number(e.target.value) })} /></Field>
        <Field label="Availability"><Select value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value as Influencer["availability"] })}><option>Available</option><option>Busy</option><option>Unavailable</option></Select></Field>
        <Field label="Verification"><Select value={f.verification} onChange={(e) => setF({ ...f, verification: e.target.value as Influencer["verification"] })}><option>Verified</option><option>Pending</option><option>Unverified</option></Select></Field>
        <Field label="Previous projects" className="sm:col-span-2"><Input value={f.previousProjects.join(", ")} onChange={(e) => setF({ ...f, previousProjects: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>

        <div className="col-span-full rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-fg-2 mb-2">Audience <span className="font-normal text-fg-3">· from the creator&apos;s insights screenshot / media kit</span></p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Top city"><Input value={f.audience?.topCity ?? ""} onChange={(e) => setAud({ topCity: e.target.value })} placeholder={f.location} /></Field>
            <Field label="Main age band"><Select value={f.audience?.ageBand ?? ""} onChange={(e) => setAud({ ageBand: e.target.value })}><option value="">—</option>{AGE_BANDS.map((a) => <option key={a}>{a}</option>)}</Select></Field>
            <Field label="Female %"><Input type="number" min={0} max={100} value={f.audience?.femalePct ?? ""} onChange={(e) => setAud({ femalePct: Number(e.target.value) })} /></Field>
          </div>
        </div>

        <div className="col-span-full">
          <p className="text-xs font-medium text-fg-2 mb-1.5">Content types</p>
          <div className="flex flex-wrap gap-1.5">
            {CREATOR_CONTENT.map((c) => {
              const on = f.contentTypes.includes(c);
              return <button type="button" key={c} onClick={() => setF({ ...f, contentTypes: on ? f.contentTypes.filter((x) => x !== c) : [...f.contentTypes, c] })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-3")}>{c}</button>;
            })}
          </div>
        </div>
        <Field label="Notes" className="col-span-full"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </fieldset>

      {creator && (
        <div className="mt-4">
          <p className="text-xs font-medium text-fg-2 mb-1.5">Campaigns with Adbibe ({history.length})</p>
          {history.length === 0 ? (
            <p className="text-xs text-fg-3">No engagements yet.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((e) => {
                const eco = engagementEconomics(e);
                return (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs">
                    <span className="font-medium">{campaigns.find((c) => c.id === e.campaignId)?.name ?? "Campaign"}</span>
                    <StatusBadge status={e.stage} />
                    {e.agreedFee > 0 && <span className="text-fg-3">{money(e.agreedFee)}</span>}
                    {e.results && <Badge tone="info">{compact(e.results.views)} views · {eco ? `₹${eco.cpe.toFixed(1)} CPE` : ""}</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
