import { z } from "zod";
import { reportIdentity,sameOrigin } from "@/lib/auth/server";
import { dbError } from "@/lib/db";
import { boundedJSON,ownedLibrary,signApproval } from "@/lib/outreachServer";
import { destination,suppressed } from "@/lib/domain/outreach";

export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
 try{
  const user=await reportIdentity(req);
  const parsed=z.object({campaignId:z.string().min(1).max(150),leadIds:z.array(z.string().min(1).max(150)).min(1).max(100)}).safeParse(await boundedJSON(req));
  if(!parsed.success)return Response.json({error:"Select up to 100 drafts to approve."},{status:400});
  const library=await ownedLibrary(user.userId),campaign=library?.outreach?.find(c=>c.id===parsed.data.campaignId);
  if(!campaign||!library)return Response.json({error:"Campaign not found."},{status:404});
  const approvals=[];
  for(const leadId of parsed.data.leadIds){const recipient=campaign.recipients.find(r=>r.leadId===leadId),lead=library.leads.find(l=>l.id===leadId);
   const channel=recipient&&recipient.stepIndex>0?library.sequences?.find(s=>s.id===campaign.sequenceId)?.steps[recipient.stepIndex]?.channel:campaign.channel;
   if(!lead||!recipient||!channel||recipient.state!=="drafted"||!recipient.draft?.trim()||recipient.draft.length>20000||suppressed(lead,library.suppressions??[])||!destination(lead,channel))continue;
   approvals.push({leadId,approvalToken:signApproval(user.userId,campaign.id,lead,recipient,channel),approvedAt:new Date().toISOString(),approvedBy:user.userId});
  }
  return Response.json({approvals},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){if(error instanceof SyntaxError||error instanceof Error&&["Request too large","Missing request body"].includes(error.message))return Response.json({error:"Invalid approval request."},{status:400});return dbError(error);}
}
