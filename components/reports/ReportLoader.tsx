"use client";

import { Loader2 } from "lucide-react";

// A visible "working on it" panel: spinner, what is happening, and a progress bar when the amount is known.
export function ReportLoader({ title, detail, progress }: { title: string; detail?: string; progress?: { done: number; total: number } | null }) {
  const known = !!progress && progress.total > 0;
  const percent = known ? Math.round(progress.done / progress.total * 100) : 0;
  return <div role="status" aria-live="polite" className="no-print rounded-xl border border-border bg-surface p-5 shadow-card">
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text"><Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-fg-3">{known ? `${detail ?? "Loading data"} · ${progress.done} of ${progress.total} parts (${percent}%)` : detail ?? "This only takes a moment."}</p>
      </div>
    </div>
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
      <div className={known ? "h-full rounded-full bg-accent transition-all" : "h-full w-full rounded-full bg-accent/60 motion-safe:animate-pulse"} style={known ? { width: `${Math.max(4, percent)}%` } : undefined} />
    </div>
  </div>;
}
