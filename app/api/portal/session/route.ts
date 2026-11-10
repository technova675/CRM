import { z } from "zod";
import { authClient, sameOrigin } from "@/lib/auth/server";
import { portalOwner } from "@/lib/auth/portalIdentity";
import { dbError } from "@/lib/db";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { ensurePortalMember, portalContext, PortalError } from "@/lib/clientPortalServer";

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("signin"),email:z.string().trim().toLowerCase().email().max(254),password:z.string().min(1).max(128)}),
  z.object({action:z.literal("password"),password:z.string().min(12).max(128)}),
]);

export async function POST(req:Request) {
  if (!sameOrigin(req)) return reply({error:"Request origin is not allowed."},403);
  try {
    const parsed=input.safeParse(await boundedJSON(req,2048).catch(()=>null));
    if (!parsed.success) return reply({error:"Check the email and password fields. New passwords need 12 characters."},400);
    const action=parsed.data;
    const auth=await authClient(req);
    if (action.action==="password") {
      await portalContext(req);
      const {error}=await auth.auth.updateUser({password:action.password});
      return error ? reply({error:"Password could not be updated. Sign in again or choose a different password."},400) : reply({ok:true});
    }
    const result=await auth.auth.signInWithPassword({email:action.email,password:action.password});
    if (!result.data.user) {
      if ((result.error?.status??0)>=500 || result.error?.name==="AuthRetryableFetchError") return reply({error:"Sign-in is temporarily unavailable."},503);
      if (result.error?.status===429) return reply({error:"Too many attempts. Try again shortly."},429);
      return reply({error:"Invalid portal sign-in."},401);
    }
    try {
      const owner=portalOwner(result.data.user.app_metadata);
      if (!owner) throw new PortalError("Invalid portal sign-in.",403);
      ensurePortalMember(await ownedLibrary(owner),result.data.user.id,result.data.user.email??"");
    } catch(error) {
      await auth.auth.signOut({scope:"local"});
      throw error;
    }
    return reply({ok:true});
  } catch(error) {
    return error instanceof PortalError ? reply({error:error.message},error.status) : dbError(error);
  }
}
