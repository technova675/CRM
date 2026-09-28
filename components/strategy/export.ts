"use client";

import type { StrategyDoc } from "@/lib/types";
import { strategyToMarkdown } from "@/lib/ai/strategy";
import { downloadFile } from "@/lib/utils";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_\((.+?)\)_/g, '<span class="src">($1)</span>')
    .replace(/\[(DATA|ASSUMPTION|RECOMMENDATION)\]/g, (_, k: string) => `<span class="tag ${k.toLowerCase()}">${k}</span>`);

// Minimal markdown → HTML for the printable view (headings, lists, tables, quotes).
function mdToHtml(md: string) {
  const out: string[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(lines[i++]!);
      i--;
      const cells = (r: string) => r.slice(1, -1).split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head!).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (l.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(lines[i++]!.slice(2));
      i--;
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
    } else if (l.startsWith("### ")) out.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (l.startsWith("## ")) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l.startsWith("# ")) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith("> ")) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (l === "---") out.push("<hr/>");
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join("\n");
}

export function downloadStrategyMarkdown(doc: StrategyDoc, clientName?: string) {
  const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadFile(`${slug}-v${doc.version}.md`, strategyToMarkdown(doc, clientName), "text/markdown");
}

export function printStrategy(doc: StrategyDoc, clientName?: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
    body{font:13px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b;max-width:860px;margin:32px auto;padding:0 24px}
    h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:26px 0 8px;border-bottom:1px solid #e4e4e7;padding-bottom:4px}h3{font-size:13px;margin:14px 0 4px}
    table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #e4e4e7;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f4f4f5;font-weight:600}
    blockquote{margin:10px 0;padding:8px 12px;background:#f4f4f5;border-left:3px solid #8b5cf6}ul{padding-left:18px}li{margin:3px 0}
    .tag{display:inline-block;font-size:10px;font-weight:600;padding:0 5px;border-radius:4px;margin-right:4px}.data{background:#e0f2fe;color:#0369a1}.assumption{background:#fef3c7;color:#b45309}.recommendation{background:#ede9fe;color:#6d28d9}
    .src{color:#71717a;font-size:11px}hr{border:0;border-top:1px solid #e4e4e7;margin:24px 0}@media print{body{margin:0}}
  </style></head><body>${mdToHtml(strategyToMarkdown(doc, clientName))}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
