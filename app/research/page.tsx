"use client";

import Link from "next/link";
import styles from "./research.module.css";
import { useMemo, useState } from "react";
import { Brain, CheckCircle2, Clock, Loader2, Settings2, Sparkles } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { effectiveScore } from "@/lib/ai/scoring";
import { cn, pct, relTime } from "@/lib/utils";
import type { Lead } from "@/lib/types";
import { AIBadge, Badge, Button, Card, CardHeader, Checkbox, EmptyState, PageHeader, ScorePill, SearchInput, Stat, StatusBadge } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ResearchEvidencePanel, ResearchLegend, ResearchSections } from "@/components/sales/ResearchView";

type Queue = "todo" | "running" | "done";

export default function ResearchPage() {
  const me = useMe();
  const canWrite = can(me.role, "research", "write");
  const leads = useCRM((s) => s.leads);
  const criteria = useCRM((s) => s.settings.scoringCriteria);
  const threshold = useCRM((s) => s.settings.qualifyThreshold);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  const researchLead = useCRM((s) => s.researchLead);
  const [queue, setQueue] = useState<Queue>("done");
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
    for (const l of done) for (const s of l.research!.sections) for (const f of s.findings) { if (f.kind === "verified" && l.research?.mode) v++; else if (f.kind === "assumption") a++; else if(f.kind === "recommendation") r++; }
    const total = v + a + r || 1;
    const qualified = done.filter((l) => effectiveScore(l) >= threshold).length;
    return { verifiedPct: (v / total) * 100, assumptions: a, recs: r, qualified, coverage: (done.length / Math.max(1, leads.length)) * 100 };
  }, [buckets, leads.length, threshold]);

  const list = useMemo(() => {
    const t = q.toLowerCase();
    return buckets[queue].filter((l) => !t || `${l.name} ${l.company} ${l.industry}`.toLowerCase().includes(t));
  }, [buckets, queue, q]);

  const summaries = useMemo(() => buckets.done.slice(0, 30), [buckets]);

  const runSelected = async (ids: string[]) => {
    if (!ids.length) return;
    setSel(new Set());
    toast(`Researching ${ids.length} leads`, "Reading public sources and checking evidence", "ai");
    for (const id of ids) await researchLead(id);
    const failed=ids.filter(id=>useCRM.getState().leads.find(lead=>lead.id===id)?.research?.status!=="done").length;
    toast(failed?"Some research could not complete":"Research complete", `${ids.length-failed} assessments ready${failed?` · ${failed} need retry`:""}`,failed?"warning":"ai");
  };

  return (
    <div className={cn("space-y-5",styles.page)}>
      <PageHeader
        title={<>AI Research <AIBadge>Agent</AIBadge></>}
        description="Analyzes publicly available information about each lead and company, then scores and summarizes it."
        actions={canWrite && <Button variant="ai" icon={<Sparkles className="size-3.5" />} disabled={!buckets.todo.length} onClick={() => runSelected(buckets.todo.slice(0, 25).map((l) => l.id))}>Research top 25 in queue</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leads assessed" value={`${buckets.done.length} / ${leads.length}`} hint="With a saved assessment" icon={<Brain className="size-3.5" />} />
        <Stat label="In queue" value={buckets.todo.length} hint={`${buckets.running.length} running now`} icon={<Clock className="size-3.5" />} tone="warning" />
        <Stat label="Meets score threshold" value={stats.qualified} hint={`score ≥ ${threshold}`} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
        <Stat label="Public-source findings" value={buckets.done.reduce((count,lead)=>count+(lead.research?.mode?lead.research.sections.reduce((n,section)=>n+section.findings.filter(finding=>finding.kind==="verified").length,0):0),0)} hint={`${stats.assumptions} assumptions flagged`} icon={<Sparkles className="size-3.5" />} />
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-base font-semibold">Research results and queue</h2>
        <p className="mb-3 text-sm text-fg-2">Select Research results, then expand a company to read its marketing audit, potential problems, growth opportunities, recommended services and personalized outreach angle.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Research status">
          {([
            {value:"done",label:"Research results",count:buckets.done.length},
            {value:"todo",label:"Needs research",count:buckets.todo.length},
            {value:"running",label:"Running",count:buckets.running.length},
          ] as const).map(item=><button key={item.value} type="button" aria-pressed={queue===item.value} onClick={()=>{setQueue(item.value);setSel(new Set());setOpen(null);}} className={cn("rounded-lg border px-4 py-2 text-sm font-medium",queue===item.value?"border-accent bg-accent-soft text-accent-text":"border-border bg-surface text-fg-2 hover:bg-surface-2")}>{item.label} · {item.count}</button>)}
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-semibold">How to read AI research</p>
            <p className="text-xs text-fg-3">Public evidence is separated from CRM-supplied details, AI inferences and recommendations. Unsupported facts are omitted; missing evidence remains visible.</p>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]", aiEnabled ? "text-success" : "text-fg-3")}>
            <span className={cn("size-1.5 rounded-full", aiEnabled ? "bg-success" : "bg-fg-3")} />
            {aiEnabled ? "Public sources + AI synthesis" : "Public sources · evidence only"}
          </span>
        </div>
        <ResearchLegend />
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <h2 className="text-sm font-semibold">{queue === "done" ? "Research results" : queue === "todo" ? "Needs research" : "Running research"}</h2>
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
            {list.length === 0 && <EmptyState title={queue === "todo" ? "Queue is empty" : queue === "running" ? "Nothing running" : "No research results yet"} description={queue === "done" ? (q ? "No completed research matches your search. Clear the search to see other results." : "Choose Needs research and click Research beside a lead. Completed results will appear here.") : undefined} />}
            {list.slice(0, 150).map((l) => (
              <div key={l.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60 cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)} role="button" tabIndex={0} aria-expanded={open === l.id} onKeyDown={event => { if(event.key === "Enter" || event.key === " "){event.preventDefault();setOpen(open === l.id ? null : l.id);} }}>
                  {canWrite && queue !== "running" && <Checkbox checked={sel.has(l.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{l.company} <span className="font-normal text-fg-3">· {l.name}</span></p>
                    <p className="truncate text-xs text-fg-3">{l.industry} · {l.companySize} · {l.location}</p>
                  </div>
                  <StatusBadge status={l.status} className="hidden sm:inline-flex" />
                  {queue === "running" ? <Loader2 className="size-4 animate-spin text-accent" /> : <ScorePill score={effectiveScore(l)} overridden={l.score?.override !== undefined} />}
                  {l.research?.status==="failed"&&<span className="text-xs text-danger">{l.research.error??"Research failed; retry"}</span>}
                  {queue === "done" && <span className="shrink-0 text-xs font-medium text-accent-text">{open === l.id ? "Hide results" : "View results"}</span>}
                  {(queue === "todo" || queue === "done") && canWrite && <Button size="xs" onClick={(e) => { e.stopPropagation(); void runSelected([l.id]); }}>{queue === "done" ? "Re-research" : "Research"}</Button>}
                </div>
                {open === l.id && l.research?.status === "done" && (
                  <div className="animate-in space-y-3 bg-surface-2/40 px-4 py-4">
                    <p className="text-[13px] leading-relaxed">{l.research.summary}</p>
                    <ResearchSections research={l.research} />
                    <ResearchEvidencePanel research={l.research} onRerun={canWrite?()=>{void runSelected([l.id]);}:undefined} />
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
        <h2 className="mb-3 text-[15px] font-semibold">AI Company Summaries <span className="text-fg-3 font-normal">· completed assessments</span></h2>
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
              <Button href={`/leads/${l.id}#research-findings`} className="mt-3">View full research</Button>
            </Card>
          ))}
          {summaries.length === 0 && <Card><EmptyState title="No company summaries yet" description="Research leads to generate AI summaries." /></Card>}
        </div>
      </div>
    </div>
  );
}
