import type { AgentId } from "../types";
import type { Module } from "../permissions";
import type { CRMLibrary } from "../domain/crmLibrary";
import { clientKnowledgeSources, knowledgeAccess, rankKnowledge } from "../domain/clientKnowledge";
import { campaignMediaRows, mediaDates, mediaTotals } from "../domain/performance";

type AgentEvidence = {id:string;title:string;content:unknown};
const allowedKnowledge:Record<AgentId,readonly string[]> = {
  sales:["memory","asset"], strategy:["memory","asset","strategy","campaign"],
  media:["memory","strategy","campaign"], creative:["memory","asset","strategy","creative"],
  video:["memory","asset","creative"], social:["memory","asset","strategy","creative"],
  seo:["memory","asset","strategy"], analytics:["memory","campaign"],
  reporting:["memory","campaign","strategy"], client_success:["memory","asset","campaign"],
  finance:["memory"], automation:["memory","asset"],
};

export function agentEvidence(data:CRMLibrary,userId:string,agent:AgentId,clientId:string|undefined,task:string) {
  const access = (module:Module)=>knowledgeAccess(data,userId,module);
  const inScope = <T extends {clientId?:string}>(rows:T[])=>rows.filter(row=>!clientId||row.clientId===clientId);
  const records:AgentEvidence[] = [];
  const add = (id:string,title:string,content:unknown)=>records.push({id,title,content});
  const maxRecords = 15;
  const campaigns = ()=>inScope(data.campaigns ?? []).slice(0,maxRecords);
  const addCampaigns = ()=>{
    if(!access("campaigns")&&!access("performance")&&!access("analytics"))return;
    const window=mediaDates(30);
    for(const row of campaigns()){
      const current=campaignMediaRows(row,window.start,window.end);
      const previous=campaignMediaRows(row,window.prevStart,window.prevEnd);
      add("campaign-record-"+row.id,row.name,{platform:row.platform,objective:row.objective,status:row.status,kpis:row.kpis,
        current:{start:window.start,end:window.end,rows:current.length,totals:mediaTotals(current)},
        previous:{start:window.prevStart,end:window.prevEnd,rows:previous.length,totals:mediaTotals(previous)}});
    }
  };

  switch(agent){
    case "sales": {
      const deals = access("pipeline") ? inScope(data.deals ?? []) : [];
      const leadIds = new Set(deals.map(deal=>deal.leadId));
      for(const lead of (data.leads ?? []).filter(lead=>!clientId||leadIds.has(lead.id)).slice(0,maxRecords))
        add("lead-"+lead.id,lead.company,{name:lead.name,industry:lead.industry,status:lead.status,services:lead.services,
          score:lead.score?.override??lead.score?.value,nextFollowUpAt:lead.nextFollowUpAt,researchStatus:lead.research?.status});
      for(const deal of deals.slice(0,8))add("deal-"+deal.id,deal.title,{stage:deal.stage,services:deal.services,expectedClose:deal.expectedClose});
      break;
    }
    case "strategy":
      for(const plan of inScope(data.strategies ?? []).slice(0,8))add("plan-"+plan.id,plan.title,{status:plan.status,summary:plan.summary.slice(0,1500),kpis:plan.kpis.slice(0,8)});
      addCampaigns();
      break;
    case "media":
      addCampaigns();
      for(const rec of inScope(data.recommendations ?? []).filter(rec=>rec.agent==="media").slice(0,8))
        add("recommendation-"+rec.id,rec.title,{finding:rec.finding,priority:rec.priority,status:rec.status,evidence:rec.evidence.slice(0,5)});
      break;
    case "creative":
      for(const creative of inScope(data.creatives ?? []).slice(0,maxRecords)){
        const version=creative.versions.at(-1);
        add("creative-record-"+creative.id,creative.title,{status:creative.status,platform:creative.platform,format:creative.format,angle:creative.angle,hook:creative.hook,headline:version?.headline,body:version?.body?.slice(0,600)});
      }
      break;
    case "video":
      // The editor's current timeline is browser-local and can be supplied as a review brief.
      break;
    case "social":
      for(const post of inScope(data.socialPosts ?? []).slice(0,maxRecords))
        add("post-"+post.id,post.title,{platform:post.platform,format:post.format,stage:post.stage,pillar:post.pillar,hook:post.hook,analytics:post.analytics});
      break;
    case "seo":
      for(const project of inScope(data.seoProjects ?? []).slice(0,8)){
        const workspace=project.workspace;
        add("seo-"+project.id,"SEO project",{site:workspace?.siteUrl,lastAudit:workspace?.audits[0]?.at,keywords:workspace?.keywords.slice(0,10)});
      }
      break;
    case "analytics":
      addCampaigns();
      for(const feed of inScope(data.analyticsFeeds ?? []).slice(0,8))
        add("feed-"+feed.id,feed.platform+" · "+feed.report,{method:feed.method,currency:feed.currency,recordCount:feed.rows.length,updatedAt:feed.updatedAt});
      break;
    case "reporting":
      for(const report of inScope(data.clientReporting?.reports ?? []).slice(0,8))
        add("report-"+report.id,report.frequency+" client report",{status:report.status,window:report.facts.window,stats:report.facts.stats});
      break;
    case "client_success":
      for(const client of (data.clients ?? []).filter(client=>!clientId||client.id===clientId).slice(0,maxRecords))
        add("client-"+client.id,client.company,{industry:client.industry,health:client.health,services:client.services,contractEnd:client.contractEnd});
      addCampaigns();
      break;
    case "finance":
      for(const invoice of inScope(data.invoices ?? []).slice(0,maxRecords))
        add("invoice-"+invoice.id,invoice.number,{amount:invoice.amount,paid:invoice.paid,status:invoice.status,dueDate:invoice.dueDate});
      break;
    case "automation":
      for(const workflow of inScope(data.marketingAutomations ?? []).slice(0,maxRecords))
        add("workflow-"+workflow.id,workflow.name,{entity:workflow.entity,enabled:workflow.enabled,nodes:workflow.nodes.map(node=>({type:node.type,operation:node.operation})),recentRuns:workflow.history.slice(-5).map(run=>({status:run.status,updatedAt:run.updatedAt}))});
      break;
  }

  if(!clientId||!access("clients"))return {records,clientSources:[]};
  const client = data.clients.find(item=>item.id===clientId);
  if(client && agent!=="client_success")add("client-"+client.id,client.company,{industry:client.industry,services:client.services});
  const candidates=clientKnowledgeSources(data,userId,clientId,true).filter(source=>{
    if(!allowedKnowledge[agent].includes(source.id.split("-")[0]))return false;
    if(agent==="finance")return source.id==="memory-Client preferences";
    if(source.id.startsWith("asset-")&&/^(Contracts|Proposals|Reports) ·/.test(source.kind))return false;
    return true;
  });
  const standing=candidates.filter(source=>["memory-Client preferences","memory-Approved messaging","memory-Rejected concepts","memory-Tone of voice"].includes(source.id)).slice(0,4);
  const relevant=rankKnowledge(candidates.filter(source=>!standing.includes(source)),task+" brand guidelines SOP",5);
  return {records,clientSources:[...standing,...relevant].map(({id,title,kind,excerpt})=>({id,title,kind,excerpt:excerpt.slice(0,1400)}))};
}
