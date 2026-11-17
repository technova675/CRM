import {sameOrigin} from "@/lib/auth/server";
import {dbError} from "@/lib/db";
import {boundedJSON} from "@/lib/outreachServer";
import {mutateMedia} from "@/lib/mediaServer";
import {portalContext,ensurePortalMember,PortalError} from "@/lib/clientPortalServer";
import {hiddenPortalPanels} from "@/lib/accessServer";
import {ReviewError,reviewResponse,reviewResponseInput} from "@/lib/domain/creativeReviews";

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(e:unknown)=>e instanceof ReviewError||e instanceof PortalError?reply({error:e.message},e.status):dbError(e);
export async function GET(req:Request){
  try{
    const {account,data,owner,userId}=await portalContext(req);
    if((await hiddenPortalPanels(owner,userId)).has("creatives"))return reply({reviews:[]});
    return reply({reviews:(data.creativeReviews??[]).filter(r=>r.clientId===account.clientId&&r.audience==="Client"&&!r.archived).map(({id,format,audience,revisions})=>({id,format,audience,revisions}))});
  }catch(error){return fail(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const {owner,userId,email}=await portalContext(req);
    if((await hiddenPortalPanels(owner,userId)).has("creatives"))return reply({error:"This section is not available for your account."},403);
    const parsed=reviewResponseInput.safeParse(await boundedJSON(req,5000).catch(()=>null));
    if(!parsed.success)return reply({error:"Enter a comment or a decision."},400);
    const r=parsed.data;
    await mutateMedia(owner,crypto.randomUUID(),data=>{
      const {clientId}=ensurePortalMember(data,userId,email);
      reviewResponse(data,r.id,r.version,"Client",r.text,r.decision,clientId);
      return data;
    });
    return reply({ok:true});
  }catch(error){return fail(error);}
}
