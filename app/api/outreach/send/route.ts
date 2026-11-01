import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {dbError,supabaseRequest} from "@/lib/db";
import {approvedContent,boundedJSON,deliveryIntegration,hashContent,ownedLibrary,type Delivery} from "@/lib/outreachServer";
import {approvalContent,destination,sendWindowOpen,suppressed} from "@/lib/domain/outreach";
export const maxDuration=120;
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
 try{
  const user=await reportIdentity(req);
  const parsed=z.object({campaignId:z.string().min(1).max(150)}).safeParse(await boundedJSON(req));
  if(!parsed.success)return Response.json({error:"Invalid campaign."},{status:400});
  const library=await ownedLibrary(user.userId),campaign=library?.outreach?.find(c=>c.id===parsed.data.campaignId);
  if(!campaign||!library)return Response.json({error:"Campaign not found."},{status:404});
  if(["Paused","Completed"].includes(campaign.status))return Response.json({error:"Resume this campaign before sending."},{status:409});
  const integration=deliveryIntegration();
  if(!integration.ready)return Response.json({error:"No delivery integration is connected. Drafts and approvals are saved; no messages have been sent."},{status:503});
  const sequence=library.sequences?.find(s=>s.id===campaign.sequenceId);
  if(!sequence||!sendWindowOpen(sequence,new Date()))return Response.json({error:"Sending is outside this sequence's UTC sending window, or the sequence is missing."},{status:409});
  const results: {leadId:string;status:string;delivery?:Delivery;error?:string}[]=[];
  for(const recipient of campaign.recipients.filter(r=>r.state==="approved").slice(0,10)){
   // Re-read before every claim: another laptop may have opted out, paused or edited a draft.
   const current=await ownedLibrary(user.userId),currentCampaign=current?.outreach?.find(c=>c.id===campaign.id),r=currentCampaign?.recipients.find(r=>r.leadId===recipient.leadId),lead=current?.leads.find(l=>l.id===recipient.leadId);
   const channel=recipient.stepIndex>0?sequence.steps[recipient.stepIndex]?.channel:campaign.channel;
   const block=(error:string)=>results.push({leadId:recipient.leadId,status:"blocked",error});
   if(!current||!lead||!r||!channel||!currentCampaign||["Paused","Completed"].includes(currentCampaign.status)||r.state!=="approved"){block("Campaign or draft changed. Review again.");continue;}
   if(suppressed(lead,current.suppressions??[])||["Meeting","Won","Lost"].includes(lead.status)){block("Contact suppressed, opted out or no longer eligible.");continue;}
   const signals=await supabaseRequest<{kind:string}[]>("outreach_events",{query:{select:"kind,outreach_deliveries!inner(owner_id,lead_id)","outreach_deliveries.owner_id":`eq.${user.userId}`,"outreach_deliveries.lead_id":`eq.${lead.id}`,kind:"in.(replied,bounced,unsubscribed)",limit:"1"}});
   if(signals.length){block("A reply, bounce or opt-out stopped further outreach.");continue;}
   if(!integration.channels.includes(channel)||!destination(lead,channel)){block(`No approved ${channel} integration or recipient address.`);continue;}
   if(!r.draft?.trim()||!approvedContent(user.userId,campaign.id,lead,r,channel)){block("Approval does not match the current draft or destination. Review and approve again.");continue;}
   if(r.stepIndex>0){const previous=sequence.steps[r.stepIndex-1],step=sequence.steps[r.stepIndex];const due=Date.parse(r.lastSentAt??"")+Math.max(0,(step?.dayOffset??0)-(previous?.dayOffset??0))*86400000;if(!Number.isFinite(due)||Date.now()<due){block("Follow-up is not due yet.");continue;}
    if(step?.condition==="opened_no_reply"){const opened=await supabaseRequest<unknown[]>("outreach_events",{query:{select:"event_id,outreach_deliveries!inner(owner_id,lead_id,campaign_id)","outreach_deliveries.owner_id":`eq.${user.userId}`,"outreach_deliveries.lead_id":`eq.${lead.id}`,"outreach_deliveries.campaign_id":`eq.${campaign.id}`,kind:"eq.opened",limit:"1"}});if(!opened.length){block("No verified open event for this follow-up.");continue;}}
   }
   const hash=hashContent(approvalContent(user.userId,campaign.id,lead,r,channel));
   const claim=await supabaseRequest<{claimed:boolean;delivery?:Delivery;error?:string}>("rpc/claim_outreach_delivery",{method:"POST",body:{p_id:crypto.randomUUID(),p_owner:user.userId,p_campaign:campaign.id,p_lead:lead.id,p_step:r.stepIndex,p_channel:channel,p_hash:hash,p_limit:sequence.dailyLimit}});
   if(!claim.claimed||!claim.delivery){if(claim.delivery&&claim.delivery.content_hash!==hash){block("A different message already has a delivery attempt for this touch. Check tracking before creating a new campaign.");continue;}results.push({leadId:lead.id,status:claim.delivery?.status??"blocked",delivery:claim.delivery,error:claim.error??claim.delivery?.error});continue;}
   const delivery=claim.delivery;let status:"accepted"|"failed"|"unknown"="unknown",provider:string|null=null,error:string|null=null;
   try{
    const response=await fetch(process.env.OUTREACH_DELIVERY_URL!,{method:"POST",headers:{Authorization:`Bearer ${process.env.OUTREACH_DELIVERY_TOKEN}`,"Content-Type":"application/json","Idempotency-Key":delivery.id},body:JSON.stringify({deliveryId:delivery.id,channel,to:destination(lead,channel),body:r.draft,subject:channel==="Email"?`A question for ${lead.company}`:undefined,campaignId:campaign.id,variant:r.variant??"A",stepIndex:r.stepIndex,approval:{by:r.approvedBy,at:r.approvedAt}}),redirect:"error",signal:AbortSignal.timeout(8000)});
    const result=await response.json().catch(()=>null);
    if(response.ok&&result?.accepted===true&&typeof result.messageId==="string"&&result.messageId.length<=500){status="accepted";provider=result.messageId;}
    else {status=response.status>=400&&response.status<500?"failed":"unknown";error=status==="failed"?"Integration rejected this message; check the provider before creating a new attempt.":"Delivery acceptance could not be confirmed. Check the provider; automatic retry is blocked.";}
   }catch{error="Delivery acceptance is unknown. Check the provider; automatic retry is blocked.";}
   await supabaseRequest("rpc/finish_outreach_delivery",{method:"POST",body:{p_id:delivery.id,p_owner:user.userId,p_status:status,p_provider:provider,p_error:error}});
   results.push({leadId:lead.id,status,delivery:{...delivery,status,provider_message_id:provider??undefined,error:error??undefined},error:error??undefined});
  }
  return Response.json({results},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){if(error instanceof SyntaxError)return Response.json({error:"Invalid request."},{status:400});return dbError(error);}
}
