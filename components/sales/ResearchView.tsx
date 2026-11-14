"use client";

import { CheckCircle2, HelpCircle, Lightbulb, FileText, CircleAlert, ExternalLink } from "lucide-react";
import type { LeadResearch, ResearchFinding } from "@/lib/types";
import { cn } from "@/lib/utils";
import {Button} from "@/components/ui";

export const KIND_META: Record<ResearchFinding["kind"], { label: string; icon: typeof CheckCircle2; cls: string; desc: string }> = {
  verified: { label: "Verified excerpt", icon: CheckCircle2, cls: "text-success bg-success-soft", desc: "Observed in a fetched public source. This verifies what was published, not the truth of every claim." },
  assumption: { label: "AI inference", icon: HelpCircle, cls: "text-warning bg-warning-soft", desc: "An interpretation with a cited basis. Confirm before using it in a message." },
  recommendation: { label: "Recommendation", icon: Lightbulb, cls: "text-accent-text bg-accent-soft", desc: "Suggested action or service from Adbibe's playbook." },
  record: {label:"CRM supplied",icon:FileText,cls:"text-info bg-info-soft",desc:"Provided by a person or import. Not independently verified against public information."},
  unavailable: {label:"Not verified",icon:CircleAlert,cls:"text-fg-2 bg-surface-2",desc:"No reliable evidence was obtained. Missing or blocked sources do not establish a problem."},
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
        <div id={`research-section-${s.key}`} key={s.key} className="scroll-mt-20 rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold text-fg-2">{s.title}</p>
          <ul className="space-y-2">
            {s.findings.map((f, i) => (
              <li key={i} className="flex flex-col items-start gap-2 text-[13px] sm:flex-row">
                <KindTag kind={!research.mode && f.kind==="verified" ? "record" : f.kind} />
                <span className="min-w-0">
                  <span className="text-fg">{f.text}</span>
                  {f.evidenceQuote && f.kind!=="verified" && <blockquote className="mt-2 border-l-2 border-border pl-2 text-xs leading-6 text-fg-2">“{f.evidenceQuote}”</blockquote>}
                  {f.source && (/^https?:\/\//i.test(f.source)?<a href={f.source} target="_blank" rel="noreferrer" className="mt-1 flex min-h-11 items-center gap-1 break-all text-xs text-accent-text underline">Source <ExternalLink size={12} aria-hidden="true"/>{f.source}</a>:<span className="mt-1 block text-xs text-fg-2">Source: {f.source}</span>)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ResearchEvidencePanel({research,onRerun}:{research:LeadResearch;onRerun?:()=>void}){
  const missingTopicDetail=research.coverage?.some(item=>item.status!=="unavailable"&&!item.findings?.length);
  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-surface p-4"><p className="text-sm font-semibold">{research.mode==="public_ai"?"Public research + AI synthesis":research.mode==="public_evidence"?"Public evidence only":research.mode==="crm_only"?"CRM-only assessment":"Imported or older research · not independently verified"}</p>{research.model&&<p className="mt-1 text-xs text-fg-2">Model: {research.model}</p>}{research.identityAssessment&&<p className={research.identityAssessment.status==="not_verified"?"mt-2 text-xs font-medium text-warning":"mt-2 text-xs text-fg-2"}>{research.identityAssessment.status==="not_verified"?"Identity Not Verified":"AI source-identity check passed"}: {research.identityAssessment.reason}</p>}<p className="mt-2 text-xs leading-6 text-fg-2">Only matched public-source observations are labelled as evidence. Inferences and recommendations require review. A profile link, tracking tag or unreadable page does not prove activity or inactivity.</p></div>
    {missingTopicDetail&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4"><p className="max-w-xl text-sm leading-6">This older research result did not save which source excerpt supports each topic. Re-run research to see the target audience and other findings with their sources.</p>{onRerun&&<Button className="min-h-11" onClick={onRerun}>Re-run research</Button>}</div>}
    {research.coverage&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Research coverage">{research.coverage.map(item=><div key={item.topic} className="rounded-lg border border-border bg-surface p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.label}</span><span className={item.status==="evidence"&&item.findings?.length?"text-success":item.status==="inference"&&item.findings?.length?"text-warning":"text-fg-2"}>{item.status!=="unavailable"&&!item.findings?.length?"Detail unavailable":item.status==="evidence"?"Evidence found":item.status==="inference"?"Inference only":"Not verified"}</span></div>{item.findings?.length?<ul className="mt-2 space-y-2 border-t border-border pt-2">{item.findings.map((finding,index)=><li key={index} className="leading-5"><KindTag kind={finding.kind}/><p className="mt-1 break-words text-fg-2">{finding.text}</p>{finding.source&&(/^https?:\/\//i.test(finding.source)?<a href={finding.source} target="_blank" rel="noreferrer" className="mt-1 block break-all text-accent-text underline">View source</a>:<p className="mt-1 text-fg-3">Source: {finding.source}</p>)}</li>)}</ul>:item.status!=="unavailable"?<p className="mt-2 leading-5 text-fg-2">The topic-specific excerpt was not saved in this result.</p>:null}</div>)}</div>}
    {!!research.limitations?.length&&<div className="rounded-xl border border-warning/30 bg-warning-soft p-4"><p className="text-sm font-semibold">Research limitations</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-6">{research.limitations.map((limitation,index)=><li key={index}>{limitation}</li>)}</ul></div>}
    {!!research.sources?.length&&<details className="rounded-xl border border-border bg-surface p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Sources checked · {research.sources.length}</summary><ul className="mt-3 space-y-3">{research.sources.map(source=><li key={source.id} className="rounded-lg border border-border p-3 text-xs"><a href={/^https?:\/\//i.test(source.url)?source.url:undefined} target="_blank" rel="noreferrer" className="break-all text-accent-text underline">{source.title} · {source.url}</a><p className="mt-1 text-fg-2">{source.status==="ok"?"Read successfully":"Unavailable"} · {new Date(source.checkedAt).toLocaleString()}</p>{source.reason&&<p className="mt-1 text-fg-2">{source.reason}</p>}</li>)}</ul></details>}
  </div>;
}
