import {NextResponse} from "next/server";
import {reportIdentity} from "@/lib/auth/server";
import {requestOrigin} from "@/lib/auth/origin";
import {dbError} from "@/lib/db";
import {PROVIDERS,authUrl,newNonce,providerReady,signState,type Provider} from "@/lib/social/oauth";
import {AccessError,socialAccess} from "@/lib/social/access";

/** Sends the team member to the network's own sign-in page to connect a client's account. */
export async function GET(req:Request,{params}:{params:Promise<{provider:string}>}){
  const origin=requestOrigin(req),back=(status:string)=>NextResponse.redirect(new URL(`/social?social=${status}`,origin));
  try{
    const {provider}=await params;if(!PROVIDERS.includes(provider as Provider))return back("unknown-network");
    const p=provider as Provider,user=await reportIdentity(req),clientId=new URL(req.url).searchParams.get("clientId")??"";
    await socialAccess(user.userId,clientId);
    if(!providerReady(p))return back(`not-configured&network=${p}`);
    const nonce=newNonce(),res=NextResponse.redirect(authUrl(p,`${origin}/api/social/connect/${p}/callback`,signState({u:user.userId,c:clientId,p,n:nonce}),nonce));
    res.cookies.set("soc_oauth_nonce",nonce,{httpOnly:true,sameSite:"lax",secure:origin.startsWith("https:"),path:`/api/social/connect/${p}`,maxAge:600});
    res.headers.set("Cache-Control","private, no-store");
    return res;
  }catch(error){if(error instanceof AccessError)return back("no-access");return dbError(error);}
}
