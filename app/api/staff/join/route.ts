import {z} from "zod";
import {sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {redeemStaffInvite,StaffError} from "@/lib/staffServer";
import {dbError} from "@/lib/db";

const schema=z.object({workspace:z.string().uuid(),token:z.string().regex(/^[\w-]{43}$/),password:z.string().min(12).max(128)});
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  try{
    const parsed=schema.safeParse(await boundedJSON(req,4096).catch(()=>null));
    if(!parsed.success)return reply({error:"Use a valid invitation and a password of at least 12 characters."},400);
    const {workspace,token,password}=parsed.data;
    return reply(await redeemStaffInvite(workspace,token,password),201);
  }catch(error){return error instanceof StaffError?reply({error:error.message},error.status):dbError(error);}
}
