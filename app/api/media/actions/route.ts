import {recordAudit} from "@/lib/auditServer";
import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {mutateMedia,validMediaRecommendation,mediaFingerprint,executeMediaPlan} from "@/lib/mediaServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {dbError} from "@/lib/db";

const schema=z.object({operationId:z.string().uuid(),recommendationId:z.string().min(1).max(150),decision:z.enum(["approve","execute","dismiss"]),expectedSignature:z.string().optional()});
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:"Request origin is not allowed."},{status:403});
  try{
    const user=await reportIdentity(req),parsed=schema.safeParse(await boundedJSON(req,10000).catch(()=>null));
    if(!parsed.success)return Response.json({error:"Invalid recommendation action."},{status:400});
    const input=parsed.data;
    const result=await mutateMedia(user.userId,input.operationId,data=>{
      if(!knowledgeAccess(data,user.userId,"performance",true))throw new Error("Performance approval access is required.");
      const rec=data.recommendations.find(r=>r.id===input.recommendationId);
      if(!rec?.mediaPlan||!validMediaRecommendation(user.userId,rec)||input.expectedSignature&&rec.mediaPlan.signature!==input.expectedSignature)
        throw new Error("Recommendation not found or its reviewed content changed. Run a fresh analysis.");
      const campaign=data.campaigns.find(c=>c.id===rec.campaignId);
      if(!campaign||campaign.clientId!==rec.clientId)throw new Error("Campaign no longer exists in this account.");
      if(rec.status==="Executed"||rec.status==="Dismissed")throw new Error("This recommendation already has a final decision.");
      const before=rec.status,budget=campaign.budget;
      const at=new Date().toISOString();
      if(input.decision==="dismiss"){rec.status="Dismissed";rec.resolvedAt=at;rec.resolvedBy=user.userId;}
      else{
        if(mediaFingerprint(campaign,rec.mediaPlan.rangeStart,rec.mediaPlan.rangeEnd)!==rec.mediaPlan.fingerprint)
          throw new Error("The evidence or campaign budget changed. Analyze again before approval or execution.");
        if(input.decision==="approve"){
          if(rec.status==="Approved")throw new Error("This recommendation has already been approved.");
          rec.status="Approved";rec.mediaApprovedAt=at;rec.mediaApprovedBy=user.userId;
        }else{
          if(rec.status!=="Approved"||!rec.mediaApprovedAt||!rec.mediaApprovedBy)throw new Error("Human approval is required before execution.");
          executeMediaPlan(data,rec,campaign,user.userId,at);
        }
      }
      data.activities.unshift({id:crypto.randomUUID(),at,actor:"human",actorId:user.userId,entity:"recommendation",entityId:rec.id,
        action:input.decision==="approve"?"Approved media recommendation":input.decision==="dismiss"?"Rejected media recommendation":"Executed approved media action",detail:rec.mediaExecution?.note??rec.title});
      data.activities=data.activities.slice(0,2000);
      recordAudit(data,{actor:"human",actorId:user.userId,agent:rec.agent,entity:"recommendation",entityId:rec.id,clientId:rec.clientId,action:data.activities[0].action,sources:["Campaign metrics · "+rec.mediaPlan.rangeStart+" to "+rec.mediaPlan.rangeEnd],approvedBy:rec.mediaApprovedBy,approvedAt:rec.mediaApprovedAt,outcome:rec.status,before:budget!==campaign.budget?String(budget):before,after:budget!==campaign.budget?String(campaign.budget):rec.status,detail:rec.title});
      return data;
    });
    return Response.json({revision:result.revision},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const message=(error as Error).message;
    if(message==="Performance approval access is required.")return Response.json({error:message},{status:403});
    if(/recommendation|approval|evidence|budget|Campaign|Human/i.test(message))return Response.json({error:message},{status:409});
    return dbError(error);
  }
}
