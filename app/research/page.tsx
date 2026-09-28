"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Brain, CheckCircle2, Clock, Loader2, Settings2, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { effectiveScore } from "@/lib/ai/scoring";
import { cn, pct, relTime } from "@/lib/utils";
import type { Lead } from "@/lib/types";
import { AIBadge, Badge, Button, Card, CardHeader, Checkbox, EmptyState, PageHeader, ScorePill, SearchInput, Segmented, Stat, StatusBadge } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ResearchLegend, ResearchSections } from "@/components/sales/ResearchView";

type Queue = "todo" | "running" | "done";

export default function ResearchPage() {
  const me = useMe();
  const canWrite = can(me.role, "research", "write");
  const leads = useCRM((s) => s.leads);
  const criteria = useCRM((s) => s.settings.scoringCriteria);
  const threshold = useCRM((s) => s.settings.qualifyThreshold);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const researchLead = useCRM((s) => s.researchLead);
  const [queue, setQueue] = useState<Queue>("todo");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const b: Record<Queue, Lead[]> = { todo: [], running: [], done: [] };
    for (const l of leads) {
      const st = l.research?.status;
      if (st === "running") b.running.push(l);
      else if (st === "done") b.done.push(l);
      else if (!["Won", "Lost"].includes(l.status) && !l.optedOut) b.todo.push(l);
    }
    b.todo.sort((a, z) => effectiveScore(z) - effectiveScore(a));
    b.done.sort((a, z) => (z.research?.generatedAt ?? "").localeCompare(a.research?.generatedAt ?? ""));
    return b;
  }, [leads]);

  const stats = useMemo(() => {
    const done = buckets.done;
    let v = 0, a = 0, r = 0;
    for (const l of done) for (const s of l.research!.sections) for (const f of s.findings) { if (f.kind === "verified") v++; else if (f.kind === "assumption") a++; else r++; }
    const total = v + a + r || 1;
    const qualified = done.filter((l) => effectiveScore(l) >= threshold).length;
    return { verifiedPct: (v / total) * 100, assumptions: a, recs: r, qualified, coverage: (done.length / Math.max(1, leads.length)) * 100 };
  }, [buckets, leads.length, threshold]);

  const list = useMemo(() => {
    const t = q.toLowerCase();
    return buckets[queue].filter((l) => !t || `${l.name} ${l.company} ${l.industry}`.toLowerCase().includes(t));
  }, [buckets, queue, q]);

  const summaries = useMemo(() => buckets.done.filter((l) => effectiveScore(l) >= threshold || l.status === "Qualified").slice(0, 30), [buckets, threshold]);

  const runSelected = async (ids: string[]) => {
    if (!ids.length) return;
    setSel(new Set());
    toast(`Researching ${ids.length} leads`, aiEnabled ? "Using AI provider + public website" : "Using local research engine", "ai");
    for (const id of ids) await researchLead(id);
    toast("Research complete", `${ids.length} lead summaries generated`, "ai");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>AI Research <AIBadge>Agent</AIBadge></>}
        description="Analyzes publicly available information about each lead and company, then scores and summarizes it."
        actions={canWrite && <Button variant="ai" icon={<Sparkles className="size-3.5" />} disabled={!buckets.todo.length} onClick={() => runSelected(buckets.todo.slice(0, 25).map((l) => l.id))}>Research top 25 in queue</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Research coverage" value={pct(stats.coverage, 0)} hint={`${buckets.done.length} of ${leads.length} leads`} icon={<Brain className="size-3.5" />} />
        <Stat label="In queue" value={buckets.todo.length} hint={`${buckets.running.length} running now`} icon={<Clock className="size-3.5" />} tone="warning" />
        <Stat label="Qualified by AI" value={stats.qualified} hint={`score ≥ ${threshold}`} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
        <Stat label="Verified findings" value={pct(stats.verifiedPct, 0)} hint={`${stats.assumptions} assumptions flagged`} icon={<Sparkles className="size-3.5" />} />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold">How to read AI research</p>
            <p className="text-xs text-fg-3">The agent never invents facts. Every finding is labelled so your team knows what is confirmed.</p>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]", aiEnabled ? "text-success" : "text-fg-3")}>
            <span className={cn("size-1.5 rounded-full", aiEnabled ? "bg-success" : "bg-fg-3")} />
            {aiEnabled ? "AI provider: fetches public website" : "Local engine: CRM record only"}
          </span>
        </div>
        <ResearchLegend />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Segmented value={queue} onChange={(v) => { setQueue(v); setSel(new Set()); }} options={[
              { value: "todo", label: `Not researched · ${buckets.todo.length}` },
              { value: "running", label: `Running · ${buckets.running.length}` },
              { value: "done", label: `Done · ${buckets.done.length}` },
            ]} />
            <SearchInput value={q} onChange={setQ} className="w-full sm:w-56 sm:ml-auto" />
          </div>
          {sel.size > 0 && canWrite && (
            <div className="flex items-center gap-2 border-b border-border bg-accent-soft/60 px-3 py-2">
              <span className="text-[13px] font-medium">{sel.size} selected</span>
              <Button size="xs" variant="ai" icon={<Sparkles className="size-3" />} onClick={() => runSelected([...sel])}>{queue === "done" ? "Re-research" : "Research selected"}</Button>
              <button className="ml-auto text-xs text-fg-3" onClick={() => setSel(new Set())}>Clear</button>
            </div>
          )}
          <div className="max-h-[620px] overflow-y-auto divide-y divide-border">
            {list.length === 0 && <EmptyState title={queue === "todo" ? "Queue is empty" : queue === "running" ? "Nothing running" : "No research yet"} />}
            {list.slice(0, 150).map((l) => (
              <div key={l.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60 cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  {canWrite && queue !== "running" && <Checkbox checked={sel.has(l.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{l.company} <span className="font-normal text-fg-3">· {l.name}</span></p>
                    <p className="truncate text-xs text-fg-3">{l.industry} · {l.companySize} · {l.location}</p>
                  </div>
                  <StatusBadge status={l.status} className="hidden sm:inline-flex" />
                  {queue === "running" ? <Loader2 className="size-4 animate-spin text-accent" /> : <ScorePill score={effectiveScore(l)} overridden={l.score?.override !== undefined} />}
                  {queue === "todo" && canWrite && <Button size="xs" onClick={(e) => { e.stopPropagation(); void runSelected([l.id]); }}>Research</Button>}
                </div>
                {open === l.id && l.research?.status === "done" && (
                  <div className="animate-in space-y-3 bg-surface-2/40 px-4 py-4">
                    <p className="text-[13px] leading-relaxed">{l.research.summary}</p>
                    <ResearchSections research={l.research} />
                    <Link href={`/leads/${l.id}`} className="text-xs text-accent-text hover:underline">Open lead →</Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader title="Scoring criteria" subtitle={`Qualify threshold: ${threshold}`} action={can(me.role, "settings") && <Button href="/settings?tab=scoring" size="xs" icon={<Settings2 className="size-3" />}>Configure</Button>} />
            <ul className="space-y-2 px-4 pb-4">
              {criteria.map((c) => {
                const total = criteria.filter((x) => x.enabled).reduce((a, x) => a + x.weight, 0) || 1;
                return (
                  <li key={c.key} className={cn("text-xs", !c.enabled && "opacity-40")}>
                    <div className="flex justify-between"><span className="text-fg-2">{c.label}</span><span className="tabular-nums text-fg-3">{c.enabled ? pct((c.weight / total) * 100, 0) : "off"}</span></div>
                    <div className="mt-1 h-1 rounded-full bg-surface-3"><div className="h-1 rounded-full bg-accent" style={{ width: `${c.enabled ? (c.weight / total) * 100 : 0}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-semibold">AI Lead Summaries <span className="text-fg-3 font-normal">· qualified leads</span></h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((l) => (
            <Card key={l.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/leads/${l.id}`} className="block truncate text-[13px] font-semibold hover:underline">{l.company}</Link>
                  <p className="truncate text-xs text-fg-3">{l.name} · {l.jobTitle}</p>
                </div>
                <ScorePill score={effectiveScore(l)} />
              </div>
              <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-fg-2">{l.research?.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1">{l.research?.recommendedServices.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div>
              {l.research?.outreachAngle && <p className="mt-3 rounded-md bg-surface-2 px-2 py-1.5 text-[11px] text-fg-2"><span className="font-semibold">Angle: </span>{l.research.outreachAngle}</p>}
              <p className="mt-auto pt-3 text-[11px] text-fg-3">Generated {relTime(l.research?.generatedAt)}</p>
            </Card>
          ))}
          {summaries.length === 0 && <Card><EmptyState title="No qualified summaries yet" description="Research leads to generate AI summaries." /></Card>}
        </div>
      </div>
    </div>
  );
}
