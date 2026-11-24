import {NextResponse} from "next/server";
import {reportIdentity} from "@/lib/auth/server";
import {requestOrigin} from "@/lib/auth/origin";
import {mutateMedia} from "@/lib/mediaServer";
import {recordAudit} from "@/lib/auditServer";
import {CalendarError,finishCalendly,getLink,verifyState} from "@/lib/calendarServer";

/** Calendly returns here. The state must be ours, unexpired, for this login, this browser and Calendly; only then is the code exchanged. */
export async function GET(req:Request){
  const origin=requestOrigin(req);
  const back=(status:string)=>{const r=NextResponse.redirect(new URL(`/meetings?calendar=${status}`,origin));r.cookies.delete({name:"cal_oauth_nonce",path:"/api/calendar/calendly"});r.headers.set("Cache-Control","private, no-store");return r;};
  try{
    const user=await reportIdentity(req),url=new URL(req.url),code=url.searchParams.get("code"),state=url.searchParams.get("state")??"";
    const nonce=req.headers.get("cookie")?.match(/(?:^|;\s*)cal_oauth_nonce=([^;]+)/)?.[1];
    if(url.searchParams.get("error"))return back("calendly-denied");
    if(!code||!verifyState(state,user.userId,nonce,"calendly"))return back("calendly-invalid");
    await finishCalendly(user.userId,code,origin+"/api/calendar/calendly/callback");
    const link=await getLink(user.userId);
    await mutateMedia(user.userId,crypto.randomUUID(),data=>{recordAudit(data,{actor:"human",actorId:user.userId,entity:"integration",action:"Connected calendar",after:`Calendly · ${link?.account??""}`,outcome:"Saved"});return data;}).catch(()=>undefined);
    return back("connected");
  }catch(error){
    if(error instanceof CalendarError&&error.status===409)return back("already-connected");
    console.error("[calendar] calendly callback",error instanceof Error?error.message:error);
    return back("calendly-failed");
  }
}
