import { createHash } from "node:crypto";
import {approvalSignature,matchesSecret} from "./domain/outreachApproval";
export {matchesSecret} from "./domain/outreachApproval";
import { supabaseRequest } from "./db";
import type { CRMLibrary } from "./domain/crmLibrary";
import { OUTREACH_CHANNELS } from "./domain/outreach";
import type { Channel, Lead, OutreachRecipient } from "./types";

export async function ownedLibrary(owner: string) {
  const [row] = await supabaseRequest<{data:CRMLibrary}[]>("crm_libraries",{query:{owner_id:`eq.${owner}`,select:"data",limit:"1"}});
  return row?.data;
}
export async function boundedJSON(req: Pick<Request, "body">, limit = 32000):Promise<unknown> {
  const reader=req.body?.getReader();if(!reader)throw new Error("Missing request body");
  let bytes=0,text="";const decoder=new TextDecoder();
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){await reader.cancel();throw new Error("Request too large");}text+=decoder.decode(part.value,{stream:true});}
  return JSON.parse(text+decoder.decode());
}
function signingKey(){const key=process.env.OUTREACH_APPROVAL_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;if(!key)throw new Error("Approval signing is not configured");return key;}
export function signApproval(owner:string,campaign:string,lead:Lead,recipient:OutreachRecipient,channel:Channel){return approvalSignature(signingKey(),owner,campaign,lead,recipient,channel);}
export function approvedContent(owner:string,campaign:string,lead:Lead,recipient:OutreachRecipient,channel:Channel){return !!recipient.approvalToken&&matchesSecret(signApproval(owner,campaign,lead,recipient,channel),recipient.approvalToken);}
export const hashContent=(value:string)=>createHash("sha256").update(value).digest("hex");
export function deliveryIntegration() {
  let valid=false;try{const url=new URL(process.env.OUTREACH_DELIVERY_URL??"");valid=url.protocol==="https:"&&!url.username&&!url.password;}catch{}
  const channels=(process.env.OUTREACH_APPROVED_CHANNELS??"").split(",").map(s=>s.trim()).filter(c=>OUTREACH_CHANNELS.includes(c as typeof OUTREACH_CHANNELS[number]));
  return {ready:valid&&!!process.env.OUTREACH_DELIVERY_TOKEN&&!!process.env.OUTREACH_WEBHOOK_SECRET,channels};
}
export interface Delivery {id:string;owner_id:string;campaign_id:string;lead_id:string;step_index:number;channel:Channel;status:"sending"|"accepted"|"failed"|"unknown";provider_message_id?:string;error?:string;created_at:string;content_hash:string;}
export interface DeliveryEvent {event_id:string;delivery_id:string;kind:"delivered"|"opened"|"replied"|"bounced"|"unsubscribed";occurred_at:string;}
export async function deliveryHistory(owner:string,campaign?:string){
 const deliveries=await supabaseRequest<Delivery[]>("outreach_deliveries",{query:{owner_id:`eq.${owner}`,...(campaign?{campaign_id:`eq.${campaign}`}:{ }),select:"*",order:"created_at.desc",limit:"1000"}});
 const events:DeliveryEvent[]=[];
 for(let i=0;i<deliveries.length;i+=50){events.push(...await supabaseRequest<DeliveryEvent[]>("outreach_events",{query:{delivery_id:`in.(${deliveries.slice(i,i+50).map(d=>d.id).join(",")})`,select:"*",order:"occurred_at.desc",limit:"10000"}}));}
 return {deliveries,events};
}
