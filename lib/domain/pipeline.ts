import type {Activity,ApprovalRequest,Client,ClientKnowledge,Deal,DealStage,Lead,OnboardingTemplate,Project,Proposal,Task,TeamMember} from "../types.ts";
import {initializeClientOnboarding} from "./onboarding.ts";

export const PIPELINE_STAGES=["New","Qualified","Meeting","Proposal","Negotiation","Won","Lost"] as const;
export const pipelineStage=(stage:DealStage):typeof PIPELINE_STAGES[number]=>["Researching","Contacted","Replied"].includes(stage)?"New":stage as typeof PIPELINE_STAGES[number];
export const pipelineLabel=(stage:DealStage)=>pipelineStage(stage)==="New"?"Lead":pipelineStage(stage);
export const DEFAULT_ONBOARDING_TEMPLATES:OnboardingTemplate[]=[
 {service:"Default",steps:["Review won deal and commercial terms","Confirm tracking requirements","Prepare strategy and launch plan","Review launch readiness"]},
 {service:"Meta Ads",steps:["Request Meta Business Manager partner access","Review pixel and conversion tracking","Collect product catalogue","Prepare creative brief"]},
 {service:"Google Ads",steps:["Request Google Ads account access","Review GA4 and conversion setup","Prepare search-intent and campaign plan"]},
 {service:"SEO",steps:["Request Search Console access","Plan technical and content audit","Prepare keyword and content plan"]},
 {service:"Influencer Marketing",steps:["Confirm creator brief","Prepare creator shortlist","Review content approval process"]},
];
export interface OnboardingLibrary {deals:Deal[];leads:Lead[];team:TeamMember[];clients:Client[];tasks:Task[];projects:Project[];knowledge:ClientKnowledge[];activities:Activity[];approvals:ApprovalRequest[];proposals:Proposal[];}

// Pure snapshot transition: the same won deal is linked once, with no external sends.
export function ensureWonOnboarding<T extends OnboardingLibrary>(input:T,templates:OnboardingTemplate[]=DEFAULT_ONBOARDING_TEMPLATES,at=new Date().toISOString(),actor?:string):{data:T;changed:boolean}{
 let data=input,changed=false;
 for(const deal of input.deals){
  if(deal.stage!=="Won")continue;
  const linked=data.clients.find(c=>c.id===deal.clientId)||data.clients.find(c=>c.fromDealId===deal.id);
  if(linked){if(deal.clientId!==linked.id){data={...data,deals:data.deals.map(d=>d.id===deal.id?{...d,clientId:linked.id}:d)};changed=true;}const initialized=initializeClientOnboarding(data,linked.id,at);if(initialized.changed){data=initialized.data;changed=true;}continue;}
  const id=crypto.randomUUID(),projectId=crypto.randomUUID(),lead=data.leads.find(l=>l.id===deal.leadId);
  const owner=data.team.find(t=>t.id===deal.ownerId&&t.status!=="disabled")?.id??data.team.find(t=>t.role==="account_manager"&&t.status!=="disabled")?.id??data.team[0]?.id??actor??deal.ownerId;
  const base=templates.find(t=>t.service==="Default")?.steps??DEFAULT_ONBOARDING_TEMPLATES[0].steps;
  const legacyManaged=new Set(["Prepare welcome message for review","Send onboarding form through an approved channel","Collect business goals and target audience","Collect brand assets and guidelines","Collect required account access","Assign delivery team"]);
  const steps=[...new Set([...base.filter(label=>!legacyManaged.has(label)),...deal.services.flatMap(service=>templates.find(t=>t.service===service)?.steps??[`Confirm ${service} scope, access and delivery plan`])])];
  const monthly=data.proposals.find(p=>p.id===deal.proposalId&&p.status==="Accepted")?.lines.filter(l=>l.billing==="monthly").reduce((n,l)=>n+l.price,0)??0;
  const client:Client={id,company:deal.company,industry:lead?.industry??"",website:lead?.website,location:lead?.location??"",contacts:lead?[{name:lead.name,email:lead.email,phone:lead.phone,role:lead.jobTitle}]:[],services:[...deal.services],retainer:monthly,contractStart:"",contractEnd:"",accountManagerId:owner,health:"Healthy",fromDealId:deal.id,onboarding:steps.map((label,i)=>({key:`ob_${i}`,label,done:false})),createdAt:at,documents:[]};
  const taskTitles=["Review commercial terms and billing","Prepare welcome message and onboarding form","Schedule kick-off and confirm goals",...deal.services.map(service=>`Confirm ${service} scope and access`)];
  const tasks:Task[]=taskTitles.map((title,i)=>({id:crypto.randomUUID(),title:`${title} — ${deal.company}`,description:`Created automatically from won deal ${deal.title}. No external message has been sent.`,assigneeId:owner,priority:i<3?"High":"Medium",dueDate:new Date(Date.parse(at)+(i<3?2:7)*86400000).toISOString(),status:"Todo",related:{type:"client",id},createdAt:at,createdBy:"automation",projectId}));
  const approval:ApprovalRequest={id:crypto.randomUUID(),kind:"Client communication",title:`Review welcome message — ${deal.company}`,detail:"Prepare and review the welcome message and onboarding form. Approval alone does not send anything or complete checklist steps.",createdAt:at,status:"pending",ref:{type:"client",id},agent:"client_success",requestedBy:actor};
  const activity:Activity={id:crypto.randomUUID(),at,actor:"system",entity:"deal",entityId:deal.id,action:"Client onboarding started",detail:`${deal.company} · ${steps.length} pending checklist steps, ${tasks.length} tasks and a delivery project. Welcome communication awaits human review.`};
  data={...data,deals:data.deals.map(d=>d.id===deal.id?{...d,clientId:id,probability:100}:d),leads:data.leads.map(l=>l.id===deal.leadId?{...l,status:"Won"}:l),clients:[client,...data.clients],tasks:[...tasks,...data.tasks],projects:[{id:projectId,name:`${deal.company} — Onboarding & launch`,clientId:id,ownerId:owner,status:"Active",startDate:at,dueDate:new Date(Date.parse(at)+21*86400000).toISOString(),createdAt:at},...data.projects],knowledge:[{id,clientId:id,brandVoice:"",toneWords:[],products:[],audience:"",competitors:[],approvedMessaging:[],rejectedConcepts:[],preferences:[],guidelines:"",history:[],updatedAt:at},...data.knowledge],approvals:[approval,...data.approvals],activities:[activity,...data.activities].slice(0,2000)};
  data=initializeClientOnboarding(data,id,at).data;
  changed=true;
 }
 return {data,changed};
}
