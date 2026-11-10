import {createPrivateKey} from "node:crypto";
import {z} from "zod";
import {WorkspaceAccessError} from "@/lib/auth/identity";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {recordAudit} from "@/lib/auditServer";
import {dbError} from "@/lib/db";
import {mutateMedia} from "@/lib/mediaServer";
import {boundedJSON,ownedLibrary} from "@/lib/outreachServer";
import {ensureTenant} from "@/lib/tenantServer";
import {canManageWorkspace} from "@/lib/workspaceKeys";
import {sealCredential,vaultConfigured,VAULT_SLOTS} from "@/lib/workspaceVault";

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("save"),slot:z.enum(VAULT_SLOTS),secret:z.string().trim().min(1).max(12000)}),
  z.object({action:z.literal("remove"),slot:z.enum(VAULT_SLOTS)}),
]);
const google=z.object({client_email:z.email(),private_key:z.string()});

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),data=await ownedLibrary(user.userId);
    if(data&&!canManageWorkspace(data,user.userId))return reply({error:"Workspace owner access is required."},403);
    return reply({configured:vaultConfigured(),entries:VAULT_SLOTS.flatMap(slot=>{
      const entry=data?.credentialVault?.[slot];
      return entry?[{slot,updatedAt:entry.updatedAt}]:[];
    })});
  }catch(error){return dbError(error);}
}

export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=input.safeParse(await boundedJSON(req,26000).catch(()=>null));
    if(!parsed.success)return reply({error:"Select a connector and enter a valid credential."},400);
    const action=parsed.data,slot=action.slot;
    let secret:string|undefined;
    if(action.action==="save"){
      if(!vaultConfigured())return reply({error:"Configure WORKSPACE_VAULT_KEY on the server first."},503);
      if(slot==="media"){
        if(!/^[!-~]+$/.test(action.secret))return reply({error:"Enter a bearer token without spaces or line breaks."},400);
        secret=action.secret;
      }else{
        try{
          const account=google.parse(JSON.parse(action.secret));
          if(createPrivateKey(account.private_key).asymmetricKeyType!=="rsa")throw new Error();
          secret=JSON.stringify(account);
        }catch{return reply({error:"Upload Google service-account JSON containing a valid RSA private key."},400);}
      }
    }
    const data=await ensureTenant(user.userId,user.email);
    if(!canManageWorkspace(data,user.userId))return reply({error:"Workspace owner access is required."},403);
    const sealed=secret===undefined?undefined:sealCredential(user.userId,slot,secret);
    await mutateMedia(user.userId,crypto.randomUUID(),next=>{
      if(!canManageWorkspace(next,user.userId))throw new WorkspaceAccessError();
      const entries=next.credentialVault??={};
      const had=!!entries[slot];
      if(sealed)entries[slot]=sealed;
      else if(had)delete entries[slot];
      else return next;
      recordAudit(next,{actor:"human",actorId:user.userId,entity:"settings",entityId:slot,
        action:sealed?(had?"Replaced vault credential":"Stored vault credential"):"Removed vault credential",
        detail:slot,outcome:"Saved"});
      return next;
    });
    return reply({ok:true});
  }catch(error){return dbError(error);}
}
