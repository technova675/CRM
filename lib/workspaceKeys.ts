import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {recordAudit} from "./auditServer";
import {mutateMedia} from "./mediaServer";
import {ownedLibrary} from "./outreachServer";
import {WorkspaceAccessError} from "./auth/identity";
import type {CRMLibrary} from "./domain/crmLibrary";

export const canManageWorkspace=(data:CRMLibrary,owner:string)=>data.team.some(member=>member.id===owner&&member.role==="admin"&&!member.staffAuthId&&(member.status??"active")==="active");
const digest=(value:string)=>createHash("sha256").update(value).digest();
export async function createWorkspaceKey(owner:string,name:string){
  const secret="adb_"+owner+"."+randomBytes(32).toString("base64url");
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),prefix="adb_…"+secret.slice(-6);
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    if(!canManageWorkspace(data,owner))throw new WorkspaceAccessError();
    const keys=data.workspaceApiKeys??[];
    if(keys.filter(key=>!key.revokedAt).length>=10)throw new WorkspaceAccessError("Revoke a key before creating another.");
    data.workspaceApiKeys=[{id,name,prefix,hash:digest(secret).toString("hex"),createdAt},...keys.filter(key=>!key.revokedAt),...keys.filter(key=>key.revokedAt).slice(0,90)];
    recordAudit(data,{actor:"human",actorId:owner,entity:"settings",entityId:id,action:"Created workspace API key",detail:name,after:"workspace summary read access",outcome:"Active"});
    return data;
  });
  return {id,secret};
}

export async function revokeWorkspaceKey(owner:string,id:string){
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    if(!canManageWorkspace(data,owner))throw new WorkspaceAccessError();
    const key=data.workspaceApiKeys?.find(item=>item.id===id);
    if(!key)throw new WorkspaceAccessError("API key not found.");
    if(key.revokedAt)return data;
    key.revokedAt=new Date().toISOString();
    recordAudit(data,{actor:"human",actorId:owner,entity:"settings",entityId:id,action:"Revoked workspace API key",detail:key.name,before:"Active",after:"Revoked",outcome:"Saved"});
    return data;
  });
}
export async function readWorkspaceKey(header:string|null){
  const match=/^Bearer (adb_([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})\.[\w-]{43})$/i.exec(header??"");
  if(!match)return;
  const owner=match[2];
  const data=await ownedLibrary(owner);
  if(!data||!canManageWorkspace(data,owner))return;
  const hashed=digest(match[1]);
  const key=data.workspaceApiKeys?.find(item=>{
    const value=Buffer.from(item.hash,"hex");
    return !item.revokedAt&&value.length===hashed.length&&timingSafeEqual(value,hashed);
  });
  if(key)return {data,owner};
}
