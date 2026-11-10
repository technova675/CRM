"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, History } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { effectiveApprovalMode } from "@/lib/domain/approvalPolicy";
import { can, type Module } from "@/lib/permissions";
import { useCRM, useMe } from "@/lib/store";
import type { AIActionKind } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";

type QueueItem = {
  id:string;kind:AIActionKind;title:string;detail:string;at:string;module:Module;href?:string;preview?:string;
  decide:(approve:boolean)=>Promise<void>;
};
type ServerQueue = {
  reports:{id:string;title:string;at:string;version:string;summary:string;email:{to:string[];subject:string;body:string}}[];
  outreach:{id:string;campaignId:string;title:string;at:string;detail:string;version:string;followUp:boolean}[];
  concepts:{id:string;title:string;at:string;version:string;detail:string}[];
};
const request = async (url:string,body:unknown)=>{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error || "The decision could not be saved.");
};
const legacyModules:Record<AIActionKind,Module>={
  Outreach:"outreach","Follow-ups":"outreach","Campaign changes":"campaigns","Campaign recommendations":"performance",
  "Client communication":"clients",Reports:"reports","Payment reminders":"payments","Creative generation":"creative",
  "Social publishing":"social","Video exports":"video","Strategy documents":"strategy",Proposals:"proposals",
  "Task creation":"tasks","SEO changes":"seo","Influencer outreach":"influencers",
};

export default function ApprovalsPage(){
  const me=useMe();
  const approvals=useCRM(s=>s.approvals),activities=useCRM(s=>s.activities),team=useCRM(s=>s.team);
  const workflows=useCRM(s=>s.marketingAutomations),recommendations=useCRM(s=>s.recommendations),posts=useCRM(s=>s.socialPosts);
  const modes=useCRM(s=>s.settings.approvalModes),spend=useCRM(s=>s.settings.allowAutonomousSpendChanges);
  const [server,setServer]=useState<ServerQueue>({reports:[],concepts:[],outreach:[]});
  const [tab,setTab]=useState<"queue"|"audit">("queue");
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch("/api/approvals",{cache:"no-store",signal});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || "The queue could not be loaded.");
    setServer(result);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>void load(controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    refresh();
    window.addEventListener("focus",refresh);
    return()=>{controller.abort();window.removeEventListener("focus",refresh);};
  },[load]);

  const items:QueueItem[]=[];
  const policy={modes,allowAutonomousSpendChanges:spend};
  const add=(item:QueueItem)=>{if(can(me.role,item.module))items.push(item);};
  for(const report of server.reports)add({
    id:"report:"+report.id,kind:"Reports",title:report.title,at:report.at,module:"reports",href:"/reports?view=client",
    preview:"/api/reports/client?id="+encodeURIComponent(report.id)+"&format=pdf",
    detail:["To "+(report.email.to.join(", ")||"No recipients"),report.email.subject,report.email.body,report.summary].join("\n\n"),
    decide:approve=>request("/api/approvals",{action:approve?"approve":"reject",kind:"report",id:report.id,version:report.version}),
  });
  for(const concept of server.concepts)add({
    id:"concept:"+concept.id,kind:"Creative generation",title:concept.title,at:concept.at,detail:concept.detail,module:"creative",href:"/creative?tab=concepts",
    decide:approve=>request("/api/approvals",{action:approve?"approve":"reject",kind:"concept",id:concept.id,version:concept.version}),
  });
  for(const draft of server.outreach)add({
    id:"outreach:"+draft.campaignId+":"+draft.id,kind:draft.followUp?"Follow-ups":"Outreach",title:draft.title,at:draft.at,detail:draft.detail,module:"outreach",href:"/outreach?c="+encodeURIComponent(draft.campaignId),
    decide:approve=>request("/api/approvals",{action:approve?"approve":"reject",kind:"outreach",id:draft.id,campaignId:draft.campaignId,version:draft.version}),
  });
  for(const rec of recommendations){
    const plan=rec.mediaPlan;
    if(!plan||!["New","Awaiting Approval"].includes(rec.status))continue;
    const kind=plan.action==="budget_change"?"Campaign changes":"Campaign recommendations";
    if(effectiveApprovalMode(policy,kind)==="Manual")continue;
    add({id:"media:"+rec.id,kind,title:rec.title,detail:[rec.finding,rec.recommendation,rec.test,plan.budget!==undefined?"Proposed internal budget ₹"+plan.budget:"Implementation task proposal"].filter(Boolean).join("\n\n"),at:rec.createdAt,module:"performance",href:"/performance",
      decide:approve=>request("/api/media/actions",{operationId:crypto.randomUUID(),recommendationId:rec.id,decision:approve?"approve":"dismiss",expectedSignature:plan.signature})});
  }
  for(const post of posts)if(post.workflowVersion===2&&post.stage==="Awaiting Approval"&&!post.humanApproval){
    add({id:"social:"+post.id,kind:"Social publishing",title:post.title,at:post.updatedAt??post.createdAt,detail:[post.platform,post.caption,(post.mediaUrls??[]).join("\n")].filter(Boolean).join("\n\n"),module:"social",href:"/social",
      decide:approve=>request("/api/social",{operationId:crypto.randomUUID(),action:approve?"approve":"reject",postId:post.id,expectedUpdatedAt:post.updatedAt??post.createdAt})});
  }
  for(const workflow of workflows)for(const run of workflow.history){
    const payload=run.data.payload;
    if(run.status!=="Waiting approval"||!payload||run.dryRun)continue;
    add({id:"workflow:"+run.id,kind:workflow.entity==="invoice"?"Payment reminders":workflow.entity==="lead"?"Outreach":workflow.entity==="report"?"Reports":"Client communication",
      title:workflow.name,at:run.updatedAt,detail:["To "+payload.to.join(", "),payload.subject,payload.body].join("\n\n"),module:"automations",href:"/automations",
      decide:approve=>request("/api/automations",{operationId:crypto.randomUUID(),action:approve?"approve":"reject",workflowId:workflow.id,runId:run.id,reviewVersion:run.updatedAt})});
  }
  for(const item of approvals)if(item.status==="pending"&&legacyModules[item.kind]&&!recommendations.some(r=>r.mediaPlan&&r.id===item.ref?.id)){
    add({id:"request:"+item.id,kind:item.kind,title:item.title,detail:item.detail,at:item.createdAt,module:legacyModules[item.kind],
      decide:async approve=>{
        const current=useCRM.getState();
        if(current.approvals.find(a=>a.id===item.id)?.status!=="pending")throw new Error("This request has already been decided.");
        current.resolveApproval(item.id,approve);
        if(useCRM.getState().approvals.find(a=>a.id===item.id)?.status==="pending")throw new Error("The linked record changed. Open its workspace and request a fresh review.");
        await flushCRMChanges();
      }});
  }
  items.sort((a,b)=>b.at.localeCompare(a.at));
  const active=items.find(item=>item.id===selected);
  const audit=activities.filter(entry=>/approval policy|approv|reject|automatically|created task from command center/i.test(entry.action))
    .filter(entry=>entry.entity==="recommendation"?can(me.role,"performance"):entry.entity==="settings"?me.role==="admin":can(me.role,"automations"))
    .slice(0,200);

  async function decide(item:QueueItem,approve:boolean){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await flushCRMChanges();
      await item.decide(approve);
      await refreshCRMChanges();
      await load();
      setSelected("");
      setNotice(approve?"Approval saved.":"Rejection saved.");
    }catch(error){setError(error instanceof Error?error.message:"Decision failed.");}
    finally{setBusy(false);}
  }

  return <div className="space-y-4">
    <PageHeader title="AI Approvals" icon={<ClipboardCheck className="size-5 text-fg-3"/>} description="Review prepared work and see who made each decision." actions={<>{can(me.role,"settings")&&<Button href="/audit" className="min-h-11">Full audit log</Button>}{me.role==="admin"&&<Button href="/settings?tab=ai" className="min-h-11">Configure action modes</Button>}</>}/>
    <Tabs value={tab} onChange={setTab} tabs={[{value:"queue",label:"Review queue",count:items.length},{value:"audit",label:"Audit history"}]}/>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
    {tab==="queue"?<div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card>
        <CardHeader title="Pending review" subtitle="Select a request to inspect its current content."/>
        {!items.length&&<EmptyState title="No pending requests"/>}
        <ul className="divide-y divide-border">
          {items.map(item=><li key={item.id}><button type="button" onClick={()=>setSelected(item.id)} aria-pressed={item.id===selected} className="block min-h-11 w-full px-4 py-3 text-left hover:bg-surface-2 aria-pressed:bg-accent-soft">
            <span className="block break-words text-sm font-medium">{item.title}</span>
            <span className="block text-xs text-fg-3">{item.kind} · {fmtDateTime(item.at)}</span>
          </button></li>)}
        </ul>
      </Card>
      <Card>
        {active?<><CardHeader title={active.title} subtitle={active.kind}/><div className="space-y-4 px-4 pb-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{active.detail}</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant="primary" disabled={busy||!can(me.role,active.module,"write")} onClick={()=>void decide(active,true)}>Approve</Button>
            <Button className="min-h-11" disabled={busy||!can(me.role,active.module,"write")} onClick={()=>void decide(active,false)}>Reject</Button>
            {active.preview&&<a className="inline-flex min-h-11 items-center px-3 text-sm text-accent-text underline" href={active.preview}>Download report PDF</a>}
            {active.href&&<Button className="min-h-11" href={active.href}>Open workspace</Button>}
          </div>
        </div></>:<EmptyState icon={<ClipboardCheck className="size-5"/>} title="Select an action to review"/>}
      </Card>
    </div>:<Card>
      <CardHeader title="Audit history" subtitle="Recorded approvals, rejections, policy changes and automatic actions."/>
      {!audit.length&&<EmptyState icon={<History className="size-5"/>} title="No decisions recorded yet"/>}
      <ul className="divide-y divide-border">{audit.map(entry=><li key={entry.id} className="space-y-1 p-4">
        <div className="flex flex-wrap gap-2"><p className="font-medium">{entry.action}</p><Badge tone={entry.actor==="ai"?"info":"neutral"}>{entry.actor==="ai"?"AI":team.find(item=>item.id===entry.actorId)?.name??"Staff"}</Badge></div>
        <p className="whitespace-pre-wrap break-words text-sm text-fg-2">{entry.detail}</p><p className="text-xs text-fg-3">{fmtDateTime(entry.at)}</p>
      </li>)}</ul>
    </Card>}
  </div>;
}
