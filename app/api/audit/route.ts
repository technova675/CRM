import {z} from "zod";
import {reportIdentity} from "@/lib/auth/server";
import {ownedLibrary} from "@/lib/outreachServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {dbError} from "@/lib/db";
import {clientReferences} from "@/lib/auditServer";
import type {Activity} from "@/lib/types";
import type {Module} from "@/lib/permissions";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value)));
const query=z.object({
  from:date.optional(),to:date.optional(),agent:z.string().max(40).optional(),client:z.string().max(150).optional(),
  actor:z.enum(["human","ai","api","system"]).optional(),entity:z.string().max(40).optional(),changes:z.literal("1").optional(),export:z.literal("1").optional(),q:z.string().max(150).optional(),offset:z.coerce.number().int().min(0).max(2700).default(0),
});
const moduleFor:Record<Activity["entity"],Module>={
  lead:"leads",deal:"pipeline",client:"clients",campaign:"campaigns",task:"tasks",invoice:"payments",expense:"payments",proposal:"proposals",
  meeting:"meetings",automation:"automations",settings:"settings",outreach:"outreach",strategy:"strategy",creative:"creative",video:"video",
  social:"social",seo:"seo",document:"documents",influencer:"influencers",recommendation:"performance",integration:"integrations",
  knowledge:"clients",organization:"settings",report:"reports",analytics:"analytics",
};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const limit=50;

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req);
    const data=await ownedLibrary(user.userId);
    if(!data)return reply({rows:[],clients:[],entities:[],total:0});
    if(!knowledgeAccess(data,user.userId,"settings"))return reply({error:"Audit log access is required."},403);
    const parsed=query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if(!parsed.success||parsed.data.from&&parsed.data.to&&parsed.data.from>parsed.data.to)return reply({error:"Check the filters and date range."},400);
    const {from,to,agent,client,actor,entity,changes,q,offset}=parsed.data;
    const start=from?Date.parse(from+"T00:00:00+05:30"):-Infinity;
    const end=to?Date.parse(to+"T00:00:00+05:30")+86400000:Infinity;
    const term=q?.trim().toLowerCase();
    const refs=clientReferences(data);
    const clients=knowledgeAccess(data,user.userId,"clients")?data.clients.map(c=>({id:c.id,company:c.company})):[];
    const companies=new Map(clients.map(c=>[c.id,c.company]));
    const people=new Map(data.team.map(t=>[t.id,t.name]));
    const server=data.auditEvents??[];
    const duplicate=new Map<string,number[]>();
    for(const entry of server){const key=JSON.stringify([entry.entityId,entry.action]);duplicate.set(key,[...(duplicate.get(key)??[]),Date.parse(entry.at)]);}
    const approvalById=new Map((data.approvals??[]).map(a=>[a.id,a]));
    const recentLegacy=(data.activities??[]).filter(a=>!duplicate.get(JSON.stringify([a.entityId,a.action]))?.some(at=>Math.abs(at-Date.parse(a.at))<5000));
    const rows=[...server.map(entry=>({entry,verified:true})),...recentLegacy.map(entry=>({entry,verified:false}))].flatMap(({entry,verified})=>{
      const area=moduleFor[entry.entity];
      if(!area||!knowledgeAccess(data,user.userId,area)||entity&&entry.entity!==entity||changes&&entry.before===undefined&&entry.after===undefined)return [];
      const at=Date.parse(entry.at);
      if(!Number.isFinite(at)||at<start||at>=end||actor&&entry.actor!==actor)return [];
      const linked=entry.entityId?approvalById.get(entry.entityId):undefined;
      const agentId=entry.agent??linked?.agent;
      if(agent&&agentId!==agent)return [];
      const clientId=entry.clientId??refs.get(entry.entityId??"");
      if(client&&clientId!==client)return [];
      const approver=entry.approvedBy??(linked?.status==="approved"?linked.resolvedBy:undefined);
      const person=people.get(entry.actorId??"");
      const company=companies.get(clientId??"");
      if(term&&![entry.action,entry.detail,entry.before,entry.after,entry.outcome,entry.entity,agentId,company,person,...(Array.isArray(entry.sources)?entry.sources:[])].some(value=>typeof value==="string"&&value.toLowerCase().includes(term)))return [];
      return [{...entry,origin:verified?"server":undefined,clientId,agent:agentId,company,person,approver:approver?people.get(approver)??"Staff":undefined,approvedAt:entry.approvedAt??(approver?linked?.resolvedAt:undefined)}];
    }).sort((a,b)=>b.at.localeCompare(a.at));
    const entities=Object.keys(moduleFor).filter(key=>knowledgeAccess(data,user.userId,moduleFor[key as Activity["entity"]])).sort();
    return reply({rows:parsed.data.export?rows:rows.slice(offset,offset+limit),clients,entities,total:rows.length});
  }catch(error){return dbError(error);}
}
