import { z } from "zod";
import { dbError, supabaseRequest, SupabaseDbError } from "@/lib/db";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { emptyCRMLibrary } from "@/lib/domain/crmLibrary";
import { LEAD_STATUSES, LEAD_SOURCES, SERVICES, CHANNELS } from "@/lib/types";
import { DEFAULT_SEQUENCE } from "@/lib/ai/outreach";

const id = z.string().min(1).max(150);
const text = z.string().max(100_000);
const record = z.object({ id }).catchall(z.unknown());
const sequence = z.object({id,name:z.string().min(1).max(500),steps:z.array(z.object({id,dayOffset:z.number().int().min(0).max(365),channel:z.enum(CHANNELS),template:z.string().max(20000),condition:z.enum(["always","no_reply","opened_no_reply"])})).min(1).max(20),stopRules:z.object({onReply:z.boolean(),onMeetingBooked:z.boolean(),onOptOut:z.literal(true),onNotInterested:z.boolean(),onManualPause:z.boolean()}),sendWindow:z.object({startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(1).max(24),weekdaysOnly:z.boolean()}).refine(v=>v.endHour>v.startHour),dailyLimit:z.number().int().min(1).max(1000)});
const lead = record.extend({ name: z.string().trim().min(1).max(500), company: z.string().trim().min(1).max(500),
  email: z.string().max(500), phone: z.string().max(100), status: z.enum(LEAD_STATUSES), source: z.enum(LEAD_SOURCES),
  jobTitle:text,location:text,industry:text,companySize:z.enum(["Unknown","1-10","11-50","51-200","201-1000","1000+"]),createdAt:z.string().datetime(),
  website:text.optional(),linkedin:text.optional(),instagram:text.optional(),communicationHistory:text.optional(),
  ownerId: id, services: z.array(z.enum(SERVICES)).max(100), tags: z.array(z.string().max(200)).max(100), notes: text,
  dealValue: z.number().finite().nonnegative().optional(), customFields: z.record(z.string().max(150), text).optional(),
});
const schema = z.object({ revision: z.number().int().nonnegative(), operationId: z.string().uuid(), data: z.object({
  leads: z.array(lead).max(10000), deals: z.array(record).max(10000), conversations: z.array(record).max(10000),
  messages: z.array(record).max(20000), activities: z.array(record).max(2000), team: z.array(record.extend({name:z.string().min(1).max(500),email:z.string().max(500),role:z.enum(["admin","sales","account_manager","marketing","creative_strategist","video_editor","designer","seo","social_media","influencer_manager","finance","ai_automation","client"]),avatarColor:z.string().max(100)})).min(1).max(500),
  savedViews: z.array(record).max(500), customFields: z.array(z.object({key:id,label:z.string().min(1).max(200),type:z.enum(["text","number","select"]),options:z.array(z.string().max(500)).max(100).optional()})).max(100),
  outreach:z.array(record.extend({name:z.string().min(1).max(500),channel:z.enum(CHANNELS),sequenceId:id,status:z.enum(["Draft","Review","Running","Paused","Completed"]),recipients:z.array(z.object({leadId:id,state:z.enum(["queued","researching","drafted","approved","sent","replied","stopped","bounced"]),stepIndex:z.number().int().min(0).max(20)}).catchall(z.unknown())).max(10000)})).max(500).default([]),
  sequences:z.array(sequence).min(1).max(100).default([{...DEFAULT_SEQUENCE,stopRules:{...DEFAULT_SEQUENCE.stopRules,onOptOut:true}}]),
  suppressions:z.array(z.object({value:z.string().trim().min(1).max(500),reason:z.string().max(1000),addedAt:z.string().datetime()})).max(10000).default([]),
  outreachTemplates:z.array(z.object({id,label:z.string().min(1).max(500),template:z.string().min(1).max(20000)})).max(200).default([]),
}) });

export async function GET(req: Request) {
  try {
    const user=await reportIdentity(req);
    const [row]=await supabaseRequest<{revision:number;data:unknown}[]>("crm_libraries",{query:{select:"revision,data",owner_id:`eq.${user.userId}`,limit:"1"}});
    const result=row??{revision:0,data:emptyCRMLibrary({id:user.userId,email:user.email})};
    // A browser can close while its synchronous research request is running.
    // Surface an explicit retry state rather than leaving a lead running forever.
    const library=result.data as ReturnType<typeof emptyCRMLibrary>;
    library.outreach??=[];library.sequences??=[DEFAULT_SEQUENCE];library.suppressions??=[];library.outreachTemplates??=[];
    library.outreach=library.outreach.map(c=>({...c,recipients:c.recipients.map(r=>r.state==="researching"&&(!r.draftStartedAt||Date.now()-Date.parse(r.draftStartedAt)>240000)?{...r,state:"queued",error:"Draft preparation was interrupted. Draft this lead again."}:r)}));
    library.leads=library.leads.map(lead=>lead.research?.status==="running"&&(!lead.research.startedAt||Date.now()-Date.parse(lead.research.startedAt)>180000)?{...lead,research:{...lead.research,status:"failed",error:"The previous research session was interrupted. Run public research again."}}:lead);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  } catch(error){return dbError(error);}
}
export async function PUT(req: Request) {
  if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
  try {
    const user=await reportIdentity(req);
    const reader=req.body?.getReader(); if(!reader)return Response.json({error:"Missing CRM data"},{status:400});
    let length=0;let body="";const decoder=new TextDecoder();
    while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>8_000_000){await reader.cancel();return Response.json({error:"CRM library exceeds the 8 MB save limit. Export a backup and reduce the import size."},{status:413});}body+=decoder.decode(chunk.value,{stream:true});}
    body+=decoder.decode();
    let value:unknown;try{value=JSON.parse(body);}catch{return Response.json({error:"Invalid CRM data"},{status:400});}
    const parsed=schema.safeParse(value);if(!parsed.success)return Response.json({error:"CRM data contains invalid or oversized fields. Changes have not been discarded.",issues:parsed.error.issues.slice(0,3).map(issue=>`${issue.path.join(".")}: ${issue.message}`)},{status:400});
    const data=parsed.data;
    for(const key of ["leads","deals","conversations","messages","activities","team","savedViews"] as const)if(new Set(data.data[key].map(item=>item.id)).size!==data.data[key].length)return Response.json({error:`Duplicate record IDs in ${key}`},{status:400});
    let revision:number|undefined;
    // This RPC has an operation ID, so an interrupted request can be retried
    // without replaying a write or overwriting a concurrent edit.
    for(let attempt=0;attempt<3;attempt++){
      try{revision=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:user.userId,p_revision:data.revision,p_operation:data.operationId,p_data:data.data}});break;}
      catch(error){if(!(error instanceof SupabaseDbError)||error.code!=="connection_failed"||attempt===2)throw error;}
    }
    if(revision!==undefined && revision<0)return Response.json({error:"This CRM was updated on another laptop. Export your unsaved changes before reloading the latest version.",code:"crm_conflict"},{status:409});
    return Response.json({revision},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof SupabaseDbError&&error.code==="40001")return Response.json({error:"This CRM was updated on another laptop. Export your unsaved changes before reloading the latest version.",code:"crm_conflict"},{status:409});return dbError(error);}
}
