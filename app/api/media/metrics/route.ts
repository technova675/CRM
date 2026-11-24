import {z} from "zod";
import {createHash} from "node:crypto";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {recordAudit} from "@/lib/auditServer";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {MEDIA_PLATFORMS} from "@/lib/domain/performance";
import {dbError} from "@/lib/db";

const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
// Blank means "not reported", which is different from zero.
const metric=z.number().finite().min(0).max(1e12).nullable();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v&&v<=new Date(Date.now()+86400000).toISOString().slice(0,10);},"Enter a real date that is not in the future.");
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),operationId:z.uuid(),campaignId:z.string().min(1).max(150),platform:z.enum(MEDIA_PLATFORMS),date:day,
    adId:z.string().trim().max(200).optional(),adName:z.string().trim().max(500).optional(),
    spend:metric,impressions:metric,reach:metric,clicks:metric,leads:metric,conversions:metric,revenue:metric}),
  z.object({action:z.literal("delete"),operationId:z.uuid(),campaignId:z.string().min(1).max(150),rowId:z.string().min(1).max(250)}),
]);
class InputError extends Error{constructor(message:string,readonly status=400){super(message);}}

/** Records one day of results for a campaign by hand, or removes a recorded day. Re-entering the same day and ad replaces it. */
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,6000).catch(()=>null));
    if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??"Check the date and numbers.",field:parsed.error.issues[0]?.path.join(".")},400);
    const v=parsed.data,at=new Date().toISOString();
    const result=await mutateMedia(user.userId,v.operationId,data=>{
      if(!knowledgeAccess(data,user.userId,"campaigns",true))throw new InputError("Campaign edit access is required.",403);
      const campaign=data.campaigns.find(c=>c.id===v.campaignId);
      if(!campaign)throw new InputError("Campaign not found in this account.",404);
      const rows=campaign.performanceRows??[];
      if(v.action==="delete"){
        const row=rows.find(r=>r.id===v.rowId);if(!row)throw new InputError("That entry was already removed.",404);
        campaign.performanceRows=rows.filter(r=>r.id!==v.rowId);
        recordAudit(data,{actor:"human",actorId:user.userId,entity:"campaign",entityId:campaign.id,clientId:campaign.clientId,action:"Removed campaign results",before:`${row.platform} · ${row.date}`,outcome:"Saved",detail:campaign.name});
      }else{
        if(v.clicks!==null&&v.impressions!==null&&v.clicks>v.impressions)throw new InputError("Clicks cannot be more than impressions.");
        if(v.reach!==null&&v.impressions!==null&&v.reach>v.impressions)throw new InputError("Reach cannot be more than impressions.");
        if(v.adName&&!v.adId)throw new InputError("Add the ad ID when you name an ad.");
        const id=createHash("sha256").update(`${campaign.id}|${v.platform}|${v.date}|${v.adId?`ad:${v.adId}`:"campaign"}`).digest("hex");
        const previous=rows.find(r=>r.id===id);
        if(!previous&&rows.length>=10000)throw new InputError("A campaign supports up to 10,000 dated rows.");
        const row={id,date:v.date,platform:v.platform,...(v.adId?{adId:v.adId}:{}),...(v.adName?{adName:v.adName}:{}),source:"Manual entry" as const,importedAt:at,
          spend:v.spend,impressions:v.impressions,reach:v.reach,clicks:v.clicks,leads:v.leads,conversions:v.conversions,revenue:v.revenue};
        campaign.performanceRows=[...rows.filter(r=>r.id!==id),row];
        recordAudit(data,{actor:"human",actorId:user.userId,entity:"campaign",entityId:campaign.id,clientId:campaign.clientId,action:previous?"Updated campaign results":"Entered campaign results",after:`${v.platform} · ${v.date}${v.adId?` · ad ${v.adId}`:""}`,outcome:"Saved",detail:campaign.name});
      }
      campaign.updatedAt=at;
      return data;
    });
    return reply({revision:result.revision});
  }catch(error){
    if(error instanceof InputError)return reply({error:error.message},error.status);
    return dbError(error);
  }
}
