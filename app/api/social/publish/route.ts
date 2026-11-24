import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {NotReady,publishPost} from "@/lib/social/publish";
import {PublishError} from "@/lib/social/publishers";
import {AccessError,socialAccess} from "@/lib/social/access";

export const maxDuration=300;
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});

/** Publishes an approved post now, through the network's official API. */
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=z.object({postId:z.string().min(1).max(150)}).safeParse(await boundedJSON(req,2000).catch(()=>null));
    if(!parsed.success)return reply({error:"Choose a post."},400);
    await socialAccess(user.userId);
    const r=await publishPost(user.userId,parsed.data.postId,{id:user.userId,kind:"human"});
    return reply({ok:true,url:r.url});
  }catch(error){
    if(error instanceof AccessError)return reply({error:error.message},error.status);
    if(error instanceof NotReady)return reply({error:error.message},409);
    if(error instanceof PublishError)return reply({error:error.message,uncertain:!error.definite},502);
    return dbError(error);
  }
}
