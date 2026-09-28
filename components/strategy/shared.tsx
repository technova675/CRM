"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import type { InsightItem, InsightKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardHeader, InsightTag } from "@/components/ui";

// "Context used" — which knowledge-base / client fields fed an AI generation.
export function ContextUsed({ items, className, title = "Context used" }: { items: { label: string; value: string }[]; className?: string; title?: string }) {
  if (!items.length) return null;
  return (
    <Card className={className}>
      <CardHeader title={<span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5 text-fg-3" />{title}</span>} subtitle="Shared client memory the agent read" />
      <ul className="px-4 pb-4 space-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="text-xs leading-relaxed">
            <span className="font-medium text-fg-2">{it.label}:</span> <span className="text-fg-3">{it.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Click-to-edit text. Commits on blur / Enter, Escape cancels.
export function EditableText({ value, onSave, disabled, multiline, className, placeholder = "—" }: { value: string; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null || disabled) {
    return (
      <span
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onClick={() => !disabled && setDraft(value)}
        onKeyDown={(e) => !disabled && e.key === "Enter" && setDraft(value)}
        className={cn("min-w-0 whitespace-pre-wrap", !disabled && "cursor-text rounded hover:bg-surface-2 hover:outline hover:outline-1 hover:outline-border", !value && "text-fg-3", className)}
        title={disabled ? undefined : "Click to edit"}
      >
        {value || placeholder}
      </span>
    );
  }
  const commit = () => {
    if (draft !== value) onSave(draft.trim());
    setDraft(null);
  };
  const common = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") setDraft(null);
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    },
    className: cn("w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-[13px] text-fg outline-none ring-3 ring-[var(--ring)]", className),
  };
  return multiline ? <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} /> : <input {...common} onChange={(e) => setDraft(e.target.value)} />;
}

const NEXT_KIND: Record<InsightKind, InsightKind> = { data: "assumption", assumption: "recommendation", recommendation: "data" };

// Editable InsightList: strategists can edit text, re-tag, delete and add lines.
export function EditableInsights({ items, onChange, disabled }: { items: InsightItem[]; onChange: (items: InsightItem[]) => void; disabled?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="group flex items-start gap-2 text-[13px] leading-relaxed">
          <button type="button" disabled={disabled} onClick={() => onChange(items.map((x, j) => (j === i ? { ...x, kind: NEXT_KIND[x.kind] } : x)))} title={disabled ? undefined : "Click to change the tag"} className="disabled:cursor-default">
            <InsightTag kind={it.kind} />
          </button>
          <span className="min-w-0 flex-1 text-fg-2">
            <EditableText value={it.text} disabled={disabled} multiline onSave={(text) => onChange(text ? items.map((x, j) => (j === i ? { ...x, text } : x)) : items.filter((_, j) => j !== i))} />
            {it.source && <span className="ml-1 text-[11px] text-fg-3">· {it.source}</span>}
          </span>
          {!disabled && (
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-fg-3 hover:text-danger mt-0.5" aria-label="Remove line">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </li>
      ))}
      {!disabled && (
        <li>
          <button type="button" onClick={() => onChange([...items, { kind: "recommendation", text: "New line — click to edit", source: "Strategist" }])} className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline">
            <Plus className="size-3" /> Add line
          </button>
        </li>
      )}
    </ul>
  );
}

export function SectionCard({ title, subtitle, action, children, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="px-4 pb-4">{children}</div>
    </Card>
  );
}
