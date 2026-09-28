"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, MessageSquare, RotateCcw } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { Creative } from "@/lib/types";
import { relTime } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { CREATIVE_TONE, CreativePreview } from "./Preview";

export const PORTAL_STATUSES: Creative["status"][] = ["Client Review", "Changes Requested", "Approved", "Live"];

function ReviewCard({ c, onOpen }: { c: Creative; onOpen: () => void }) {
  const setCreativeStatus = useCRM((s) => s.setCreativeStatus);
  const [body, setBody] = useState("");
  const v = c.versions[c.versions.length - 1]!;
  const visibleComments = c.comments.filter((x) => !x.internal).length;
  const decide = (status: "Approved" | "Changes Requested") => {
    if (status === "Changes Requested" && !body.trim()) return toast("Tell us what to change", "Add a comment describing the changes.", "warning");
    setCreativeStatus(c.id, status, body.trim() || undefined);
    setBody("");
    toast(status === "Approved" ? "Approved — thank you!" : "Change request sent to the team");
  };
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 md:grid-cols-[260px_1fr]">
        <button onClick={onOpen} className="text-left"><CreativePreview creative={c} /></button>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold">{c.title}</p>
            <Badge tone={CREATIVE_TONE[c.status]} dot>{c.status}</Badge>
            <Badge>v{v.v}</Badge>
          </div>
          <p className="text-xs text-fg-3">{c.type} · {c.platform} · {c.format} · sent {relTime(c.updatedAt)}</p>
          {v.headline && <p className="text-[13px]"><span className="text-fg-3">Headline: </span>{v.headline}</p>}
          {v.body && <p className="text-[13px] text-fg-2 whitespace-pre-line line-clamp-4">{v.body}</p>}
          {v.cta && <p className="text-[13px]"><span className="text-fg-3">Button: </span>{v.cta}</p>}
          <p className="text-xs text-fg-3">What changed: {v.note}</p>
          <button onClick={onOpen} className="inline-flex items-center gap-1 self-start text-xs text-accent-text hover:underline"><MessageSquare className="size-3" /> {visibleComments} comment(s) · version history</button>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your feedback (required when requesting changes)…" className="min-h-16 mt-auto" />
          <div className="grid grid-cols-2 gap-2">
            <Button size="md" variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => decide("Approved")}>Approve</Button>
            <Button size="md" variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => decide("Changes Requested")}>Request changes</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ClientPortal({ creatives, onOpen }: { creatives: Creative[]; onOpen: (id: string) => void }) {
  const review = creatives.filter((c) => c.status === "Client Review");
  const changes = creatives.filter((c) => c.status === "Changes Requested");
  const done = creatives.filter((c) => c.status === "Approved" || c.status === "Live");
  if (!creatives.length) return <Card><EmptyState icon={<ClipboardCheck className="size-5" />} title="Nothing to review" description="When the team sends you a creative for approval it will appear here." /></Card>;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold">Awaiting your review <span className="text-fg-3 font-normal">{review.length}</span></h2>
        {review.length ? review.map((c) => <ReviewCard key={c.id} c={c} onOpen={() => onOpen(c.id)} />) : <p className="text-xs text-fg-3">You&apos;re all caught up.</p>}
      </section>
      {changes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold">Changes requested — team is working on it <span className="text-fg-3 font-normal">{changes.length}</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {changes.map((c) => <Tile key={c.id} c={c} onOpen={() => onOpen(c.id)} />)}
          </div>
        </section>
      )}
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold">Approved &amp; live <span className="text-fg-3 font-normal">{done.length}</span></h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {done.map((c) => <Tile key={c.id} c={c} onOpen={() => onOpen(c.id)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ c, onOpen }: { c: Creative; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="text-left rounded-xl border border-border bg-surface p-2 shadow-card hover:border-border-strong">
      <CreativePreview creative={c} compact />
      <p className="mt-2 text-[13px] font-medium line-clamp-1">{c.title}</p>
      <div className="mt-1 flex items-center gap-1.5"><Badge tone={CREATIVE_TONE[c.status]} dot>{c.status}</Badge><span className="text-[11px] text-fg-3">v{c.versions.length} · {relTime(c.updatedAt)}</span></div>
    </button>
  );
}
