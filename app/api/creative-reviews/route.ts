import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {can} from "@/lib/permissions";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {addReviewRevision,reviewFormats,revisionInput,reviewResponse,reviewResponseInput,ReviewError} from "@/lib/domain/creativeReviews";
import type {CRMLibrary} from "@/lib/domain/crmLibrary";

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const failure=(error:unknown)=>error instanceof ReviewError?reply({error:error.message},error.status):dbError(error);
const request=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),id:z.string().uuid(),clientId:z.string().max(180),format:z.enum(reviewFormats),audience:z.enum(["Team","Client"]),content:revisionInput}),
  z.object({action:z.literal("revise"),id:z.string().uuid(),expected:z.number().int(),content:revisionInput}),
  z.object({action:z.literal("respond"),response:reviewResponseInput}),
  z.object({action:z.literal("archive"),id:z.string().uuid(),expected:z.number().int()}),
]);
function access(data:CRMLibrary|undefined,id:string,write=false):asserts data is CRMLibrary{
  if(!data?.team.some(m=>m.id===id&&m.role!=="client"&&m.status==="active"&&can(m.role,"creative",write?"write":"read")))throw new ReviewError("Creative workspace access is required.",403);
}
export async function GET(req:Request){
  try{const {userId}=await reportIdentity(req);const data=await ownedLibrary(userId);access(data,userId);return reply({reviews:data.creativeReviews??[]});}
  catch(error){return failure(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const {userId}=await reportIdentity(req);
    const parsed=request.safeParse(await boundedJSON(req,14000).catch(()=>null));
    if(!parsed.success)return reply({error:"Check the title, HTTPS preview link, copy and review fields."},400);
    const input=parsed.data;
    await mutateMedia(userId,crypto.randomUUID(),data=>{
      access(data,userId,true);
      const items=data.creativeReviews??=[];
      if(input.action==="create"){
        if(items.some(r=>r.id===input.id))return data;
        if(!data.clients.some(c=>c.id===input.clientId))throw new ReviewError("Choose a client from this account.");
        if(items.length>=250)throw new ReviewError("This account has reached its review limit.");
        items.unshift({id:input.id,clientId:input.clientId,format:input.format,audience:input.audience,
          revisions:[{...input.content,version:1,at:new Date().toISOString(),comments:[]}]});
      }else if(input.action==="respond"){
        const r=input.response;reviewResponse(data,r.id,r.version,"Team",r.text,r.decision);
      }else{
        const item=items.find(r=>r.id===input.id);
        if(!item)throw new ReviewError("Review not found.",404);
        if(input.action==="revise")addReviewRevision(item,input.content,input.expected);
        else{
          if(item.revisions.at(-1)?.version!==input.expected)throw new ReviewError("Reload this review before archiving.",409);
          item.archived=true;
        }
      }
      return data;
    });
    return reply({ok:true});
  }catch(error){return failure(error);}
}
