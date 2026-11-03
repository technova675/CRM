import type {Client} from "../types.ts";
import type {CRMLibrary} from "./crmLibrary.ts";
export type ClientProfileData=Pick<CRMLibrary,"deals"|"leads"|"campaigns"|"ads"|"invoices"|"creatives"|"socialPosts"|"seoProjects"|"influencers"|"engagements"|"tasks"|"meetings"|"conversations"|"messages"|"reports"|"assets"|"recommendations"|"proposals"|"projects"|"activities">;
export function safeClientLink(value?:string){try{if(!value?.trim())return undefined;const raw=value.trim(),url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:`https://${raw}`);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0;
export function clientProfile(client:Client,data:ClientProfileData,now=new Date()){
 const own=(record:{clientId?:string})=>record.clientId===client.id;
 const deals=data.deals.filter(d=>d.clientId?own(d):d.id===client.fromDealId),dealIds=new Set(deals.map(d=>d.id)),leadIds=new Set(deals.flatMap(d=>d.leadId?[d.leadId]:[]));
 const campaigns=data.campaigns.filter(own),campaignIds=new Set(campaigns.map(c=>c.id));
 const belongs=(record:{clientId?:string;campaignId?:string})=>record.clientId?own(record):!!record.campaignId&&campaignIds.has(record.campaignId);
 const ads=data.ads.filter(belongs),creatives=data.creatives.filter(belongs),social=data.socialPosts.filter(own),seo=data.seoProjects.filter(own),engagements=data.engagements.filter(belongs);
 const influencerIds=new Set(engagements.map(e=>e.influencerId)),influencers=data.influencers.filter(i=>influencerIds.has(i.id));
 const projects=data.projects.filter(own),projectIds=new Set(projects.map(p=>p.id));
 const refs:Record<string,Set<string>>={client:new Set([client.id]),deal:dealIds,lead:leadIds,campaign:campaignIds,creative:new Set(creatives.map(c=>c.id)),seo:new Set(seo.map(s=>s.id)),influencer:new Set(engagements.map(e=>e.id)),social:new Set(social.map(s=>s.id))};
 const tasks=data.tasks.filter(t=>t.related?!!refs[t.related.type]?.has(t.related.id):!!t.projectId&&projectIds.has(t.projectId));
 const meetings=data.meetings.filter(m=>m.clientId?own(m):!!m.dealId&&dealIds.has(m.dealId)||!!m.leadId&&leadIds.has(m.leadId));
 const conversations=data.conversations.filter(c=>c.clientId?own(c):!!c.leadId&&leadIds.has(c.leadId)),conversationIds=new Set(conversations.map(c=>c.id));
 const messages=data.messages.filter(m=>conversationIds.has(m.conversationId)).sort((a,b)=>b.sentAt.localeCompare(a.sentAt));
 const invoices=data.invoices.filter(own),reports=data.reports.filter(own),assets=data.assets.filter(own),recommendations=data.recommendations.filter(belongs),proposals=data.proposals.filter(p=>dealIds.has(p.dealId));
 const today=now.toISOString().slice(0,10),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-29*86400000).toISOString().slice(0,10);
 const metrics=campaigns.flatMap(c=>c.metrics??[]).filter(m=>{const date=m.date?.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&date>=start&&date<=today;});
 const total=(key:"spend"|"revenue"|"clicks"|"impressions"|"leads"|"conversions")=>metrics.length&&metrics.every(m=>finite(m[key]))?metrics.reduce((n,m)=>n+m[key],0):null;
 const spend=total("spend"),revenue=total("revenue"),clicks=total("clicks"),impressions=total("impressions"),leads=total("leads");
 const byDate=new Map<string,{date:string;spend:number;revenue:number}>();for(const m of metrics){if(!finite(m.spend)||!finite(m.revenue))continue;const date=m.date.slice(0,10),previous=byDate.get(date)??{date,spend:0,revenue:0};previous.spend+=m.spend;previous.revenue+=m.revenue;byDate.set(date,previous);}
 const outstanding=invoices.length&&invoices.every(i=>finite(i.amount)&&finite(i.paid))?invoices.reduce((n,i)=>n+Math.max(0,i.amount-i.paid),0):null;
 const overdueTasks=tasks.filter(t=>t.status!=="Done"&&Number.isFinite(Date.parse(t.dueDate))&&Date.parse(t.dueDate)<now.getTime());
 const renewAt=Date.parse(client.contractEnd),renewalDays=Number.isFinite(renewAt)?Math.ceil((renewAt-now.getTime())/86400000):null;
 const observations:{kind:"record"|"recommendation";text:string}[]=[];
 if(overdueTasks.length)observations.push({kind:"record",text:`${overdueTasks.length} saved open task(s) are past their due date.`});
 const overdueInvoices=invoices.filter(i=>i.status==="Overdue"&&finite(i.amount)&&finite(i.paid)&&i.amount>i.paid);
 if(overdueInvoices.length)observations.push({kind:"record",text:`${overdueInvoices.length} saved invoice(s) are marked overdue with an unpaid balance.`});
 if(renewalDays!==null&&renewalDays<=30)observations.push({kind:"recommendation",text:renewalDays>=0?`Review the recorded contract ending in ${renewalDays} days.`:"Review the recorded contract end date; it has passed."});
 const onboarding=client.onboarding.filter(s=>!s.done).length;if(onboarding)observations.push({kind:"recommendation",text:`Complete ${onboarding} pending onboarding checklist step(s).`});
 if(!metrics.length)observations.push({kind:"recommendation",text:"Add dated campaign metrics before drawing performance conclusions."});
 return {deals,leadIds,campaigns,ads,creatives,social,seo,engagements,influencers,projects,tasks,meetings,conversations,messages,invoices,reports,assets,recommendations,proposals,observations,outstanding,overdueTasks,renewalDays,performance:{records:metrics.length,start,end:today,spend,revenue,clicks,impressions,leads,roas:spend!==null&&spend>0&&revenue!==null?revenue/spend:null,ctr:impressions!==null&&impressions>0&&clicks!==null?clicks/impressions*100:null,trend:[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date))}};
}
