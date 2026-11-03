import { z } from "zod";
import { dbError, supabaseRequest, SupabaseDbError } from "@/lib/db";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { emptyCRMLibrary } from "@/lib/domain/crmLibrary";
import { LEAD_STATUSES, LEAD_SOURCES, SERVICES, CHANNELS, DEAL_STAGES } from "@/lib/types";
import { DEFAULT_SEQUENCE } from "@/lib/ai/outreach";
import {DEFAULT_ONBOARDING_TEMPLATES,ensureWonOnboarding} from "@/lib/domain/pipeline";
import type {CRMLibrary} from "@/lib/domain/crmLibrary";
import {safeClientLink} from "@/lib/domain/clientProfile";
import {onboardingWorkspaceSchema} from "@/lib/domain/onboardingSchema";
import {applyOnboarding,activeStaff} from "@/lib/domain/onboarding";
import {strategyDocSchema,strategyReviewIssues,strategyContent} from "@/lib/domain/strategy";
import {campaignSchema,campaignReferenceIssues,campaignReadyIssues} from "@/lib/domain/campaign";
import {creativeConceptSchema,creativeReportSchema} from "@/lib/domain/creativeStrategy";
import {validMediaRecommendation} from "@/lib/mediaServer";

const id = z.string().min(1).max(150);
const text = z.string().max(100_000);
const record = z.object({ id }).catchall(z.unknown());
const dateText=z.string().max(100).refine(v=>!v||Number.isFinite(Date.parse(v)));
const client=record.extend({creativeIntelligence:z.array(creativeReportSchema).max(20).optional(),onboardingWorkspace:onboardingWorkspaceSchema.optional(),company:z.string().trim().min(1).max(500),industry:z.string().max(500),location:z.string().max(500),website:z.string().max(2000).refine(v=>!v||!!safeClientLink(v)).optional(),contacts:z.array(z.object({name:z.string().trim().min(1).max(500),email:z.string().max(500).refine(v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),phone:z.string().max(500).optional(),role:z.string().max(500)})).max(100),services:z.array(z.enum(SERVICES)).max(100),retainer:z.number().finite().nonnegative(),contractStart:dateText,contractEnd:dateText,accountManagerId:id,health:z.enum(["Healthy","At Risk","Churn Risk"]),onboarding:z.array(z.object({key:id,label:z.string().max(1000),done:z.boolean(),doneAt:dateText.optional()})).max(200),documents:z.array(z.object({name:z.string().min(1).max(500),kind:z.string().max(100),addedAt:dateText,url:z.string().max(2000).refine(v=>!!safeClientLink(v)).optional()})).max(1000),contracts:z.array(z.object({id,title:z.string().trim().min(1).max(500),status:z.enum(["Draft","Active","Expired","Ended"]),startsAt:dateText.optional(),endsAt:dateText.optional(),value:z.number().finite().nonnegative().optional(),documentUrl:z.string().max(2000).refine(v=>!!safeClientLink(v)).optional(),notes:z.string().max(5000).optional()})).max(500).optional(),reportCompanyId:id.optional(),createdAt:z.string().datetime()});
const proposal=record.extend({dealId:id,title:z.string().min(1).max(500),company:z.string().min(1).max(500),lines:z.array(z.object({service:z.enum(SERVICES),description:z.string().min(1).max(2000),price:z.number().finite().min(0).max(1e9),billing:z.enum(["monthly","one-time"])})).min(1).max(100),status:z.enum(["Draft","Internal Review","Sent","Viewed","Accepted","Rejected"]),approval:z.enum(["Not Required","Awaiting","Approved"]),expiresAt:z.string().datetime(),createdAt:z.string().datetime(),durationMonths:z.number().int().min(1).max(36).optional(),deliverables:z.array(z.string().max(2000)).max(100).optional(),timeline:z.array(z.object({phase:z.string().max(500),weeks:z.string().max(500),detail:z.string().max(5000)})).max(30).optional(),terms:z.array(z.string().max(2000)).max(100).optional(),discoveryNotes:z.string().max(20000).optional(),strategySummary:z.string().max(10000).optional()});
const deal=record.extend({title:z.string().min(1).max(500),company:z.string().min(1).max(500),value:z.number().finite().nonnegative(),probability:z.number().finite().min(0).max(100),expectedClose:z.string().refine(v=>Number.isFinite(Date.parse(v))),ownerId:id,stage:z.enum(DEAL_STAGES),services:z.array(z.enum(SERVICES)).max(100),notes:text,paymentStatus:z.enum(["Pending","Partially Paid","Paid","Overdue"]),createdAt:z.string().datetime(),leadId:id.optional(),clientId:id.optional(),proposalId:id.optional()});
const sequence = z.object({id,name:z.string().min(1).max(500),steps:z.array(z.object({id,dayOffset:z.number().int().min(0).max(365),channel:z.enum(CHANNELS),template:z.string().max(20000),condition:z.enum(["always","no_reply","opened_no_reply"])})).min(1).max(20),stopRules:z.object({onReply:z.boolean(),onMeetingBooked:z.boolean(),onOptOut:z.literal(true),onNotInterested:z.boolean(),onManualPause:z.boolean()}),sendWindow:z.object({startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(1).max(24),weekdaysOnly:z.boolean()}).refine(v=>v.endHour>v.startHour),dailyLimit:z.number().int().min(1).max(1000)});
const lead = record.extend({ name: z.string().trim().min(1).max(500), company: z.string().trim().min(1).max(500),
  email: z.string().max(500), phone: z.string().max(100), status: z.enum(LEAD_STATUSES), source: z.enum(LEAD_SOURCES),
  jobTitle:text,location:text,industry:text,companySize:z.enum(["Unknown","1-10","11-50","51-200","201-1000","1000+"]),createdAt:z.string().datetime(),
  website:text.optional(),linkedin:text.optional(),instagram:text.optional(),communicationHistory:text.optional(),
  ownerId: id, services: z.array(z.enum(SERVICES)).max(100), tags: z.array(z.string().max(200)).max(100), notes: text,
  dealValue: z.number().finite().nonnegative().optional(), customFields: z.record(z.string().max(150), text).optional(),
});
const schema = z.object({ revision: z.number().int().nonnegative(), operationId: z.string().uuid(), data: z.object({
  marketingAutomations:z.array(record).max(100).default([]),leads: z.array(lead).max(10000), deals: z.array(deal).max(10000), conversations: z.array(record).max(10000),
  messages: z.array(record).max(20000), activities: z.array(record).max(2000), team: z.array(record.extend({name:z.string().min(1).max(500),email:z.string().max(500),role:z.enum(["admin","sales","account_manager","marketing","creative_strategist","video_editor","designer","seo","social_media","influencer_manager","finance","ai_automation","client"]),avatarColor:z.string().max(100)})).min(1).max(500),
  savedViews: z.array(record).max(500), customFields: z.array(z.object({key:id,label:z.string().min(1).max(200),type:z.enum(["text","number","select"]),options:z.array(z.string().max(500)).max(100).optional()})).max(100),
  outreach:z.array(record.extend({name:z.string().min(1).max(500),channel:z.enum(CHANNELS),sequenceId:id,status:z.enum(["Draft","Review","Running","Paused","Completed"]),recipients:z.array(z.object({leadId:id,state:z.enum(["queued","researching","drafted","approved","sent","replied","stopped","bounced"]),stepIndex:z.number().int().min(0).max(20)}).catchall(z.unknown())).max(10000)})).max(500).default([]),
  sequences:z.array(sequence).min(1).max(100).default([{...DEFAULT_SEQUENCE,stopRules:{...DEFAULT_SEQUENCE.stopRules,onOptOut:true}}]),
  suppressions:z.array(z.object({value:z.string().trim().min(1).max(500),reason:z.string().max(1000),addedAt:z.string().datetime()})).max(10000).default([]),
  outreachTemplates:z.array(z.object({id,label:z.string().min(1).max(500),template:z.string().min(1).max(20000)})).max(200).default([]),
  clients:z.array(client).max(10000).default([]),tasks:z.array(record).max(20000).default([]),projects:z.array(record).max(10000).default([]),knowledge:z.array(record).max(10000).default([]),approvals:z.array(record).max(10000).default([]),proposals:z.array(proposal).max(10000).default([]),meetings:z.array(record).max(10000).default([]),strategies:z.array(record).max(1000).default([]),
  proposalPriceBook:z.array(z.object({service:z.enum(SERVICES),setup:z.number().finite().min(0).max(1e9),monthly:z.number().finite().min(0).max(1e9),note:z.string().max(500).optional()})).max(13).default([]),
  concepts:z.array(creativeConceptSchema).max(1000).default([]),campaigns:z.array(record).max(10000).default([]),invoices:z.array(record).max(10000).default([]),ads:z.array(record).max(20000).default([]),creatives:z.array(record).max(10000).default([]),socialPosts:z.array(record).max(20000).default([]),seoProjects:z.array(record).max(1000).default([]),influencers:z.array(record).max(10000).default([]),engagements:z.array(record).max(10000).default([]),assets:z.array(record).max(10000).default([]),reports:z.array(record).max(10000).default([]),recommendations:z.array(record).max(10000).default([]),reportSchedules:z.array(record).max(1000).default([]),
  onboardingTemplates:z.array(z.object({service:z.union([z.literal("Default"),z.enum(SERVICES)]),steps:z.array(z.string().min(1).max(500)).min(1).max(100)})).min(1).max(100).default(DEFAULT_ONBOARDING_TEMPLATES),
}) });

export async function GET(req: Request) {
  try {
    const user=await reportIdentity(req);
    const [row]=await supabaseRequest<{revision:number;data:unknown}[]>("crm_libraries",{query:{select:"revision,data",owner_id:`eq.${user.userId}`,limit:"1"}});
    const result=row??{revision:0,data:emptyCRMLibrary({id:user.userId,email:user.email})};
    // A browser can close while its synchronous research request is running.
    // Surface an explicit retry state rather than leaving a lead running forever.
    const library=result.data as ReturnType<typeof emptyCRMLibrary>;
    library.marketingAutomations??=[];library.outreach??=[];library.sequences??=[DEFAULT_SEQUENCE];library.suppressions??=[];library.outreachTemplates??=[];
    library.clients??=[];library.tasks??=[];library.projects??=[];library.knowledge??=[];library.approvals??=[];library.proposals??=[];library.meetings??=[];library.onboardingTemplates??=DEFAULT_ONBOARDING_TEMPLATES;
    library.concepts??=[];library.strategies??=[];library.proposalPriceBook??=[];
    for(const key of ["campaigns","invoices","ads","creatives","socialPosts","seoProjects","influencers","engagements","assets","reports","recommendations","reportSchedules"] as const)library[key]??=[];
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
    // Older open browser bundles do not yet serialize onboarding collections.
    // Preserve those server fields rather than silently deleting them on save.
    const incoming=(value as {data?:Record<string,unknown>})?.data;
    if(incoming&&Array.isArray(incoming.marketingAutomations)){
      const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});
      if(JSON.stringify(incoming.marketingAutomations)!==JSON.stringify(previous?.data.marketingAutomations??[]))return Response.json({error:"Workflow definitions and run approvals are managed by Automation Builder. Refresh the library before saving.",code:"crm_conflict"},{status:409});
    }
    if(incoming&&Array.isArray(incoming.seoProjects)){
      const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});const old=previous?.data.seoProjects??[],records=incoming.seoProjects as {id:string;workspace?:unknown}[];
      for(const p of old.filter(p=>p.workspace?.version===2))if(JSON.stringify(records.find(r=>r.id===p.id))!==JSON.stringify(p))return Response.json({error:"SEO data changed on the server. Refresh and use the SEO workspace actions.",code:"crm_conflict"},{status:409});
      if(records.some(r=>r.workspace&&!old.some(p=>p.id===r.id&&p.workspace)))return Response.json({error:"Create measured SEO workspaces through the SEO module."},{status:409});
    }
    // Dedicated influencer actions preserve account ownership and workflow history.
    if(incoming&&["influencers","engagements","campaigns"].some(k=>Array.isArray(incoming[k]))){
      const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});
      for(const key of ["influencers","engagements"] as const){if(!Array.isArray(incoming[key]))continue;const records=incoming[key] as {id:string;crmVersion?:number}[],old=previous?.data[key]??[];for(const item of old.filter(r=>r.crmVersion===2))if(JSON.stringify(records.find(r=>r.id===item.id))!==JSON.stringify(item))return Response.json({error:"Influencer records changed on the server. Refresh and use the Influencer workspace to edit them.",code:"crm_conflict"},{status:409});if(records.some(r=>r.crmVersion===2&&!old.some(o=>o.id===r.id&&o.crmVersion===2)))return Response.json({error:"Create influencer records through the Influencer workspace."},{status:409});}
      if(Array.isArray(incoming.influencers))for(const e of previous?.data.engagements.filter(e=>e.crmVersion===2)??[])if(!(incoming.influencers as {id:string}[]).some(i=>i.id===e.influencerId))return Response.json({error:"Preserve creator profiles that have campaign history. Mark them unavailable instead."},{status:409});
      if(Array.isArray(incoming.campaigns)){const campaigns=incoming.campaigns as {id:string;creatorMatch?:unknown;clientId?:string}[];for(const c of campaigns){const old=previous?.data.campaigns.find(x=>x.id===c.id);if(JSON.stringify(c.creatorMatch)!==JSON.stringify(old?.creatorMatch))return Response.json({error:"Matching reports are saved by the Influencer workspace. Refresh before editing this campaign.",code:"crm_conflict"},{status:409});}for(const e of previous?.data.engagements.filter(e=>e.crmVersion===2)??[])if(!campaigns.some(c=>c.id===e.campaignId&&c.clientId===e.clientId))return Response.json({error:"A campaign with creator history cannot be removed or assigned to another client."},{status:409});}
    }
    // Reviews, approvals and delivery receipts are owned by the social API.
    if(incoming&&Array.isArray(incoming.socialPosts)){
      const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});
      const prior=previous?.data.socialPosts??[];
      for(const old of prior.filter(p=>p.workflowVersion===2)){
        const next=(incoming.socialPosts as {id?:string}[]).find(p=>p.id===old.id);
        if(JSON.stringify(next)!==JSON.stringify(old))return Response.json({error:"Social content changed on the server. Refresh the workspace; use its Save, Review and Approval actions.",code:"crm_conflict"},{status:409});
      }
      for(const raw of incoming.socialPosts as Record<string,unknown>[]){const old=prior.find(p=>p.id===raw.id);if(old?.workflowVersion!==2&&(raw.workflowVersion===2||raw.review||raw.humanApproval||raw.delivery||raw.publication||raw.analytics))return Response.json({error:"Use the social workspace to create reviews, approvals, publication records and analytics."},{status:409});}
    }
    const extensions=["marketingAutomations","clients","tasks","projects","knowledge","approvals","proposals","meetings","onboardingTemplates","concepts","strategies","proposalPriceBook","campaigns","invoices","ads","creatives","socialPosts","seoProjects","influencers","engagements","assets","reports","recommendations","reportSchedules"] as const;
    if(incoming&&typeof incoming==="object"&&!Array.isArray(incoming)&&extensions.some(key=>incoming[key]===undefined)){
      const [existing]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});
      for(const key of extensions)if(incoming[key]===undefined&&existing?.data[key]!==undefined)incoming[key]=existing.data[key];
    }
    const parsed=schema.safeParse(value);if(!parsed.success)return Response.json({error:"CRM data contains invalid or oversized fields. Changes have not been discarded.",issues:parsed.error.issues.slice(0,3).map(issue=>`${issue.path.join(".")}: ${issue.message}`)},{status:400});
    const data=parsed.data;
    {const knownClients=new Set(data.data.clients.map(c=>c.id));for(const concept of data.data.concepts)if(!knownClients.has(concept.clientId)||concept.existingCreativeIds?.some(id=>!data.data.creatives.some(c=>c.id===id&&c.clientId===concept.clientId)))return Response.json({error:"Concept client and existing creative references must belong to this account."},{status:400});const mapped=new Map<string,string>();for(const creative of data.data.creatives){if(creative.performanceLinks===undefined)continue;const parsedLinks=z.array(z.object({campaignId:id,platform:z.string().min(1).max(100),adId:z.string().min(1).max(200)})).max(100).safeParse(creative.performanceLinks);if(!parsedLinks.success)return Response.json({error:"Invalid creative/ad performance mapping."},{status:400});for(const link of parsedLinks.data){const campaign=data.data.campaigns.find(c=>c.id===link.campaignId&&c.clientId===creative.clientId);const exists=(campaign?.performanceRows as import("@/lib/types").MediaMetricRow[]|undefined)?.some(r=>r.adId===link.adId&&r.platform===link.platform);const key=`${link.campaignId}|${link.platform}|${link.adId}`;if(!exists||mapped.has(key)&&mapped.get(key)!==creative.id)return Response.json({error:"Each dated ad must map to one creative belonging to its client."},{status:400});mapped.set(key,creative.id);}}}
    {const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});for(const old of previous?.data.recommendations??[]){if(!old.mediaPlan)continue;const incoming=data.data.recommendations.find(r=>r.id===old.id);if(!incoming){data.data.recommendations.push(old as unknown as typeof data.data.recommendations[number]);continue;}const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)])):v;if(JSON.stringify(normalize(incoming))!==JSON.stringify(normalize(old)))return Response.json({error:"Media recommendations use the protected review/execution workflow. Reload the latest CRM before editing."},{status:409});}for(const raw of data.data.recommendations){const rec=raw as unknown as import("@/lib/types").Recommendation;if(rec.mediaPlan&&!previous?.data.recommendations?.some(r=>r.id===rec.id)&&(!validMediaRecommendation(user.userId,rec)||rec.status!=="New"||rec.mediaApprovedAt||rec.mediaExecution))return Response.json({error:"Invalid media recommendation or approval."},{status:400});}}
    if(data.data.campaigns.length){const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});for(const raw of data.data.campaigns){const old=previous?.data.campaigns?.find(c=>c.id===raw.id);if(JSON.stringify(raw)===JSON.stringify(old))continue;const parsedCampaign=campaignSchema.safeParse(raw);if(!parsedCampaign.success)return Response.json({error:"Campaign contains invalid fields.",issues:parsedCampaign.error.issues.slice(0,3).map(i=>i.path.join(".")+": "+i.message)},{status:400});const campaign=parsedCampaign.data as import("@/lib/types").Campaign;if(old&&old.clientId!==campaign.clientId)return Response.json({error:"Create a separate campaign when changing clients; existing performance must stay with its original client."},{status:400});const issues=campaignReferenceIssues(campaign,data.data as unknown as CRMLibrary);if(campaign.channels!==undefined)issues.push(...campaignReadyIssues(campaign));if(issues.length)return Response.json({error:issues.join(" ")},{status:400});}}
    if(data.data.strategies.length){const [previous]=await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"data",limit:"1"}});for(const raw of data.data.strategies){const parsedDoc=strategyDocSchema.safeParse(raw);if(!parsedDoc.success)return Response.json({error:"Strategy contains invalid fields. Check the brief and budget.",issues:parsedDoc.error.issues.slice(0,2).map(i=>i.path.join(".")+": "+i.message)},{status:400});const doc=parsedDoc.data as import("@/lib/types").StrategyDoc,old=previous?.data.strategies?.find(d=>d.id===doc.id);if(doc.status==="Approved"&&JSON.stringify(doc)!==JSON.stringify(old)){const reviewer=data.data.team.find(t=>t.id===doc.approvedBy);if(!old||old.status!=="In Review"||strategyContent(old)!==strategyContent(doc)||!doc.approvedAt||!reviewer||!["admin","creative_strategist","account_manager"].includes(reviewer.role)||strategyReviewIssues(doc).length)return Response.json({error:"Submit the current complete strategy for review before approval. Edited strategies require a fresh review."},{status:400});}}}
    for(const key of ["leads","deals","conversations","messages","activities","team","savedViews","clients","tasks","projects","knowledge","approvals","proposals","meetings","concepts","strategies","campaigns","invoices","ads","creatives","socialPosts","seoProjects","influencers","engagements","assets","reports","recommendations","reportSchedules"] as const)if(new Set(data.data[key].map(item=>item.id)).size!==data.data[key].length)return Response.json({error:`Duplicate record IDs in ${key}`},{status:400});
    const staff=new Set(data.data.team.filter(member=>activeStaff(member as unknown as import("@/lib/types").TeamMember)).map(member=>member.id));
    for(const client of data.data.clients)if(client.onboardingWorkspace?.assignments.some(assignment=>assignment.memberId&&!staff.has(assignment.memberId)))return Response.json({error:"Assign onboarding responsibilities to active staff in this account."},{status:400});
    const onboarding=ensureWonOnboarding(data.data as unknown as CRMLibrary,data.data.onboardingTemplates,new Date().toISOString(),user.userId);
    for(const client of onboarding.data.clients){if(!client.onboardingWorkspace)continue;const normalized=applyOnboarding(onboarding.data,client.id,client.onboardingWorkspace);if(JSON.stringify(normalized)!==JSON.stringify(onboarding.data)){onboarding.data=normalized;onboarding.changed=true;}}
    if(onboarding.changed&&(!schema.safeParse({...data,data:onboarding.data}).success||Buffer.byteLength(JSON.stringify(onboarding.data))>8_000_000))return Response.json({error:"Onboarding exceeds the CRM library limits. Reduce the batch of won deals and retry."},{status:413});
    // Return the originally persisted snapshot when retrying an uncertain save.
    if(onboarding.changed){const [previous]=await supabaseRequest<{revision:number;data:CRMLibrary;last_operation:string}[]>("crm_libraries",{query:{owner_id:`eq.${user.userId}`,select:"revision,data,last_operation",limit:"1"}});if(previous?.last_operation===data.operationId)return Response.json({revision:previous.revision,data:previous.data});}
    let revision:number|undefined;
    // This RPC has an operation ID, so an interrupted request can be retried
    // without replaying a write or overwriting a concurrent edit.
    for(let attempt=0;attempt<3;attempt++){
      try{revision=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:user.userId,p_revision:data.revision,p_operation:data.operationId,p_data:onboarding.data}});break;}
      catch(error){if(!(error instanceof SupabaseDbError)||error.code!=="connection_failed"||attempt===2)throw error;}
    }
    if(revision!==undefined && revision<0)return Response.json({error:"This CRM was updated on another laptop. Export your unsaved changes before reloading the latest version.",code:"crm_conflict"},{status:409});
    return Response.json({revision,...(onboarding.changed?{data:onboarding.data}:{})},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof SupabaseDbError&&error.code==="40001")return Response.json({error:"This CRM was updated on another laptop. Export your unsaved changes before reloading the latest version.",code:"crm_conflict"},{status:409});return dbError(error);}
}
