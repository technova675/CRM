"use client";
import {useMemo} from "react";
import {useNow} from "@/components/useNow";
import type {SocialPost} from "@/lib/types";
import {analyticsSummary,postResults} from "@/lib/domain/socialStudio";
import {Badge,Button,Card} from "@/components/ui";
import type {StudioData} from "./useStudio";

export type SocialView="Overview"|"Accounts"|"Strategy"|"Studio"|"Calendar"|"Publishing"|"Approvals"|"Analytics";
const pct=(n:number|null)=>n===null?"Not measured":`${n.toFixed(2)}%`;

/** One-screen status of a client's social media and the next step in the operating cycle. */
export function OverviewTab({company,posts,data,onGo}:{company:string;posts:SocialPost[];data:StudioData|null;onGo:(v:SocialView)=>void}){
  const now=useNow(),week=now+7*864e5;
  const results=useMemo(()=>data?postResults(data.metrics,posts,posts[0]?.clientId??""):[],[data,posts]);
  const summary=useMemo(()=>analyticsSummary(results),[results]);
  const due=posts.filter(p=>p.stage==="Scheduled"&&p.scheduledAt&&Date.parse(p.scheduledAt)<=week).sort((a,b)=>a.scheduledAt!.localeCompare(b.scheduledAt!));
  const overdue=due.filter(p=>Date.parse(p.scheduledAt!)<now);
  const awaiting=posts.filter(p=>p.stage==="Awaiting Approval"&&!p.humanApproval).length;
  const rec=data?.recommendations[0];
  const steps:{label:string;done:boolean;view:SocialView;hint:string}[]=[
    {label:"Analyze",done:!!data?.accounts.some(a=>a.audit),view:"Accounts",hint:"Add the client's accounts and run an AI audit"},
    {label:"Strategize",done:!!data?.plans.length,view:"Strategy",hint:"Build the month's social strategy"},
    {label:"Ideate & create",done:posts.length>0,view:"Studio",hint:"Turn the plan into posts, scripts and visuals"},
    {label:"Review & approve",done:posts.some(p=>!!p.humanApproval),view:"Approvals",hint:"AI review, team approval and client sign-off"},
    {label:"Schedule",done:posts.some(p=>p.stage==="Scheduled"||p.stage==="Published"),view:"Calendar",hint:"Put approved posts on the calendar"},
    {label:"Publish",done:posts.some(p=>p.stage==="Published"),view:"Publishing",hint:"Publish on the day and record the live link"},
    {label:"Analyze results",done:results.length>0,view:"Analytics",hint:"Import results from Instagram or Meta exports"},
    {label:"Optimize",done:!!rec,view:"Analytics",hint:"Get AI recommendations for next month"},
  ];
  const next=steps.find(s=>!s.done);
  return <div className="space-y-5">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{company}: social media cycle</h2><p className="mt-1 text-sm text-fg-2">{next?<>Next step: <strong>{next.label}</strong>. {next.hint}.</>:"Every step has been completed at least once. Keep the cycle running each month."}</p></div>{next&&<Button className="min-h-11" variant="primary" onClick={()=>onGo(next.view)}>Go to {next.view}</Button>}</div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{steps.map((s,i)=><li key={s.label}><button onClick={()=>onGo(s.view)} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border p-3 text-left text-sm hover:border-accent"><span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done?"bg-success/20 text-success":"bg-surface-2 text-fg-2"}`}>{s.done?"✓":i+1}</span><span>{s.label}</span></button></li>)}</ol>
    </Card>
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
      ["Awaiting approval",String(awaiting)],["Due in 7 days",String(due.length)],["Avg engagement rate",pct(summary.avgRate)],["Posts measured",String(summary.posts)],
    ].map(([label,value])=><Card key={label} className="p-4"><dt className="text-xs text-fg-2">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></Card>)}</dl>
    {overdue.length>0&&<Card className="border-warning/40 p-4"><h3 className="font-semibold text-warning">{overdue.length} planned post{overdue.length>1?"s are":" is"} past the planned time</h3><p className="mt-1 text-sm text-fg-2">Publish {overdue.length>1?"them":"it"} now and record the live link, or move {overdue.length>1?"them":"it"} to a new date.</p><Button className="mt-3 min-h-11" onClick={()=>onGo("Publishing")}>Open Publishing</Button></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4"><h3 className="font-semibold">Account health</h3>
        {!data?.accounts.length?<p className="mt-2 text-sm text-fg-2">No accounts added yet.</p>:<ul className="mt-3 space-y-2">{data.accounts.map(a=><li key={a.id} className="flex items-center justify-between gap-3 text-sm"><span>{a.platform} · @{a.handle}</span><span className="text-fg-2">{a.followers?.toLocaleString("en-IN")??"–"} followers · {a.audit?<Badge tone={a.audit.score>=70?"success":a.audit.score>=45?"warning":"danger"}>{a.audit.score}/100</Badge>:"Not audited"}</span></li>)}</ul>}
        <Button className="mt-3 min-h-11" onClick={()=>onGo("Accounts")}>Manage accounts</Button></Card>
      <Card className="p-4"><h3 className="font-semibold">AI recommendations</h3>
        {rec?<><p className="mt-2 text-sm leading-6">{rec.output.summary}</p><ul className="mt-2 space-y-1 text-sm">{rec.output.actionPlan.slice(0,3).map((a,i)=><li key={i}><Badge tone={a.priority==="High"?"danger":a.priority==="Medium"?"warning":"neutral"}>{a.priority}</Badge> {a.action}</li>)}</ul><p className="mt-2 text-xs text-fg-2">{new Date(rec.at).toLocaleDateString("en-IN")} · {rec.source} · AI opinion</p></>
        :<p className="mt-2 text-sm text-fg-2">{results.length>=3?`${results.length} posts are measured. Ask for recommendations in Analytics.`:"Import results from at least 3 published posts, then ask for recommendations in Analytics."}</p>}
        <Button className="mt-3 min-h-11" onClick={()=>onGo("Analytics")}>Open Analytics</Button></Card>
    </div>
    {due.length>0&&<Card className="p-4"><h3 className="font-semibold">Publishing in the next 7 days</h3><ul className="mt-2 space-y-1 text-sm">{due.map(p=><li key={p.id} className={Date.parse(p.scheduledAt!)<now?"text-warning":""}>{new Date(p.scheduledAt!).toLocaleString("en-IN",{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})} · {p.platform} {p.format} · {p.title}</li>)}</ul></Card>}
  </div>;
}
