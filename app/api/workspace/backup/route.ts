import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {canManageWorkspace} from "@/lib/workspaceKeys";
import {dbError,supabaseRequest} from "@/lib/db";
import {recordAudit,trimAudit} from "@/lib/auditServer";
import {checkTenantQuota} from "@/lib/domain/tenant";
import type {CRMLibrary} from "@/lib/domain/crmLibrary";
import {tenantPlan} from "@/lib/tenantPlan";
import {backupMac,createBackup,prepareRestore,readBackup,validMac} from "@/lib/workspaceBackup";
import {vaultConfigured} from "@/lib/workspaceVault";

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const restoreInput=z.discriminatedUnion("action",[
  z.object({action:z.literal("preview"),backup:z.unknown()}),
  z.object({action:z.literal("restore"),backup:z.unknown(),confirmation:z.literal("RESTORE"),ticket:z.object({
    revision:z.number().int().nonnegative(),expiresAt:z.number().int(),operation:z.uuid(),mac:z.string().length(64),
  })}),
]);

async function workspaceRow(owner:string){
  const [row]=await supabaseRequest<{revision:number;data:CRMLibrary;last_operation:string}[]>("crm_libraries",{query:{
    owner_id:`eq.${owner}`,select:"revision,data,last_operation",limit:"1",
  }});
  return row;
}

export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),row=await workspaceRow(user.userId);
    if(!row)return reply({error:"No saved workspace data to export."},404);
    if(!canManageWorkspace(row.data,user.userId))return reply({error:"Workspace owner access is required."},403);
    if(!vaultConfigured())return reply({error:"Configure WORKSPACE_VAULT_KEY to sign workspace backups."},503);
    return Response.json(createBackup(user.userId,user.workspace,row.data),{headers:{
      "Cache-Control":"private, no-store","Content-Disposition":'attachment; filename="adbibe-workspace-backup.json"',"X-Content-Type-Options":"nosniff",
    }});
  }catch(error){return dbError(error);}
}

export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),row=await workspaceRow(user.userId);
    if(!row||!canManageWorkspace(row.data,user.userId))return reply({error:"Workspace owner access is required."},403);
    if(!vaultConfigured())return reply({error:"Configure WORKSPACE_VAULT_KEY to verify workspace backups."},503);
    const parsed=restoreInput.safeParse(await boundedJSON(req,8_010_000).catch(()=>null));
    if(!parsed.success)return reply({error:"Choose a valid JSON workspace backup of up to 8 MB."},400);
    const input=parsed.data,backup=readBackup(user.userId,user.workspace,input.backup);
    if(!backup)return reply({error:"This file is unsigned, was modified, or belongs to another organization. Choose an unmodified signed backup from this workspace."},400);
    if(input.action==="restore"){
      const {mac,...binding}=input.ticket;
      if(!validMac(mac,backupMac(user.userId,"preview",{...binding,backup:backup.signature})))return reply({error:"Run a new restore preview."},409);
      if(row.last_operation===binding.operation)return reply({restored:true,revision:row.revision});
      if(binding.expiresAt<Date.now()||binding.revision!==row.revision)return reply({error:"The preview expired or workspace data changed. Preview the backup again."},409);
    }
    const {next,preview}=prepareRestore(row.data,backup.data);
    checkTenantQuota(row.data,next,tenantPlan(user.userId,row.data));
    if(input.action==="preview"){
      const binding={revision:row.revision,expiresAt:Date.now()+10*60_000,operation:crypto.randomUUID()};
      return reply({createdAt:backup.createdAt,...preview,ticket:{...binding,mac:backupMac(user.userId,"preview",{...binding,backup:backup.signature})}});
    }
    if(!preview.counts.length)return reply({error:"The backup has no changes to restore."},400);
    const changes=preview.counts.map(({label,added,updated,removed})=>label+" +"+added+" ~"+updated+" −"+removed).join(", ");
    recordAudit(next,{actor:"human",actorId:user.userId,entity:"settings",entityId:"workspace-backup",
      action:"Restored workspace backup",detail:"Snapshot from "+backup.createdAt,
      before:"Workspace revision "+row.revision,after:changes,outcome:"Restored"});
    trimAudit(next);
    if(Buffer.byteLength(JSON.stringify(next))>8_000_000)return reply({error:"The restored workspace would exceed the 8 MB library limit."},413);
    const revision=await supabaseRequest<number>("rpc/save_crm_library",{method:"POST",body:{
      p_owner:user.userId,p_revision:row.revision,p_operation:input.ticket.operation,p_data:next,
    }});
    if(revision<0)return reply({error:"Workspace data changed. Preview the backup again."},409);
    return reply({restored:true,revision});
  }catch(error){return dbError(error);}
}
