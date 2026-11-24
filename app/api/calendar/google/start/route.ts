import {NextResponse} from "next/server";
import {reportIdentity} from "@/lib/auth/server";
import {requestOrigin} from "@/lib/auth/origin";
import {dbError} from "@/lib/db";
import {getLink,googleAuthUrl,googleReady,newNonce,signState} from "@/lib/calendarServer";

/** Sends the signed-in user to Google's consent screen for read-only calendar access. */
export async function GET(req:Request){
  try{
    const user=await reportIdentity(req),origin=requestOrigin(req);
    if(!googleReady())return NextResponse.redirect(new URL("/meetings?calendar=google-not-configured",origin));
    if(await getLink(user.userId))return NextResponse.redirect(new URL("/meetings?calendar=already-connected",origin));
    const nonce=newNonce(),res=NextResponse.redirect(googleAuthUrl(origin+"/api/calendar/google/callback",signState(user.userId,nonce)));
    res.cookies.set("cal_oauth_nonce",nonce,{httpOnly:true,sameSite:"lax",secure:origin.startsWith("https:"),path:"/api/calendar/google",maxAge:600});
    res.headers.set("Cache-Control","private, no-store");
    return res;
  }catch(error){return dbError(error);}
}
