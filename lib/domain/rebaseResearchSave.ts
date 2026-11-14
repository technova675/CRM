import type {CRMLibrary} from "./crmLibrary";

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const researchLeadFields=new Set(["research","score","status"]);
const researchDealFields=new Set(["stage","probability"]);

function changedOnly(base:Record<string,unknown>,local:Record<string,unknown>,allowed:Set<string>){
 return Object.keys({...base,...local}).every(key=>allowed.has(key)||same(base[key],local[key]));
}

// A stale whole-library save can be retried only when its local edits came from
// lead research and the other laptop did not edit those same lead/deal records.
export function rebaseResearchSave(base:CRMLibrary,local:CRMLibrary,remote:CRMLibrary):CRMLibrary|null{
 const exceptions=new Set(["leads","deals","activities"]);
 if(Object.keys({...base,...local}).some(key=>!exceptions.has(key)&&!same(base[key as keyof CRMLibrary],local[key as keyof CRMLibrary])))return null;

 const baseLeads=new Map(base.leads.map(lead=>[lead.id,lead]));
 const localLeads=new Map(local.leads.map(lead=>[lead.id,lead]));
 if(baseLeads.size!==localLeads.size||[...baseLeads.keys()].some(id=>!localLeads.has(id)))return null;
 const modifiedLeads=new Map<string,typeof local.leads[number]>();
 for(const [id,lead] of localLeads){
  const previous=baseLeads.get(id)!;
  if(same(previous,lead))continue;
  if(!changedOnly(previous as unknown as Record<string,unknown>,lead as unknown as Record<string,unknown>,researchLeadFields))return null;
  modifiedLeads.set(id,lead);
 }
 if(!modifiedLeads.size)return null;
 const remoteLeads=new Map(remote.leads.map(lead=>[lead.id,lead]));
 for(const [id,lead] of modifiedLeads){const previous=baseLeads.get(id),current=remoteLeads.get(id);if(!current||!same(previous,current)&&!same(lead,current))return null;}
 const leads=remote.leads.map(lead=>modifiedLeads.get(lead.id)??lead);

 const baseDeals=new Map(base.deals.map(deal=>[deal.id,deal]));
 const localDeals=new Map(local.deals.map(deal=>[deal.id,deal]));
 if([...baseDeals.keys()].some(id=>!localDeals.has(id)))return null;
 const remoteDeals=new Map(remote.deals.map(deal=>[deal.id,deal]));
 const modifiedDeals=new Map<string,typeof local.deals[number]>();
 const addedDeals:typeof local.deals=[];
 for(const [id,deal] of localDeals){
  const previous=baseDeals.get(id);
  if(!previous){
   if(!deal.leadId||!modifiedLeads.has(deal.leadId)||remoteDeals.has(id)||remote.deals.some(item=>item.leadId===deal.leadId))return null;
   addedDeals.push(deal);continue;
  }
  if(same(previous,deal))continue;
  if(!deal.leadId||!modifiedLeads.has(deal.leadId)||!changedOnly(previous as unknown as Record<string,unknown>,deal as unknown as Record<string,unknown>,researchDealFields))return null;
  const current=remoteDeals.get(id);if(!current||!same(previous,current)&&!same(deal,current))return null;
  modifiedDeals.set(id,deal);
 }
 const deals=[...addedDeals,...remote.deals.map(deal=>modifiedDeals.get(deal.id)??deal)];

 const baseActivities=new Map(base.activities.map(activity=>[activity.id,activity]));
 const localActivities=new Map(local.activities.map(activity=>[activity.id,activity]));
 if([...baseActivities].some(([id,activity])=>!same(localActivities.get(id),activity)))return null;
 const remoteActivities=new Map(remote.activities.map(activity=>[activity.id,activity]));
 const addedActivities=local.activities.filter(activity=>!baseActivities.has(activity.id));
 if(addedActivities.some(activity=>remoteActivities.has(activity.id)&&!same(remoteActivities.get(activity.id),activity)))return null;
 const activities=[...addedActivities.filter(activity=>!remoteActivities.has(activity.id)),...remote.activities];
 return {...remote,leads,deals,activities};
}
