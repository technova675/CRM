import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {supabaseRequest} from "./db";
import type {CRMLibrary} from "./domain/crmLibrary";
import type {Campaign,Recommendation} from "./types";
function stable(v:unknown):unknown{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object")return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)]));return v;}
const json=(v:unknown)=>JSON.stringify(stable(v));
export function mediaFingerprint(c:Campaign,start:string,end:string){return createHash("sha256").update(json({id:c.id,clientId:c.clientId,budget:c.budget,budgetPeriod:c.budgetPeriod,status:c.status,kpis:c.kpis,rows:c.performanceRows,metrics:c.metrics,start,end})).digest("hex");}
function sign(owner:string,rec:Recommendation){const secret=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY;if(!secret)throw new Error("Media review signing is not configured.");const {signature:discard,...plan}=rec.mediaPlan!;void discard;return createHmac("sha256",secret).update("media-review-v1|"+owner+"|"+json({id:rec.id,adId:rec.adId,clientId:rec.clientId,title:rec.title,category:rec.category,recommendation:rec.recommendation,evidence:rec.evidence,plan})).digest("hex");}
export function signMediaRecommendation(owner:string,rec:Recommendation){return {...rec,mediaPlan:{...rec.mediaPlan!,signature:sign(owner,rec)}};}
export function validMediaRecommendation(owner:string,rec:Recommendation){try{const expected=Buffer.from(sign(owner,rec),"hex"),actual=Buffer.from(rec.mediaPlan?.signature??"","hex");return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
export async function mutateMedia(owner:string,operation:string,change:(data:CRMLibrary)=>CRMLibrary){
 for(let attempt=0;attempt<3;attempt++){const [row]=await supabaseRequest<{revision:number;data:CRMLibrary;last_operation?:string}[]>("crm_libraries",{query:{owner_id:`eq.${owner}`,select:"revision,data,last_operation",limit:"1"}});if(!row)throw new Error("Campaign or recommendation not found in this account. Open the CRM library first.");if(row.last_operation===operation)return row;
 const data=change(structuredClone(row.data));if(Buffer.byteLength(JSON.stringify(data))>8000000)throw new Error("The CRM library exceeds its save limit; reduce the import size.");const revision=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{p_owner:owner,p_revision:row.revision,p_operation:operation,p_data:data}});if(revision>=0)return {revision,data};}
 throw new Error("The CRM changed on another laptop. Reload and retry.");
}
export function mediaConnectorConfigured(){try{const url=new URL(process.env.MEDIA_CONNECTOR_URL??"");return url.protocol==="https:"&&!url.username&&!url.password&&!!process.env.MEDIA_CONNECTOR_TOKEN;}catch{return false;}}
export async function callMediaConnector(path:string,owner:string,body?:unknown){if(!mediaConnectorConfigured())throw new Error("Live platform connector is not configured. Import a platform CSV or configure an authorized server connector.");const url=new URL(path,(process.env.MEDIA_CONNECTOR_URL??"").replace(/\/?$/,"/"));if(!body)url.searchParams.set("ownerId",owner);const response=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${process.env.MEDIA_CONNECTOR_TOKEN}`,"Content-Type":"application/json"},body:body?JSON.stringify({ownerId:owner,...body as object}):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("Platform connector could not complete the request. Check authorization and retry.");return response.json();}


