import type { CRMLibrary } from "./domain/crmLibrary";
import type { Activity } from "./types";

type Input = Omit<Activity,"id"|"at"|"origin">;
const cap = (value:string|undefined,max:number)=>value?.slice(0,max);
export function recordAudit(data:CRMLibrary,event:Input) {
  const entry:Activity={...event,id:crypto.randomUUID(),at:new Date().toISOString(),origin:"server",
    action:cap(event.action,160)!,detail:cap(event.detail,500),before:cap(event.before,900),after:cap(event.after,900),
    sources:event.sources?.slice(0,12).map(value=>value.slice(0,160)),outcome:cap(event.outcome,140)};
  data.auditEvents=[entry,...(data.auditEvents??[])].slice(0,700);
}

export function trimAudit(data:CRMLibrary,limit=7_950_000){
  const events=data.auditEvents;
  if(!events?.length)return;
  let size=Buffer.byteLength(JSON.stringify(data));
  while(events.length&&size>limit)size-=Buffer.byteLength(JSON.stringify(events.pop()))+1;
}

type Collection = "clients"|"campaigns"|"leads"|"deals"|"tasks"|"invoices"|"assets"|"strategies"|"approvals";
const entities:Record<Collection,Activity["entity"]>={clients:"client",campaigns:"campaign",leads:"lead",deals:"deal",tasks:"task",invoices:"invoice",assets:"document",strategies:"strategy",approvals:"automation"};
const fields:Record<Collection,string[]>={
  clients:["company","industry","location","health","retainer","accountManagerId","services","contractStart","contractEnd","contacts","documents","onboarding","onboardingWorkspace"],
  campaigns:["name","clientId","service","platform","objective","budget","budgetPeriod","status","startDate","endDate","ownerId","kpis","metrics","performanceRows","audience","tracking"],
  leads:["company","status","ownerId","source","services","score","research","tags","notes"],
  deals:["title","clientId","stage","ownerId","value","probability","expectedClose","paymentStatus"],
  tasks:["title","status","priority","dueDate","assigneeId","projectId","dependsOn"],
  invoices:["number","clientId","amount","paid","status","dueDate","payments"],
  assets:["name","clientId","folder","tags","clientVisible","archivedAt"],
  strategies:["title","clientId","status","version","summary","sections"],
  approvals:["kind","title","status"],
};
const privateFields=new Set(["contacts","documents","onboarding","onboardingWorkspace","research","notes","sections","summary","audience","tracking"]);
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));
  return value;
}
const serialized=(value:unknown)=>JSON.stringify(stable(value));
function display(value:unknown,key:string){
  if(value===undefined||value===null)return "—";
  if(privateFields.has(key))return Array.isArray(value)?value.length+" entries":"Present";
  if(Array.isArray(value))return value.every(item=>typeof item==="string")?value.join(", ").slice(0,160):value.length+" entries";
  if(typeof value==="object")return "Recorded";
  return String(value).slice(0,160);
}
function deltaText(record:Record<string,unknown>|undefined,other:Record<string,unknown>|undefined,changed:string[]){
  if(!record)return "No record";
  return changed.map(key=>{
    const value=display(record[key],key);
    return key+" · "+(other&&value===display(other[key],key)?value+" (details changed)":value);
  }).join("\n");
}
export function auditLibraryChanges(previous:CRMLibrary|undefined,next:CRMLibrary,actorId:string){
  const changes:Input[]=[];
  const refs=clientReferences(next);
  const priorRefs=previous?clientReferences(previous):new Map<string,string>();
  const keys=Object.keys(entities) as Collection[];
  for(const key of keys){
    const old=new Map((previous?.[key]??[]).map(item=>[item.id,item as unknown as Record<string,unknown>]));
    const current=new Map((next[key]??[]).map(item=>[item.id,item as unknown as Record<string,unknown>]));
    for(const id of new Set([...old.keys(),...current.keys()])){
      const before=old.get(id),after=current.get(id);
      const changed=fields[key].filter(field=>serialized(before?.[field])!==serialized(after?.[field]));
      if(!changed.length)continue;
      const record=after??before;
      const status=key==="approvals"?after?.status:undefined;
      const label=key==="approvals"?"AI approval":entities[key];
      const action=status==="approved"?"Approved AI action":status==="rejected"?"Rejected AI action":(before?after?"Updated ":"Deleted ":"Created ")+label;
      changes.push({actor:"human",actorId,agent:key==="approvals"?record?.agent as Activity["agent"]:undefined,entity:entities[key],entityId:id,
        clientId:refs.get(id)??priorRefs.get(id),action,detail:String(record?.name??record?.company??record?.title??record?.number??"").slice(0,160),
        sources:[key+" record"],approvedBy:status==="approved"?actorId:undefined,outcome:status==="approved"?"Approved":status==="rejected"?"Rejected":before?after?"Saved":"Deleted":"Created",
        before:deltaText(before,after,changed),after:deltaText(after,before,changed)});
    }
  }
  for(const event of changes.slice(0,100).reverse())recordAudit(next,event);
  if(changes.length>100)recordAudit(next,{actor:"human",actorId,entity:"organization",action:"Saved bulk CRM changes",detail:changes.length+" changed records. The first 100 changes were captured individually.",outcome:"Saved"});
}

export function clientReferences(data:CRMLibrary){
  const refs=new Map<string,string>();
  for(const client of data.clients??[])refs.set(client.id,client.id);
  const attach=(items:{id:string;clientId?:string}[])=>{for(const item of items)if(item.clientId)refs.set(item.id,item.clientId);};
  for(const items of [data.campaigns,data.deals,data.invoices,data.assets,data.strategies,data.concepts,data.creatives,data.socialPosts,data.seoProjects,data.recommendations,data.projects,data.analyticsFeeds,data.clientReporting?.reports,data.marketingAutomations,data.knowledge,data.reports,data.engagements])attach(items??[]);
  for(const deal of data.deals??[])if(deal.clientId&&deal.leadId)refs.set(deal.leadId,deal.clientId);
  for(const task of data.tasks??[]){
    const clientId=refs.get(task.projectId??"")??refs.get(task.related?.id??"");
    if(clientId)refs.set(task.id,clientId);
  }
  for(const flow of data.marketingAutomations??[])for(const run of flow.history??[]){
    const clientId=flow.clientId??refs.get(run.entityId);
    if(clientId)refs.set(run.id,clientId);
  }
  for(const approval of data.approvals??[]){
    const clientId=refs.get(approval.ref?.id??"");
    if(clientId)refs.set(approval.id,clientId);
  }
  for(const run of data.integrationRuns??[]){const id=refs.get(run.campaignId);if(id)refs.set(run.id,id);}
  return refs;
}
