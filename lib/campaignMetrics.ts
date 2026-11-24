// Campaign performance rows live in the campaign_metrics table, not in the CRM library document.
// Callers keep working with campaign.performanceRows: rows are attached after reading the library
// and taken off again before it is saved. Until the migration is applied, rows stay in the document
// exactly as before, so nothing breaks in a deployment that has not run the SQL yet.
import {supabaseRequest,SupabaseDbError} from "./db.ts";
import type {CRMLibrary} from "./domain/crmLibrary";
import type {MediaMetricRow} from "./types";

const TABLE="campaign_metrics";
const PAGE=1000;
type DbRow={owner_id:string;id:string;campaign_id:string;platform:string;metric_date:string;ad_id:string|null;ad_name:string|null;spend:number|string|null;impressions:number|string|null;reach:number|string|null;clicks:number|string|null;leads:number|string|null;conversions:number|string|null;revenue:number|string|null;frequency:number|string|null;source:MediaMetricRow["source"];entered_by:string|null;imported_at:string};

const missingTable=(error:unknown)=>error instanceof SupabaseDbError&&["PGRST205","PGRST204","42P01"].includes(error.code);
let readyUntil=0,ready=false;
/** Whether the table exists. Cached briefly so a missing migration is noticed again within a minute of being applied. */
export async function campaignMetricsReady(){
  if(Date.now()<readyUntil)return ready;
  try{await supabaseRequest(TABLE,{query:{select:"id",limit:"1"}});ready=true;}
  catch(error){if(!missingTable(error))throw error;ready=false;}
  readyUntil=Date.now()+(ready?10*60_000:60_000);return ready;
}

const num=(v:number|string|null)=>v===null?null:Number(v);
function fromDb(r:DbRow):MediaMetricRow{
  return {id:r.id,date:r.metric_date,platform:r.platform,...(r.ad_id?{adId:r.ad_id}:{}),...(r.ad_name?{adName:r.ad_name}:{}),source:r.source,importedAt:new Date(r.imported_at).toISOString(),
    spend:num(r.spend),impressions:num(r.impressions),reach:num(r.reach),clicks:num(r.clicks),leads:num(r.leads),conversions:num(r.conversions),revenue:num(r.revenue),...(r.frequency!==null?{frequency:num(r.frequency)}:{})};
}
function toDb(owner:string,campaignId:string,r:MediaMetricRow,by?:string):DbRow{
  return {owner_id:owner,id:r.id,campaign_id:campaignId,platform:r.platform,metric_date:r.date,ad_id:r.adId||null,ad_name:r.adName||null,
    spend:r.spend,impressions:r.impressions,reach:r.reach,clicks:r.clicks,leads:r.leads,conversions:r.conversions,revenue:r.revenue,frequency:r.frequency??null,
    source:r.source,entered_by:by??null,imported_at:r.importedAt};
}

/** Every row for one account, grouped by campaign. */
async function loadRows(owner:string){
  const byCampaign=new Map<string,MediaMetricRow[]>();
  for(let offset=0;;offset+=PAGE){
    const page=await supabaseRequest<DbRow[]>(TABLE,{query:{owner_id:`eq.${owner}`,select:"*",order:"campaign_id.asc,metric_date.asc,id.asc",limit:String(PAGE),offset:String(offset)},timeoutMs:30_000});
    for(const r of page)byCampaign.set(r.campaign_id,[...(byCampaign.get(r.campaign_id)??[]),fromDb(r)]);
    if(page.length<PAGE)return byCampaign;
  }
}
async function upsertRows(owner:string,items:{campaignId:string;row:MediaMetricRow}[],by?:string){
  for(let i=0;i<items.length;i+=500)
    await supabaseRequest(TABLE,{method:"POST",query:{on_conflict:"owner_id,id"},prefer:"resolution=merge-duplicates,return=minimal",
      body:items.slice(i,i+500).map(({campaignId,row})=>({...toDb(owner,campaignId,row,by),updated_at:new Date().toISOString()})),timeoutMs:30_000});
}
async function deleteRows(owner:string,ids:string[]){
  for(let i=0;i<ids.length;i+=100)
    await supabaseRequest(TABLE,{method:"DELETE",query:{owner_id:`eq.${owner}`,id:`in.(${ids.slice(i,i+100).map(id=>`"${id.replace(/["\\]/g,"\\$&")}"`).join(",")})`}});
}

export type RowSnapshot={ready:boolean;rows:Map<string,string>};
const key=(campaignId:string,id:string)=>`${campaignId}\u0000${id}`;

/** Attaches table rows to library.campaigns[].performanceRows. Rows still inside the document from before the
 * migration are copied into the table first, so they are never lost. Returns a snapshot for persistCampaignRows. */
export async function attachCampaignRows(owner:string,library:Pick<CRMLibrary,"campaigns">):Promise<RowSnapshot>{
  if(!(await campaignMetricsReady()))return {ready:false,rows:new Map()};
  const stored=await loadRows(owner),legacy:{campaignId:string;row:MediaMetricRow}[]=[];
  for(const c of library.campaigns??[]){
    const have=new Set((stored.get(c.id)??[]).map(r=>r.id));
    for(const row of c.performanceRows??[])if(!have.has(row.id))legacy.push({campaignId:c.id,row});
  }
  if(legacy.length){
    await upsertRows(owner,legacy);
    for(const {campaignId,row} of legacy)stored.set(campaignId,[...(stored.get(campaignId)??[]),row]);
  }
  const rows=new Map<string,string>();
  for(const c of library.campaigns??[]){
    const list=stored.get(c.id);
    if(list?.length){c.performanceRows=list.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));for(const r of list)rows.set(key(c.id,r.id),JSON.stringify(r));}
    else delete c.performanceRows;
  }
  return {ready:true,rows};
}

/** Writes rows that were added, changed or removed since attachCampaignRows, then removes them from the document. */
export async function persistCampaignRows(owner:string,library:Pick<CRMLibrary,"campaigns">,snapshot:RowSnapshot,by?:string){
  if(!snapshot.ready)return;
  const changed:{campaignId:string;row:MediaMetricRow}[]=[],seen=new Set<string>(),live=new Set((library.campaigns??[]).map(c=>c.id));
  for(const c of library.campaigns??[])for(const row of c.performanceRows??[]){
    const k=key(c.id,row.id);seen.add(k);
    if(snapshot.rows.get(k)!==JSON.stringify(row))changed.push({campaignId:c.id,row});
  }
  // A row disappears only when a person or import removed it from a campaign that still exists.
  // Rows of a deleted campaign are kept, so an accidental campaign deletion does not erase its history.
  const removed=[...snapshot.rows.keys()].filter(k=>!seen.has(k)&&live.has(k.split("\u0000")[0])).map(k=>k.split("\u0000")[1]);
  if(changed.length)await upsertRows(owner,changed,by);
  if(removed.length)await deleteRows(owner,removed);
  stripCampaignRows(library);
}

export function stripCampaignRows(library:Pick<CRMLibrary,"campaigns">){
  for(const c of library.campaigns??[])delete c.performanceRows;
}
