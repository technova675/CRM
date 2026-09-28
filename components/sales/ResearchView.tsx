"use client";

import { CheckCircle2, HelpCircle, Lightbulb } from "lucide-react";
import type { LeadResearch, ResearchFinding } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND_META: Record<ResearchFinding["kind"], { label: string; icon: typeof CheckCircle2; cls: string; desc: string }> = {
  verified: { label: "Verified", icon: CheckCircle2, cls: "text-success bg-success-soft", desc: "Directly supported by the CRM record or fetched public content — source shown." },
  assumption: { label: "Assumption", icon: HelpCircle, cls: "text-warning bg-warning-soft", desc: "Inferred by the AI. Confirm before using it in a message." },
  recommendation: { label: "Recommendation", icon: Lightbulb, cls: "text-accent-text bg-accent-soft", desc: "Suggested action or service from Adbibe's playbook." },
};

export function KindTag({ kind }: { kind: ResearchFinding["kind"] }) {
  const m = KIND_META[kind];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", m.cls)}>
      <m.icon className="size-3" />
      {m.label}
    </span>
  );
}

export function ResearchLegend({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-3", className)}>
      {(Object.keys(KIND_META) as ResearchFinding["kind"][]).map((k) => (
        <div key={k} className="rounded-lg border border-border p-2.5">
          <KindTag kind={k} />
          <p className="mt-1.5 text-xs text-fg-3">{KIND_META[k].desc}</p>
        </div>
      ))}
    </div>
  );
}

export function ResearchSections({ research }: { research: LeadResearch }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {research.sections.map((s) => (
        <div key={s.key} className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-fg-2">{s.title}</p>
          <ul className="space-y-2">
            {s.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <KindTag kind={f.kind} />
                <span className="min-w-0">
                  <span className="text-fg">{f.text}</span>
                  {f.source && <span className="block text-[11px] text-fg-3">Source: {f.source}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
