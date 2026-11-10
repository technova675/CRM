import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {resilientFetch} from "./auth/resilientFetch";
import {sessionIdentity} from "./auth/server";
import {WorkspaceAccessError} from "./auth/identity";
import {ownedLibrary} from "./outreachServer";
import {mutateMedia} from "./mediaServer";
import {recordAudit} from "./auditServer";
import {isStaffRole,type STAFF_ROLES} from "./domain/staffRoles";
import type {CRMLibrary} from "./domain/crmLibrary";

export class StaffError extends Error{
  constructor(message:string,readonly status=400){super(message);}
}
const digest=(token:string)=>createHash("sha256").update(token).digest();
function activeOwner(data:CRMLibrary,owner:string){
  return data.team.some(member=>member.id===owner&&member.role==="admin"&&(member.status??"active")==="active"&&!member.staffAuthId);
}
export function staffMember(data:CRMLibrary,owner:string,actor:string){
  return activeOwner(data,owner)?data.team.find(member=>member.staffAuthId===actor&&member.status==="active"&&isStaffRole(member.role)):undefined;
}
export async function requireStaff(req:Request){
  const user=await sessionIdentity(req);
  if(!user.staffOwner||user.portalOwner)throw new WorkspaceAccessError();
  const data=await ownedLibrary(user.staffOwner);
  const member=data&&staffMember(data,user.staffOwner,user.userId);
  if(!data||!member)throw new WorkspaceAccessError("Your staff access is inactive. Contact the workspace owner.");
  return {data,owner:user.staffOwner,actor:user.userId,member};
}
type Role=typeof STAFF_ROLES[number];

export async function inviteStaff(owner:string,input:{name:string;email:string;role:Role}){
  const token=randomBytes(32).toString("base64url");
  const expiresAt=new Date(Date.now()+48*3600000).toISOString();
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    if(!activeOwner(data,owner))throw new WorkspaceAccessError();
    let member=data.team.find(item=>item.email.trim().toLowerCase()===input.email);
    if(member&&(member.staffAuthId||!isStaffRole(member.role)))
      throw new StaffError("That profile is already linked or ineligible for a new invitation.",409);
    if(!member){
      member={id:crypto.randomUUID(),name:input.name,email:input.email,role:input.role,avatarColor:"#6846d6",status:"invited"};
      data.team.push(member);
    }else Object.assign(member,{name:input.name,email:input.email,role:input.role,status:"invited"});
    data.staffInvites=[...(data.staffInvites??[]).filter(item=>item.memberId!==member.id),{memberId:member.id,hash:digest(token).toString("hex"),expiresAt}];
    recordAudit(data,{actor:"human",actorId:owner,entity:"organization",entityId:member.id,action:"Created staff invitation",detail:member.name,after:member.role,outcome:"Invitation ready"});
    return data;
  });
  return {token,expiresAt};
}

export async function manageStaff(owner:string,id:string,action:"revoke"|"restore"|"role",role?:Role){
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    if(!activeOwner(data,owner))throw new WorkspaceAccessError();
    const member=data.team.find(item=>item.id===id&&isStaffRole(item.role));
    if(!member||!member.staffAuthId&&!data.staffInvites?.some(item=>item.memberId===id))
      throw new StaffError("Linked staff profile or invitation not found.",404);
    const before=member.role+" · "+member.status;
    if(action==="role"&&role)member.role=role;
    if(action==="revoke"){
      member.status="disabled";
      data.staffInvites=(data.staffInvites??[]).filter(item=>item.memberId!==id);
    }
    if(action==="restore"){
      if(!member.staffAuthId)throw new StaffError("Create a new invitation for this teammate.");
      member.status="active";
    }
    recordAudit(data,{actor:"human",actorId:owner,entity:"organization",entityId:member.id,
      action:action==="role"?"Changed staff role":action==="restore"?"Restored staff access":"Revoked staff access",detail:member.name,before,after:member.role+" · "+member.status,outcome:"Saved"});
    return data;
  });
}

function matchInvite(data:CRMLibrary|undefined,owner:string,token:string){
  if(!data||!activeOwner(data,owner))return;
  const candidate=digest(token);
  const invite=data.staffInvites?.find(item=>{
    const hash=Buffer.from(item.hash,"hex");
    return hash.length===candidate.length&&timingSafeEqual(candidate,hash)&&Date.parse(item.expiresAt)>Date.now();
  });
  const member=data.team.find(item=>item.id===invite?.memberId&&!item.staffAuthId&&item.status==="invited"&&isStaffRole(item.role));
  if(invite&&member)return {invite,member};
}

export async function redeemStaffInvite(owner:string,token:string,password:string){
  const saved=await ownedLibrary(owner),entry=matchInvite(saved,owner,token);
  if(!entry)throw new StaffError("This invitation is invalid, expired, or already used.",404);
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw new StaffError("Staff provisioning is unavailable.",503);
  const admin=createClient(url,key,{global:{fetch:resilientFetch},auth:{persistSession:false,autoRefreshToken:false}});
  const result=await admin.auth.admin.createUser({email:entry.member.email,password,email_confirm:true,app_metadata:{adbibe_staff_owner:owner}});
  const actor=result.data.user?.id;
  if(!actor){
    if(result.error?.status===422||result.error?.code==="email_exists")throw new StaffError("This email already has a login. Ask the owner for an invitation to a separate work email.",409);
    throw new StaffError("Could not create the staff sign-in. Try again.",503);
  }
  try{
    await mutateMedia(owner,crypto.randomUUID(),data=>{
      const current=matchInvite(data,owner,token);
      if(!current||current.member.id!==entry.member.id||current.member.email!==entry.member.email)
        throw new StaffError("This invitation changed. Request a fresh link.",409);
      current.member.staffAuthId=actor;
      current.member.status="active";
      data.staffInvites=(data.staffInvites??[]).filter(item=>item.memberId!==current.member.id);
      recordAudit(data,{actor:"human",actorId:current.member.id,entity:"organization",entityId:current.member.id,action:"Accepted staff invitation",detail:current.member.name,before:"Invited",after:"Active",outcome:"Staff sign-in linked"});
      return data;
    });
  }catch(error){
    const attached=await ownedLibrary(owner).then(data=>data?.team.some(member=>member.staffAuthId===actor)??false).catch(()=>undefined);
    if(attached===false)await admin.auth.admin.deleteUser(actor).catch(()=>{});
    if(!attached)throw error;
  }
  return {email:entry.member.email};
}
