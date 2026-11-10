import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {ensureTenant} from "@/lib/tenantServer";
import {canManageWorkspace,createWorkspaceKey,revokeWorkspaceKey} from "@/lib/workspaceKeys";
import {dbError} from "@/lib/db";
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),name:z.string().trim().min(1).max(100)}),
  z.object({action:z.literal("revoke"),id:z.string().uuid()}),
]);
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),data=await ownedLibrary(user.userId);
    if(data&&!canManageWorkspace(data,user.userId))return reply({error:"Workspace owner access is required."},403);
    return reply({keys:(data?.workspaceApiKeys??[]).map(({id,name,prefix,createdAt,revokedAt})=>({id,name,prefix,createdAt,revokedAt}))});
  }catch(error){return dbError(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,4096).catch(()=>null));
    if(!parsed.success)return reply({error:"Enter a name or select an API key."},400);
    const data=await ensureTenant(user.userId,user.email);
    if(!canManageWorkspace(data,user.userId))return reply({error:"Workspace owner access is required."},403);
    if(parsed.data.action==="create")return reply(await createWorkspaceKey(user.userId,parsed.data.name),201);
    await revokeWorkspaceKey(user.userId,parsed.data.id);
    return reply({ok:true});
  }catch(error){return dbError(error);}
}
