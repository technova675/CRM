import {z} from "zod";
import {sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {requireStaff,staffMember,StaffError} from "@/lib/staffServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {mutateMedia} from "@/lib/mediaServer";
import {dbError} from "@/lib/db";
import {recordAudit} from "@/lib/auditServer";
import {assetDownload} from "@/lib/assetDownload";
import {LEAD_STATUSES} from "@/lib/types";
import {nextTaskOccurrence,taskDependencyIssue} from "@/lib/domain/projectTasks";

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const id=z.string().min(1).max(150);
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("taskStatus"),id,status:z.enum(["Todo","In Progress","Blocked","Done"]),previous:z.enum(["Todo","In Progress","Blocked","Done"])}),
  z.object({action:z.literal("leadStatus"),id,status:z.enum(LEAD_STATUSES),previous:z.enum(LEAD_STATUSES)}),
]);
const fail=(error:unknown)=>error instanceof StaffError?reply({error:error.message},error.status):dbError(error);

export async function GET(req:Request){
  try{
    const {data,member,owner}=await requireStaff(req);
    const allow=(module:Parameters<typeof knowledgeAccess>[2],write=false)=>knowledgeAccess(data,member.id,module,write);
    const assetId=new URL(req.url).searchParams.get("asset");
    if(assetId){
      if(!allow("documents"))return reply({error:"Document access is required."},403);
      const asset=data.assets?.find(item=>item.id===assetId&&!item.archivedAt);
      return assetDownload(asset,owner,null);
    }
    const clients=new Map((data.clients??[]).map(client=>[client.id,client.company]));
    return reply({
      organization:data.tenantProfile?.name??"Agency workspace",
      member:{name:member.name,role:member.role},
      leads:allow("leads")?{writable:allow("leads",true),rows:data.leads.slice(0,250).map(lead=>({id:lead.id,title:lead.name,company:lead.company,status:lead.status}))}:undefined,
      clients:allow("clients")?{rows:data.clients.slice(0,250).map(client=>({id:client.id,title:client.company,industry:client.industry,status:client.health}))}:undefined,
      campaigns:allow("campaigns")?{rows:data.campaigns.slice(0,250).map(campaign=>({id:campaign.id,title:campaign.name,company:clients.get(campaign.clientId),status:campaign.status,platform:campaign.platform}))}:undefined,
      tasks:allow("tasks")?{writable:allow("tasks",true),rows:data.tasks.filter(task=>task.assigneeId===member.id).slice(0,250).map(task=>({id:task.id,title:task.title,status:task.status,dueDate:task.dueDate,priority:task.priority}))}:undefined,
      invoices:allow("payments")?{rows:data.invoices.slice(0,250).map(invoice=>({id:invoice.id,title:invoice.number,company:clients.get(invoice.clientId),status:invoice.status,balance:invoice.amount-invoice.paid}))}:undefined,
      reports:allow("reports")?{rows:(data.clientReporting?.reports??[]).slice(0,250).map(report=>({id:report.id,title:report.frequency+" report",company:report.facts.company,status:report.status}))}:undefined,
      documents:allow("documents")?{rows:(data.assets??[]).filter(asset=>!asset.archivedAt&&asset.versions.some(version=>version.file)).slice(0,250).map(asset=>({id:asset.id,title:asset.name,company:asset.clientId?clients.get(asset.clientId):undefined,folder:asset.folder}))}:undefined,
    });
  }catch(error){return fail(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const {actor,owner}=await requireStaff(req);
    const parsed=input.safeParse(await boundedJSON(req,4096).catch(()=>null));
    if(!parsed.success)return reply({error:"Choose a valid status."},400);
    const request=parsed.data;
    await mutateMedia(owner,crypto.randomUUID(),data=>{
      const member=staffMember(data,owner,actor);
      const task=request.action==="taskStatus";
      const area=task?"tasks":"leads";
      if(!member||!knowledgeAccess(data,member.id,area,true))throw new StaffError("Your role cannot edit this record.",403);
      const record=task?data.tasks.find(item=>item.id===request.id&&item.assigneeId===member.id):data.leads.find(item=>item.id===request.id);
      if(!record)throw new StaffError("Record not found in your workspace.",404);
      if(record.status!==request.previous)throw new StaffError("The record changed. Refresh before updating.",409);
      if(request.status===request.previous)return data;
      if(request.action==="taskStatus"){
        const item=data.tasks.find(item=>item.id===record.id)!;
        const changed={...item,status:request.status};
        const issue=taskDependencyIssue(changed,new Map(data.tasks.map(entry=>[entry.id,entry])));
        if(issue)throw new StaffError(issue,409);
        Object.assign(item,changed);
        if(request.status==="Done"){
          const next=nextTaskOccurrence(item,new Date().toISOString());
          if(next&&!data.tasks.some(entry=>entry.id===next.id))data.tasks.unshift(next);
        }
      }else data.leads.find(item=>item.id===record.id)!.status=request.status;
      recordAudit(data,{actor:"human",actorId:member.id,entity:task?"task":"lead",entityId:record.id,action:task?"Updated task status":"Updated lead status",before:request.previous,after:request.status,outcome:"Saved"});
      return data;
    });
    return reply({ok:true});
  }catch(error){return fail(error);}
}
