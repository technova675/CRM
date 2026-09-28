"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SocialPost } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/ui";
import { PlatformChip, STAGE_TONE, reschedule } from "./shared";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const TONE_BORDER: Record<string, string> = {
  neutral: "border-l-border-strong",
  accent: "border-l-accent",
  warning: "border-l-warning",
  info: "border-l-info",
  success: "border-l-success",
  danger: "border-l-danger",
};

function PostChip({ p, writable, onOpen, clientName }: { p: SocialPost; writable: boolean; onOpen: (p: SocialPost) => void; clientName: (id: string) => string }) {
  const at = p.publishedAt ?? p.scheduledAt;
  const drag = writable && p.stage !== "Published";
  return (
    <button
      draggable={drag}
      onDragStart={(e) => e.dataTransfer.setData("text/post", p.id)}
      onClick={() => onOpen(p)}
      title={`${clientName(p.clientId)} · ${p.stage} · ${p.hook}`}
      className={cn("w-full flex items-center gap-1 rounded-md border border-border border-l-2 bg-surface px-1 py-0.5 text-left text-[11px] hover:bg-surface-2", TONE_BORDER[STAGE_TONE[p.stage]], drag && "cursor-grab active:cursor-grabbing")}
    >
      <PlatformChip platform={p.platform} />
      <span className="truncate flex-1 text-fg-2">{at ? new Date(at).toLocaleTimeString("en-IN", { hour: "numeric" }).replace(" ", "") : ""} {p.format}</span>
    </button>
  );
}

export function SocialCalendar({ posts, month, onMonth, onOpen, writable, clientName }: { posts: SocialPost[]; month: Date; onMonth: (d: Date) => void; onOpen: (p: SocialPost) => void; writable: boolean; clientName: (id: string) => string }) {
  const [over, setOver] = useState<string | null>(null);
  const [today] = useState(() => key(new Date()));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const start = new Date(first);
    start.setDate(1 - lead);
    const count = Math.ceil((lead + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);

  const byDay = useMemo(() => {
    const m = new Map<string, SocialPost[]>();
    posts.forEach((p) => {
      const at = p.publishedAt ?? p.scheduledAt;
      if (!at) return;
      const k = key(new Date(at));
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    m.forEach((list) => list.sort((a, b) => (a.publishedAt ?? a.scheduledAt ?? "").localeCompare(b.publishedAt ?? b.scheduledAt ?? "")));
    return m;
  }, [posts]);
  const unscheduled = useMemo(() => posts.filter((p) => !p.scheduledAt && !p.publishedAt), [posts]);

  const onDrop = (e: React.DragEvent, d: Date) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/post");
    const p = posts.find((x) => x.id === id);
    if (p && p.stage !== "Published") reschedule(p, d);
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" aria-label="Previous month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} icon={<ChevronLeft className="size-3.5" />} />
          <Button variant="ghost" size="xs" aria-label="Next month" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} icon={<ChevronRight className="size-3.5" />} />
          <span className="text-[13px] font-semibold ml-1">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
        </div>
        <div className="flex items-center gap-2">
          {writable && <span className="hidden sm:inline text-[11px] text-fg-3">Drag a post to another day to reschedule</span>}
          <Button size="xs" onClick={() => onMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-border">
            {DOW.map((d) => <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-fg-3">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const k = key(d);
              const list = byDay.get(k) ?? [];
              const inMonth = d.getMonth() === month.getMonth();
              return (
                <div
                  key={k}
                  onDragOver={(e) => { if (writable) { e.preventDefault(); setOver(k); } }}
                  onDragLeave={() => setOver((o) => (o === k ? null : o))}
                  onDrop={(e) => onDrop(e, d)}
                  className={cn("min-h-24 border-b border-r border-border p-1 space-y-0.5", !inMonth && "bg-surface-2/40", over === k && "bg-accent-soft")}
                >
                  <div className={cn("text-[11px] tabular-nums px-0.5", inMonth ? "text-fg-2" : "text-fg-3", today === k && "font-semibold text-accent-text")}>{d.getDate()}</div>
                  {list.slice(0, 4).map((p) => <PostChip key={p.id} p={p} writable={writable} onOpen={onOpen} clientName={clientName} />)}
                  {list.length > 4 && <p className="text-[10px] text-fg-3 px-1">+{list.length - 4} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {unscheduled.length > 0 && (
        <div className="p-3 border-t border-border">
          <p className="text-xs font-medium text-fg-2 mb-1.5">Unscheduled ideas ({unscheduled.length}) {writable && <span className="font-normal text-fg-3">— drag onto a day to schedule</span>}</p>
          <div className="grid gap-1 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
            {unscheduled.map((p) => <PostChip key={p.id} p={p} writable={writable} onOpen={onOpen} clientName={clientName} />)}
          </div>
        </div>
      )}
    </Card>
  );
}
