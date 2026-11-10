import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {ensureTenant} from "@/lib/tenantServer";
import {dbError} from "@/lib/db";
import {inviteStaff,manageStaff,StaffError} from "@/lib/staffServer";
import {STAFF_ROLES,isStaffRole} from "@/lib/domain/staffRoles";

const role=z.enum(STAFF_ROLES),id=z.string().min(1).max(150);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("invite"),name:z.string().trim().min(1).max(100),email:z.string().trim().toLowerCase().email().max(254),role}),
  z.object({action:z.literal("role"),id,role}),
  z.object({action:z.enum(["revoke","restore"]),id}),
]);
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),data=await ensureTenant(user.userId,user.email);
    if(!data.team.some(member=>member.id===user.userId&&member.role==="admin"&&(member.status??"active")==="active"))return reply({error:"Workspace owner access is required."},403);
    const invites=new Map((data.staffInvites??[]).map(invite=>[invite.memberId,invite.expiresAt]));
    return reply({members:data.team.filter(member=>isStaffRole(member.role)&&(member.staffAuthId||invites.has(member.id))).map(member=>({
      id:member.id,name:member.name,email:member.email,role:member.role,status:member.staffAuthId?member.status:"invited",expiresAt:invites.get(member.id),
    }))});
  }catch(error){return dbError(error);}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const user=await reportIdentity(req),parsed=schema.safeParse(await boundedJSON(req,4096).catch(()=>null));
    if(!parsed.success)return reply({error:"Check the staff invitation details."},400);
    await ensureTenant(user.userId,user.email);
    const input=parsed.data;
    if(input.action==="invite"){
      if(input.email===user.email.toLowerCase())return reply({error:"The owner already has access."},409);
      const invitation=await inviteStaff(user.userId,input);
      return reply({path:"/staff/join#"+new URLSearchParams({workspace:user.userId,token:invitation.token}),expiresAt:invitation.expiresAt},201);
    }
    await manageStaff(user.userId,input.id,input.action,input.action==="role"?input.role:undefined);
    return reply({ok:true});
  }catch(error){return error instanceof StaffError?reply({error:error.message},error.status):dbError(error);}
}
