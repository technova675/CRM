import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {mutateMedia} from "@/lib/mediaServer";
import {recordAudit} from "@/lib/auditServer";
import {socialPlatforms} from "@/lib/domain/socialWorkspace";
import {PROVIDERS,PROVIDER_NAME,PROVIDER_OF,SocialAuthError,missingKeys,providerReady,revoke} from "@/lib/social/oauth";
import {chooseMetaPage,connectionsFor,openConnection,removeConnection} from "@/lib/social/connections";
import {mediaStorageMissing,mediaStorageReady} from "@/lib/social/media";
import {AccessError,socialAccess} from "@/lib/social/access";

const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});

/** A client's connected accounts (never their tokens), and which networks this server has app keys for. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),clientId=new URL(req.url).searchParams.get("clientId")??"",library=await socialAccess(user.userId,clientId,false);
    return reply({connections:connectionsFor(library,clientId),pendingPages:library.socialPending?.[clientId]?.pages??null,
      providers:Object.fromEntries(PROVIDERS.map(p=>[p,{ready:providerReady(p),missing:missingKeys(p),name:PROVIDER_NAME[p]}])),
      media:{ready:mediaStorageReady(),missing:mediaStorageMissing()}});
  }catch(error){return error instanceof AccessError?reply({error:error.message},error.status):dbError(error);}
}

const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("disconnect"),clientId:z.string().min(1).max(150),platform:z.enum(socialPlatforms)}),
  z.object({action:z.literal("choose-page"),clientId:z.string().min(1).max(150),pageId:z.string().regex(/^\d{1,30}$/)}),
]);
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,4000).catch(()=>null));
    if(!parsed.success)return reply({error:"Invalid request."},400);
    const v=parsed.data;await socialAccess(user.userId,v.clientId);
    const audit=(action:string,after:string)=>mutateMedia(user.userId,crypto.randomUUID(),data=>{recordAudit(data,{actor:"human",actorId:user.userId,entity:"integration",clientId:v.clientId,action,after,outcome:"Saved"});return data;}).catch(()=>undefined);
    if(v.action==="choose-page"){
      const items=await chooseMetaPage(user.userId,v.clientId,v.pageId,user.userId);
      await audit("Connected Facebook & Instagram",items.map(i=>`${i.platform}: ${i.accountName}`).join(" · "));
      return reply({ok:true});
    }
    const removed=await removeConnection(user.userId,v.clientId,v.platform);
    if(removed){
      // Revoke at the network as well. Meta Page tokens are shared by Facebook and Instagram, so they are only forgotten here.
      try{const s=openConnection(user.userId,removed),p=PROVIDER_OF[v.platform];if(p!=="meta")await revoke(p,s.refreshToken??s.token);}catch{/* already disconnected locally */}
      await audit(`Disconnected ${v.platform}`,removed.accountName);
    }
    return reply({ok:true});
  }catch(error){
    if(error instanceof AccessError)return reply({error:error.message},error.status);
    if(error instanceof SocialAuthError)return reply({error:error.message},400);
    return dbError(error);
  }
}
