import { z } from "zod";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { dbError } from "@/lib/db";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { mutateMedia } from "@/lib/mediaServer";
import { portalContact, portalState, shareKinds } from "@/lib/domain/clientPortal";
import { createPortalLogin, portalAdminView, portalUploads, sharePortalUpload, PortalError, requirePortalAdmin, setPortalShare, writePortalMessage } from "@/lib/clientPortalServer";

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error:unknown)=>error instanceof PortalError ? reply({error:error.message},error.status) : dbError(error);
const base=z.object({clientId:z.string().min(1).max(180)});
const action=z.discriminatedUnion("action",[
  base.extend({action:z.literal("create"),email:z.string().trim().toLowerCase().email().max(254)}),
  base.extend({action:z.literal("access"),userId:z.string().uuid(),active:z.boolean()}),
  base.extend({action:z.literal("share"),kind:z.enum(shareKinds),id:z.string().min(1).max(5000),enabled:z.boolean(),version:z.number().int().optional()}),
  base.extend({action:z.literal("message"),id:z.string().uuid(),text:z.string().trim().min(1).max(2000)}),
]);

export async function GET(req:Request) {
  try {
    const {userId}=await reportIdentity(req);
    const data=await ownedLibrary(userId);
    requirePortalAdmin(data,userId);
    const clientId=new URL(req.url).searchParams.get("client");
    if (!clientId) return reply({error:"Choose a client."},400);
    const view=portalAdminView(data,clientId);
    const files=await portalUploads(data,userId,clientId,false);
    return reply({...view,choices:[...view.choices,...files.map(f=>({kind:"upload",id:f.id,title:f.name,shared:f.shared}))]});
  } catch(error) {return fail(error);}
}
export async function POST(req:Request) {
  if (!sameOrigin(req)) return reply({error:"Request origin is not allowed."},403);
  try {
    const {userId}=await reportIdentity(req);
    const parsed=action.safeParse(await boundedJSON(req,16000).catch(()=>null));
    if (!parsed.success) return reply({error:"Check the client and action details."},400);
    const input=parsed.data;
    if(input.action==="create") return reply(await createPortalLogin(userId,input.clientId,input.email),201);
    if(input.action==="share"&&input.kind==="upload"){await sharePortalUpload(userId,input.clientId,input.id,input.enabled);return reply({ok:true});}
    await mutateMedia(userId,input.action==="message"?input.id:crypto.randomUUID(),data=>{
      requirePortalAdmin(data,userId);
      if(input.action==="share") setPortalShare(data,input.clientId,input.kind,input.id,input.enabled,input.version);
      if(input.action==="message") writePortalMessage(data,input.clientId,"Agency",input.id,input.text);
      if(input.action==="access") {
        const account=portalState(data).accounts.find(a=>a.clientId===input.clientId&&a.userId===input.userId);
        if(!account) throw new PortalError("Client login not found.",404);
        if(input.active&&!portalContact(data,input.clientId,account.email)) throw new PortalError("Restore the client contact before restoring login access.");
        account.active=input.active;
      }
      return data;
    });
    return reply({ok:true});
  } catch(error) {return fail(error);}
}
