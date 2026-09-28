"use client";

import { useState } from "react";
import { SOCIAL_STAGES, type SocialPost, type SocialStage } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";
import { Badge, Card, MemberAvatar } from "@/components/ui";
import { PlatformChip, STAGE_TONE } from "./shared";

export function SocialBoard({ posts, onOpen, onMove, writable, clientName }: { posts: SocialPost[]; onOpen: (p: SocialPost) => void; onMove: (p: SocialPost, stage: SocialStage) => void; writable: boolean; clientName: (id: string) => string }) {
  const [over, setOver] = useState<SocialStage | null>(null);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3 min-w-max lg:min-w-0">
        {SOCIAL_STAGES.map((stage) => {
          const list = posts.filter((p) => p.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { if (writable) { e.preventDefault(); setOver(stage); } }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const p = posts.find((x) => x.id === e.dataTransfer.getData("text/post"));
                if (p && p.stage !== stage) onMove(p, stage);
              }}
              className={cn("rounded-xl border border-border bg-surface-2/50 p-2 min-h-60", over === stage && "border-accent bg-accent-soft")}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <Badge tone={STAGE_TONE[stage]} dot>{stage}</Badge>
                <span className="text-[11px] text-fg-3 tabular-nums">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.slice(0, 40).map((p) => (
                  <Card
                    key={p.id}
                    draggable={writable}
                    onDragStart={(e) => e.dataTransfer.setData("text/post", p.id)}
                    onClick={() => onOpen(p)}
                    className={cn("p-2.5 cursor-pointer hover:border-border-strong", writable && "active:cursor-grabbing")}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
                      <PlatformChip platform={p.platform} />
                      <span>{p.format}</span>
                      <span className="truncate">· {clientName(p.clientId)}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug line-clamp-2">{p.hook || p.title}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-fg-3">
                      <span className="truncate">{p.publishedAt ? fmtDateTime(p.publishedAt) : p.scheduledAt ? fmtDateTime(p.scheduledAt) : "Unscheduled"}</span>
                      <span className="flex items-center gap-1.5">
                        {p.aiReview && <span className={cn("tabular-nums font-medium", p.aiReview.score >= 80 ? "text-success" : p.aiReview.score >= 60 ? "text-warning" : "text-danger")}>{p.aiReview.score}</span>}
                        {p.metrics && <span className="tabular-nums">{p.metrics.er}% ER</span>}
                        <MemberAvatar id={p.ownerId} size={18} />
                      </span>
                    </div>
                  </Card>
                ))}
                {list.length === 0 && <p className="px-1 py-6 text-center text-[11px] text-fg-3">No posts</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
