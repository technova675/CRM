import {recordAudit} from "@/lib/auditServer";
import {createHash} from "node:crypto";
import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {approvalPolicy,effectiveApprovalMode} from "@/lib/domain/approvalPolicy";
import {AI_ACTIONS,type CreativeConcept} from "@/lib/types";
import {destination,suppressed} from "@/lib/domain/outreach";
import {dbError} from "@/lib/db";
import {approveReport,getClientReport,reportEmail,ReportError} from "@/lib/clientReportingServer";
import {emptyCRMLibrary,type CRMLibrary} from "@/lib/domain/crmLibrary";

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
class ReviewError extends Error{constructor(message:string,readonly status=409){super(message);}}
const modes=z.record(z.enum(AI_ACTIONS),z.enum(["Manual","Approval Required","Automatic"]));
const decision=z.object({action:z.enum(["approve","reject"]),kind:z.enum(["report","concept","outreach"]),campaignId:z.string().max(150).optional(),id:z.string().max(150),version:z.string().length(64)});
const policySchema=z.object({modes,allowAutonomousSpendChanges:z.boolean()});
const settings=policySchema.extend({action:z.literal("policy"),expected:policySchema.optional()});
const schema=z.union([settings,decision]);
const hash=(parts:unknown)=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
function conceptVersion(c:CreativeConcept) {
  return hash([c.title,c.kind,c.platform,c.angle,c.hook,c.headline,c.script,c.storyboard,c.cta]);
}
function reportVersion(r:ReturnType<typeof getClientReport>) {
  return hash([r.id,r.createdAt,r.status,r.recipients,r.facts,r.copy]);
}
function audit(data:CRMLibrary,actorId:string,action:string,entityId:string,detail:string,version?:string,metadata?:{clientId?:string;agent?:import("@/lib/types").AgentId;entity?:import("@/lib/types").Activity["entity"];source?:string}){
  data.activities.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),actor:"human",actorId,entity:"automation",action,entityId,detail,after:version});
  data.activities=data.activities.slice(0,2000);
  const outcome=action.startsWith("Approved")?"Approved":action.startsWith("Rejected")?"Rejected":"Saved";
  recordAudit(data,{actor:"human",actorId,action,entity:metadata?.entity??"settings",entityId,detail,clientId:metadata?.clientId,agent:metadata?.agent,sources:metadata?.source?[metadata.source]:["Approval policy"],before:version?"Awaiting review":undefined,after:version?outcome:undefined,approvedBy:outcome==="Approved"?actorId:undefined,approvedAt:outcome==="Approved"?new Date().toISOString():undefined,outcome});
}
function rejectedConcept(data:CRMLibrary,id:string,version:string){
  return data.activities.some(e=>e.entityId===id&&e.action==="Rejected creative concept"&&e.after===version);
}

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req), data=await ownedLibrary(user.userId);
    if(!data)return reply({policy:approvalPolicy(),reports:[],concepts:[],outreach:[]});
    if(!knowledgeAccess(data,user.userId,"automations"))return reply({error:"Approval queue access is required."},403);
    const reports=knowledgeAccess(data,user.userId,"reports")?(data.clientReporting?.reports??[]).filter(r=>r.status==="Draft"&&effectiveApprovalMode(data.aiApprovalPolicy,"Reports")==="Approval Required").map(r=>({
      id:r.id,version:reportVersion(r),title:r.frequency+" report · "+r.facts.company,at:r.createdAt,email:reportEmail(r),summary:r.copy.summary,
    })):[];
    const concepts=knowledgeAccess(data,user.userId,"creative")&&effectiveApprovalMode(data.aiApprovalPolicy,"Creative generation")==="Approval Required"?(data.concepts??[]).filter(c=>c.generationSource&&!c.reviewedAt).map(c=>({
      id:c.id,version:conceptVersion(c),title:c.title,at:c.createdAt,detail:[c.kind,c.platform,c.angle,c.hook,c.headline,c.script,c.storyboard?.join("\n"),c.cta].filter(Boolean).join("\n\n"),
    })).filter(c=>!rejectedConcept(data,c.id,c.version)):[];
    const outreach=knowledgeAccess(data,user.userId,"outreach")?data.outreach.flatMap(campaign=>campaign.recipients.filter(recipient=>
      recipient.state==="drafted"&&recipient.draft?.trim()&&effectiveApprovalMode(data.aiApprovalPolicy,recipient.stepIndex?"Follow-ups":"Outreach")==="Approval Required",
    ).map(recipient=>{
      const lead=data.leads.find(item=>item.id===recipient.leadId);
      const channel=recipient.stepIndex?data.sequences.find(item=>item.id===campaign.sequenceId)?.steps[recipient.stepIndex]?.channel:campaign.channel;
      const to=lead&&channel?destination(lead,channel):undefined;
      if(!lead||!channel||!to||suppressed(lead,data.suppressions??[]))return null;
      return {id:lead.id,campaignId:campaign.id,title:campaign.name+" · "+lead.company,at:campaign.createdAt,followUp:recipient.stepIndex>0,
        version:hash([recipient.stepIndex,recipient.draft,channel,to]),detail:["To "+to,channel,recipient.draft].join("\n\n")};
    }).filter(item=>item!==null)).slice(0,100):[];
    return reply({policy:approvalPolicy(data.aiApprovalPolicy),reports,concepts,outreach});
  }catch(error){return dbError(error);}
}

export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req);
    const p=schema.safeParse(await boundedJSON(req,15000).catch(()=>null));
    if(!p.success)return reply({error:"Check the approval policy or review selection."},400);
    const input=p.data;
    const current=await ownedLibrary(user.userId);
    if(!current&&input.action!=="policy")return reply({error:"Review item not found."},404);
    const operationId=crypto.randomUUID();
    const change=(data:CRMLibrary)=>{
      if(input.action==="policy"){
        const member=data.team.find(item=>item.id===user.userId);
        if(member?.role!=="admin"||(member.status??"active")!=="active")throw new ReviewError("Only an active administrator can change approval modes.",403);
        const old=approvalPolicy(data.aiApprovalPolicy);
        if(input.expected&&(old.allowAutonomousSpendChanges!==input.expected.allowAutonomousSpendChanges||AI_ACTIONS.some(action=>old.modes[action]!==input.expected?.modes[action])))throw new ReviewError("Approval policy changed on another laptop. Reload and try again.");
        const next={modes:input.modes,allowAutonomousSpendChanges:input.allowAutonomousSpendChanges};
        const changes=AI_ACTIONS.filter(action=>old.modes[action]!==next.modes[action]).map(action=>action+" · "+old.modes[action]+" → "+next.modes[action]);
        if(old.allowAutonomousSpendChanges!==next.allowAutonomousSpendChanges)changes.push("Autonomous spend changes · "+(next.allowAutonomousSpendChanges?"enabled":"disabled"));
        if(changes.length)audit(data,user.userId,"Changed AI approval policy","policy",changes.join("\n"));
        data.aiApprovalPolicy=next;
        return data;
      }
      if(!knowledgeAccess(data,user.userId,"automations")||!knowledgeAccess(data,user.userId,input.kind==="report"?"reports":input.kind==="outreach"?"outreach":"creative",true))
        throw new ReviewError("Write access to this action is required.",403);
      if(input.kind==="report"){
        const report=getClientReport(data,input.id);
        if(report.status!=="Draft"||reportVersion(report)!==input.version||effectiveApprovalMode(data.aiApprovalPolicy,"Reports")!=="Approval Required")throw new ReviewError("This report or its policy changed. Refresh the queue.");
        if(input.action==="approve")approveReport(data,input.id,user.userId);
        else report.status="Rejected";
        audit(data,user.userId,input.action==="approve"?"Approved client report":"Rejected client report",input.id,report.frequency+" client report",input.version,{clientId:report.clientId,agent:"reporting",entity:"report",source:report.facts.source});
      }else{
        const concept=data.concepts.find(c=>c.id===input.id&&c.generationSource);
        if(!concept||concept.reviewedAt||conceptVersion(concept)!==input.version||rejectedConcept(data,input.id,input.version)||
           effectiveApprovalMode(data.aiApprovalPolicy,"Creative generation")!=="Approval Required")throw new ReviewError("This concept or its policy changed. Refresh the queue.");
        if(input.action==="approve"){concept.reviewedAt=new Date().toISOString();concept.reviewedBy=user.userId;}
        audit(data,user.userId,input.action==="approve"?"Approved creative concept":"Rejected creative concept",input.id,concept.title,input.version,{clientId:concept.clientId,agent:"creative",entity:"creative",source:"Current saved creative concept"});
      }
      return data;
    };
    if(!current){
      const {supabaseRequest}=await import("@/lib/db");
      const data=change(emptyCRMLibrary({id:user.userId,email:user.email}));
      const revision=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:user.userId,p_revision:0,p_operation:operationId,p_data:data}});
      if(revision<0)return reply({error:"The account changed. Refresh and retry."},409);
    }else await mutateMedia(user.userId,operationId,change);
    return reply({ok:true});
  }catch(error){
    if(error instanceof ReviewError||error instanceof ReportError)return reply({error:error.message},error.status);
    return dbError(error);
  }
}
