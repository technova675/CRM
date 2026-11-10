import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {ensureTenant,reserveTenantUsage} from "@/lib/tenantServer";
import {tenantPlan} from "@/lib/tenantPlan";
import {PLAN_LIMITS,tenantPeriod,tenantUsage} from "@/lib/domain/tenant";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {emptyCRMLibrary} from "@/lib/domain/crmLibrary";
import {mutateMedia} from "@/lib/mediaServer";
import {dbError} from "@/lib/db";
import {recordAudit} from "@/lib/auditServer";

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("profile"),name:z.string().trim().min(1).max(100),billingEmail:z.string().trim().email().max(254)}),
  z.object({action:z.literal("videoDraft"),minutes:z.number().int().min(1).max(180)}),
]);

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),saved=await ownedLibrary(user.userId);
    const data=saved??emptyCRMLibrary({id:user.userId,email:user.email}),plan=tenantPlan(user.userId,saved);
    if(!knowledgeAccess(data,user.userId,"settings"))return reply({error:"Organization settings access is required."},403);
    const profile=data.tenantProfile??{name:user.email.split("@")[0]||"My workspace",billingEmail:user.email};
    return reply({id:user.workspace,name:profile.name,billingEmail:profile.billingEmail||user.email,plan,limits:PLAN_LIMITS[plan],usage:tenantUsage(data),period:tenantPeriod()});
  }catch(error){return dbError(error);}
}

export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=schema.safeParse(await boundedJSON(req,4000).catch(()=>null));
    if(!parsed.success)return reply({error:"Check the workspace profile or draft duration."},400);
    const input=parsed.data,data=await ensureTenant(user.userId,user.email);
    if(input.action==="videoDraft"){
      if(!knowledgeAccess(data,user.userId,"video",true))return reply({error:"Video write access is required."},403);
      await reserveTenantUsage(user.userId,"videoMinutes",input.minutes,user.email);
      return reply({ok:true});
    }
    if(data.team.find(member=>member.id===user.userId)?.role!=="admin"||!knowledgeAccess(data,user.userId,"settings",true))
      return reply({error:"Only an active workspace admin can edit the profile."},403);
    await mutateMedia(user.userId,crypto.randomUUID(),current=>{
      const previous=current.tenantProfile;
      current.tenantProfile={name:input.name,billingEmail:input.billingEmail,createdAt:previous?.createdAt??new Date().toISOString(),basePlan:previous?.basePlan??"Agency"};
      recordAudit(current,{actor:"human",actorId:user.userId,entity:"organization",action:"Updated organization profile",before:previous?.name,after:input.name,outcome:"Saved"});
      return current;
    });
    return reply({ok:true});
  }catch(error){return dbError(error);}
}
