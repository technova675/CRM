import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { accountWorkspace } from "./auth/identity";
import { getReportFile, listReportFiles } from "./reportsRepository";
import { supabaseRequest } from "./db";
import { readR2Part } from "./reportR2";
import type { Cell } from "./domain/reportFiles";
import { sessionIdentity } from "./auth/server";
import { resilientFetch } from "./auth/resilientFetch";
import { mutateMedia } from "./mediaServer";
import { ownedLibrary } from "./outreachServer";
import { portalChoices, portalContact, portalState, reviewableCreative, clientCampaignPerformance, type PortalShare } from "./domain/clientPortal";
import type { CRMLibrary } from "./domain/crmLibrary";

export class PortalError extends Error {
  constructor(message:string,readonly status=400) {super(message);}
}
export function requirePortalAdmin(data:CRMLibrary|undefined,owner:string): asserts data is CRMLibrary {
  if (!data?.team.some(p=>p.id===owner&&p.role==="admin"&&p.status==="active")) throw new PortalError("An agency administrator is required.",403);
}
export function ensurePortalMember(data:CRMLibrary|undefined,userId:string,email:string) {
  const account=data && portalState(data).accounts.find(a=>a.userId===userId&&a.active&&a.email===email.toLowerCase());
  if (!data || !account || !portalContact(data,account.clientId,account.email)) throw new PortalError("This account does not have active client portal access.",403);
  return account;
}
export async function portalContext(req:Request) {
  const identity=await sessionIdentity(req);
  if (!identity.portalOwner) throw new PortalError("Sign in with your client portal account.",403);
  const data=await ownedLibrary(identity.portalOwner);
  const account=ensurePortalMember(data,identity.userId,identity.email);
  return {owner:identity.portalOwner,userId:identity.userId,email:identity.email,account,data:data!};
}
const writable = (data:CRMLibrary) => data.clientPortal ??= portalState(data);
const fingerprint = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function sharedCreative(data:CRMLibrary,share:PortalShare) {
  const item=reviewableCreative(data,share.clientId,share.id,share.version);
  return item && fingerprint(item)===share.fingerprint ? item : null;
}
export function portalAdminView(data:CRMLibrary,clientId:string) {
  const choices=portalChoices(data,clientId);
  if (!choices) throw new PortalError("Client not found in this account.",404);
  const state=portalState(data);
  const shares=state.shares.filter(s=>s.clientId===clientId);
  const label=(kind:PortalShare["kind"],id:string,title:string)=>({kind,id,title,shared:shares.some(s=>s.kind===kind&&s.id===id&&(kind!=="creative"||!!sharedCreative(data,s)))});
  return { accounts:state.accounts.filter(a=>a.clientId===clientId),
    choices:[
      ...choices.campaigns.map(c=>label("campaign",c.id,c.name)),
      ...choices.reports.map(r=>label("report",r.id,r.frequency+" report · "+r.facts.window.end)),
      ...choices.creatives.flatMap(c=>reviewableCreative(data,clientId,c.id) ? [{ ...label("creative",c.id,c.title+" · version "+reviewableCreative(data,clientId,c.id)!.version), version:reviewableCreative(data,clientId,c.id)!.version, olderShared:shares.some(s=>s.kind==="creative"&&s.id===c.id&&s.version!==reviewableCreative(data,clientId,c.id)!.version), shared:shares.some(s=>s.kind==="creative"&&s.id===c.id&&s.version===reviewableCreative(data,clientId,c.id)!.version&&!!sharedCreative(data,s)) }] : []),
      ...choices.tasks.map(t=>label("task",t.id,t.title)),
      ...choices.documents.map(d=>label("document",d.id,d.name)),
      ...choices.invoices.map(i=>label("invoice",i.id,i.number)),
      ...choices.meetings.map(m=>label("meeting",m.id,m.title)),
    ],
    messages:state.messages.filter(m=>m.clientId===clientId),
    decisions:state.decisions.filter(d=>d.clientId===clientId).map(d=>({ ...d,title:choices.creatives.find(c=>c.id===d.creativeId)?.title ?? "Creative" })),
  };
}

export function setPortalShare(data:CRMLibrary,clientId:string,kind:PortalShare["kind"],id:string,enabled:boolean,version?:number) {
  const state=writable(data);
  if (enabled) {
    if (!portalAdminView(data,clientId).choices.some(c=>c.kind===kind&&c.id===id)) throw new PortalError("This record is unavailable for this client.",404);
    let saved:PortalShare={clientId,kind,id};
    if (kind==="creative") {
      const item=reviewableCreative(data,clientId,id);
      if (!item || item.version!==version) throw new PortalError("The creative version changed. Refresh before sharing.",409);
      saved={...saved,version:item.version,fingerprint:fingerprint(item)};
    }
    const next=state.shares.filter(s=>s.clientId!==clientId||s.kind!==kind||s.id!==id);
    if (next.length>=1500) throw new PortalError("The portal sharing limit has been reached.");
    state.shares=[...next,saved];
  } else state.shares=state.shares.filter(s=>s.clientId!==clientId||s.kind!==kind||s.id!==id);
}
export function writePortalMessage(data:CRMLibrary,clientId:string,from:"Client"|"Agency",id:string,text:string) {
  if (!data.clients.some(c=>c.id===clientId)) throw new PortalError("Client not found.",404);
  const state=writable(data);
  if (state.messages.some(m=>m.id===id)) return;
  if (state.messages.filter(m=>m.clientId===clientId).length>=500) throw new PortalError("This conversation has reached its message limit.");
  state.messages.push({clientId,from,id,text,at:new Date().toISOString()});
}
export function recordPortalDecision(data:CRMLibrary,clientId:string,id:string,hash:string,verdict:"Approved"|"Changes requested",feedback:string) {
  const state=writable(data);
  const share=state.shares.find(s=>s.clientId===clientId&&s.kind==="creative"&&s.id===id&&s.fingerprint===hash);
  if (!share || !sharedCreative(data,share)) throw new PortalError("This creative version is no longer available for approval.",409);
  if (state.decisions.some(d=>d.clientId===clientId&&d.creativeId===id&&d.fingerprint===hash)) throw new PortalError("This version already has a client decision.",409);
  state.decisions.push({clientId,creativeId:id,fingerprint:hash,verdict,feedback,at:new Date().toISOString()});
}

export function portalView(data:CRMLibrary,clientId:string) {
  const found=portalChoices(data,clientId);
  if (!found) throw new PortalError("Client not found.",404);
  const state=portalState(data);
  const shares=state.shares.filter(s=>s.clientId===clientId);
  const shared=(kind:PortalShare["kind"],id:string)=>shares.some(s=>s.kind===kind&&s.id===id);
  const campaigns=found.campaigns.filter(c=>shared("campaign",c.id));
  return {
    company:found.client.company,
    campaigns:campaigns.map(c=>({id:c.id,name:c.name,status:c.status,channels:c.channels?.length?c.channels:[c.platform],start:c.startDate,end:c.endDate})),
    performance:campaigns.map(c=>({id:c.id,name:c.name,series:clientCampaignPerformance(c)})),
    reports:found.reports.filter(r=>shared("report",r.id)).map(r=>({id:r.id,frequency:r.frequency,start:r.facts.window.start,end:r.facts.window.end})),
    creatives:shares.filter(s=>s.kind==="creative").flatMap(s=>{
      const item=sharedCreative(data,s);
      const decision=state.decisions.find(d=>d.clientId===clientId&&d.creativeId===s.id&&d.fingerprint===s.fingerprint);
      return item ? [{...item,hash:s.fingerprint!,decision:decision?.verdict,feedback:decision?.feedback}] : [];
    }),
    tasks:found.tasks.filter(t=>shared("task",t.id)).map(t=>({id:t.id,title:t.title,status:t.status,due:t.dueDate})),
    documents:found.documents.filter(d=>shared("document",d.id)),
    invoices:found.invoices.filter(i=>shared("invoice",i.id)).map(i=>({id:i.id,number:i.number,amount:i.amount,paid:i.paid,due:i.dueDate,issued:i.issuedAt,status:i.status})),
    meetings:found.meetings.filter(m=>shared("meeting",m.id)).map(m=>{
      const url=m.link?.startsWith("https://") ? m.link : undefined;
      return {id:m.id,title:m.title,starts:m.startsAt,minutes:m.durationMin,url};
    }),
    messages:state.messages.filter(m=>m.clientId===clientId).map(({id,from,text,at})=>({id,from,text,at})),
  };
}
export type PortalView = ReturnType<typeof portalView>;

export async function createPortalLogin(owner:string,clientId:string,email:string) {
  const data=await ownedLibrary(owner);
  requirePortalAdmin(data,owner);
  if (!portalContact(data,clientId,email)) throw new PortalError("Add this email to the selected client’s contacts first.");
  if (portalState(data).accounts.some(a=>a.email===email)) throw new PortalError("This contact already has a portal login. Restore access from the account list.",409);
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if (!url||!key) throw new PortalError("Portal login creation requires Supabase admin credentials.",503);
  const admin=createClient(url,key,{global:{fetch:resilientFetch},auth:{persistSession:false,autoRefreshToken:false}});
  const password=randomBytes(24).toString("base64url")+"Aa1!";
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{adbibe_portal_owner:owner}});
  if (!result.data?.user) {
    if (result.error?.status===422 || result.error?.code==="email_exists") throw new PortalError("This email is already registered. Use a separate client contact email.",409);
    throw new PortalError("The sign-in service could not create a portal login.",503);
  }
  const userId=result.data.user.id;
  try {
    await mutateMedia(owner,crypto.randomUUID(),next=>{
      requirePortalAdmin(next,owner);
      if (!portalContact(next,clientId,email)) throw new PortalError("The client contact changed. Refresh and try again.",409);
      const state=writable(next);
      if (state.accounts.length>=250) throw new PortalError("The client login limit has been reached.");
      if (state.accounts.some(a=>a.email===email)) throw new PortalError("This email is already linked to a portal.",409);
      state.accounts.push({userId,clientId,email,active:true,createdAt:new Date().toISOString()});
      return next;
    });
  } catch (error) {
    const saved=await ownedLibrary(owner).then(d=>d ? portalState(d).accounts.some(a=>a.userId===userId) : false).catch(()=>undefined);
    if (saved===false) await admin.auth.admin.deleteUser(userId).catch(()=>{});
    if (!saved) throw error;
  }
  return {email,password};
}

function linkedReportCompany(data:CRMLibrary,clientId:string) {
  const id=data.clients.find(c=>c.id===clientId)?.reportCompanyId;
  return id&&data.clients.filter(c=>c.reportCompanyId===id).length===1?id:null;
}
export async function portalUploads(data:CRMLibrary,owner:string,clientId:string,sharedOnly:boolean) {
  const company=linkedReportCompany(data,clientId);
  if(!company)return [];
  const shares=new Set(portalState(data).shares.filter(s=>s.clientId===clientId&&s.kind==="upload"&&s.fingerprint===company).map(s=>s.id));
  if(sharedOnly&&!shares.size)return [];
  const files=await listReportFiles(accountWorkspace(owner),company);
  return files.filter(f=>!sharedOnly||shares.has(f.id)).map(f=>({id:f.id,name:f.name,createdAt:f.createdAt,tables:f.tables,shared:shares.has(f.id)}));
}
export async function portalUploadPreview(data:CRMLibrary,owner:string,clientId:string,id:string,tableId:string|null) {
  const company=linkedReportCompany(data,clientId);
  if(!company||!portalState(data).shares.some(s=>s.clientId===clientId&&s.kind==="upload"&&s.id===id&&s.fingerprint===company)) throw new PortalError("Report not found.",404);
  const file=await getReportFile(accountWorkspace(owner),id);
  if(!file||file.clientId!==company) throw new PortalError("Report not found.",404);
  const table=tableId ? file.tables.find(t=>t.id===tableId) : file.tables[0];
  if(!table) throw new PortalError("Report table not found.",404);
  let rows=table.rows;
  if(table.chunked&&table.rowParts) {
    const [object]=await supabaseRequest<{object_key:string;sha256:string}[]>("report_r2_objects",{query:{select:"object_key,sha256",file_id:"eq."+id,table_id:"eq."+table.id,kind:"eq.rows",part_index:"eq.0",limit:"1"}});
    if(object) rows=JSON.parse((await readR2Part(object.object_key,object.sha256)).toString("utf8")) as Cell[][];
    else {
      const [part]=await supabaseRequest<{payload:Cell[][]}[]>("report_table_parts",{query:{select:"payload",file_id:"eq."+id,table_id:"eq."+table.id,kind:"eq.rows",part_index:"eq.0",limit:"1"}});
      if(!part)throw new PortalError("The saved report preview could not be loaded.",503);
      rows=part.payload;
    }
  }
  return {name:file.name,table:table.id,tables:file.tables.map(t=>({id:t.id,name:t.name})),columns:table.columns.slice(0,16).map(c=>c.slice(0,200)),rows:rows.slice(0,25).map(row=>row.slice(0,16).map(cell=>typeof cell==="string"?cell.slice(0,1000):cell))};
}
export async function sharePortalUpload(owner:string,clientId:string,id:string,enabled:boolean) {
  const data=await ownedLibrary(owner);
  requirePortalAdmin(data,owner);
  const company=linkedReportCompany(data,clientId);
  if(enabled&&(!company||!(await portalUploads(data,owner,clientId,false)).some(f=>f.id===id)))throw new PortalError("Link an uploaded report company to this client only, then select one of its files.",404);
  await mutateMedia(owner,crypto.randomUUID(),next=>{
    requirePortalAdmin(next,owner);
    if(enabled&&linkedReportCompany(next,clientId)!==company)throw new PortalError("The report company link changed. Refresh and retry.",409);
    const state=writable(next);
    const shares=state.shares.filter(s=>s.clientId!==clientId||s.kind!=="upload"||s.id!==id);
    if(enabled){if(shares.length>=1500)throw new PortalError("The portal sharing limit has been reached.");shares.push({clientId,kind:"upload",id,fingerprint:company!});}
    state.shares=shares;
    return next;
  });
}
