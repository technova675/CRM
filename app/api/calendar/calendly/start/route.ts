import {NextResponse} from "next/server";
import {reportIdentity} from "@/lib/auth/server";
import {requestOrigin} from "@/lib/auth/origin";
import {dbError} from "@/lib/db";
import {calendlyAuthUrl,calendlyOAuthReady,getLink,newNonce,signState} from "@/lib/calendarServer";

/** Sends the signed-in user to Calendly's own sign-in and consent screen. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),origin=requestOrigin(req);
    if(!calendlyOAuthReady())return NextResponse.redirect(new URL("/meetings?calendar=calendly-not-configured",origin));
    if(await getLink(user.userId))return NextResponse.redirect(new URL("/meetings?calendar=already-connected",origin));
    const nonce=newNonce(),res=NextResponse.redirect(calendlyAuthUrl(origin+"/api/calendar/calendly/callback",signState(user.userId,nonce,"calendly")));
    res.cookies.set("cal_oauth_nonce",nonce,{httpOnly:true,sameSite:"lax",secure:origin.startsWith("https:"),path:"/api/calendar/calendly",maxAge:600});
    res.headers.set("Cache-Control","private, no-store");
    return res;
  }catch(error){return dbError(error);}
}
