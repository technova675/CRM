"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Safe markdown-ish renderer (no dangerouslySetInnerHTML): **bold**, _italic_,
// bullets ("• ", "- ", "* "), numbered lines ("1. ") and line breaks.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={i} className="text-fg-3">{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = (key: number) => {
    if (!list) return;
    out.push(
      list.ordered ? (
        <ol key={`l${key}`} className="list-decimal space-y-0.5 pl-5">{list.items}</ol>
      ) : (
        <ul key={`l${key}`} className="list-disc space-y-0.5 pl-5 marker:text-fg-3">{list.items}</ul>
      ),
    );
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:•|-|\*)\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num && !bullet;
      if (list && list.ordered !== ordered) flush(i);
      list ??= { ordered, items: [] };
      list.items.push(<li key={i}>{inline((bullet ?? num)![1]!)}</li>);
      return;
    }
    flush(i);
    if (!line.trim()) out.push(<div key={i} className="h-1.5" />);
    else if (line.trim() === "---") out.push(<hr key={i} className="my-2 border-border" />);
    else out.push(<p key={i}>{inline(line)}</p>);
  });
  flush(lines.length);
  return <div className={cn("space-y-1 break-words text-[13px] leading-relaxed text-fg-2", className)}>{out}</div>;
}
