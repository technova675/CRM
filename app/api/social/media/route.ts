import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {mediaStorageReady,uploadTarget} from "@/lib/social/media";
import {AccessError,socialAccess} from "@/lib/social/access";

const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});

/** A 15-minute upload link for one image or video; the browser sends the file straight to the media bucket. */
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req);
    const parsed=z.object({clientId:z.string().min(1).max(150),contentType:z.string().max(100),size:z.number().int().positive()}).safeParse(await boundedJSON(req,2000).catch(()=>null));
    if(!parsed.success)return reply({error:"Choose a file."},400);
    await socialAccess(user.userId,parsed.data.clientId);
    if(!mediaStorageReady())return reply({error:"Media storage is not set up yet. Add the media bucket settings on the server, or paste public file links instead."},503);
    try{return reply(uploadTarget(user.userId,parsed.data.clientId,parsed.data.contentType,parsed.data.size));}
    catch(e){return reply({error:e instanceof Error?e.message:"This file cannot be uploaded."},400);}
  }catch(error){return error instanceof AccessError?reply({error:error.message},error.status):dbError(error);}
}
