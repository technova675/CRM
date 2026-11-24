import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {knowledgeAccess} from "@/lib/domain/clientKnowledge";
import {recordAudit} from "@/lib/auditServer";
import {mutateMedia} from "@/lib/mediaServer";
import {publicLink,tokenIssue,PROVIDER_NAMES} from "@/lib/domain/calendar";
import {CalendarError,calendlyOAuthReady,disconnect,getLink,googleReady,storeConnection,tokensReady,verifyCalcom,verifyCalendly} from "@/lib/calendarServer";

const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
async function allowed(userId:string){const lib=await ownedLibrary(userId);return !lib||knowledgeAccess(lib,userId,"meetings");}

/** The signed-in login's calendar connection (never its credential) and which providers can be used. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req);
    if(!(await allowed(user.userId)))return reply({error:"Meetings access is required."},403);
    return reply({link:publicLink(await getLink(user.userId)),providers:{google:googleReady(),calendly:tokensReady(),calendlyOAuth:calendlyOAuthReady(),calcom:tokensReady()}});
  }catch(error){return dbError(error);}
}

const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("connect"),provider:z.enum(["calendly","calcom"]),token:z.string().max(2000)}),
  z.object({action:z.literal("disconnect")}),
]);
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,4000).catch(()=>null));
    if(!parsed.success)return reply({error:"Invalid request."},400);
    if(!(await allowed(user.userId)))return reply({error:"Meetings access is required."},403);
    const audit=(action:string,after:string)=>mutateMedia(user.userId,crypto.randomUUID(),data=>{recordAudit(data,{actor:"human",actorId:user.userId,entity:"integration",action,after,outcome:"Saved"});return data;}).catch(()=>undefined);
    if(parsed.data.action==="disconnect"){
      const link=await getLink(user.userId);await disconnect(user.userId);
      if(link)await audit("Disconnected calendar",`${PROVIDER_NAMES[link.provider]} · ${link.account}`);
      return reply({ok:true});
    }
    const {provider,token}=parsed.data,t=token.trim();
    if(!tokensReady())return reply({error:"Calendar connections need WORKSPACE_VAULT_KEY on the server to store keys safely."},503);
    const issue=tokenIssue(provider,t);if(issue)return reply({error:issue},400);
    if(await getLink(user.userId))return reply({error:"This login already has a calendar connected. Disconnect it first; each login can connect one calendar."},409);
    if(provider==="calendly"){const v=await verifyCalendly(t);await storeConnection(user.userId,"calendly",v.account,{provider:"calendly",token:t,userUri:v.userUri},crypto.randomUUID());await audit("Connected calendar",`Calendly · ${v.account}`);}
    else{const v=await verifyCalcom(t);await storeConnection(user.userId,"calcom",v.account,{provider:"calcom",key:t},crypto.randomUUID());await audit("Connected calendar",`Cal.com · ${v.account}`);}
    return reply({ok:true,link:publicLink(await getLink(user.userId))});
  }catch(error){
    if(error instanceof CalendarError)return reply({error:error.message},error.status);
    return dbError(error);
  }
}
