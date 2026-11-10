import type { CRMLibrary } from "./crmLibrary";
import { campaignFacts, metricValue } from "./analyticsEngine.ts";
import { safeClientLink } from "./clientProfile.ts";

export const shareKinds = ["campaign","report","upload","creative","task","document","invoice","meeting"] as const;
export type ShareKind = typeof shareKinds[number];
export type PortalAccount = { userId:string; clientId:string; email:string; active:boolean; createdAt:string };
export type PortalShare = { clientId:string; kind:ShareKind; id:string; version?:number; fingerprint?:string };
export type PortalMessage = { id:string; clientId:string; from:"Agency"|"Client"; text:string; at:string };
export type PortalDecision = { clientId:string; creativeId:string; fingerprint:string; verdict:"Approved"|"Changes requested"; feedback:string; at:string };
export type ClientPortalState = { accounts:PortalAccount[]; shares:PortalShare[]; messages:PortalMessage[]; decisions:PortalDecision[] };
export const emptyPortal = ():ClientPortalState => ({accounts:[],shares:[],messages:[],decisions:[]});
export const portalState = (library: CRMLibrary) => library.clientPortal ?? emptyPortal();
export const portalContact = (library: CRMLibrary, clientId:string, email:string) => library.clients.find(c=>c.id===clientId)?.contacts.some(c=>c.email?.trim().toLowerCase()===email) ?? false;

export function portalChoices(data: CRMLibrary, clientId: string) {
  const client = data.clients.find(c=>c.id===clientId);
  if (!client) return null;
  const campaigns=data.campaigns.filter(c=>c.clientId===clientId);
  const creatives=data.creatives.filter(c=>c.clientId===clientId);
  const tasks=data.tasks.filter(t=>t.related?.type==="client" && t.related.id===clientId ||
    t.related?.type==="campaign" && campaigns.some(c=>c.id===t.related?.id) ||
    t.related?.type==="creative" && creatives.some(c=>c.id===t.related?.id) ||
    t.projectId && data.projects.some(p=>p.id===t.projectId&&p.clientId===clientId));
  const reports=(data.clientReporting?.reports??[]).filter(r=>r.clientId===clientId&&r.approved&&["Approved","Sending","Accepted","Delivery unknown"].includes(r.status));
  const documents=client.documents.flatMap(d=>{
    const url=safeClientLink(d.url);
    return url?.startsWith("https:") ? [{id:JSON.stringify([d.name,d.addedAt,url]),name:d.name,kind:d.kind,url}] : [];
  });
  return {client,campaigns,creatives,tasks,reports,documents,
    invoices:data.invoices.filter(i=>i.clientId===clientId),
    meetings:data.meetings.filter(m=>m.clientId===clientId)};
}

export function reviewableCreative(data: CRMLibrary, clientId:string, id:string, version?:number) {
  const creative=data.creatives.find(c=>c.id===id&&c.clientId===clientId);
  const versions=creative?.versions??[];
  const v=version===undefined ? versions.at(-1) : versions.find(v=>v.v===version);
  if (!creative || !v) return null;
  return {id:creative.id,title:creative.title,format:creative.format,platform:creative.platform,version:v.v,
    headline:v.headline,body:v.body,cta:v.cta,storyboard:v.storyboard,fileName:v.fileName};
}

export function clientCampaignPerformance(campaign: CRMLibrary["campaigns"][number]) {
  const facts=campaignFacts([campaign],[],[],false);
  const latest=facts.reduce((last,row)=>row.date>last?row.date:last,"");
  const start=latest ? new Date(Date.parse(latest)-29*86400000).toISOString().slice(0,10) : "";
  const platforms=[...new Set(facts.map(row=>row.platform))];
  return platforms.map(platform=>{
    const rows=facts.filter(row=>row.platform===platform&&row.date>=start&&row.date<=latest);
    return {platform,start,end:latest,days:new Set(rows.map(row=>row.date)).size,
      metrics:(["spend","impressions","clicks","leads","conversions","cpa","roas","revenue"] as const).map(key=>({key,...metricValue(rows,key),rows:rows.length}))};
  }).filter(series=>series.days);
}
