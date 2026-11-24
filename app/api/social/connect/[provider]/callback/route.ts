import {NextResponse} from "next/server";
import {reportIdentity} from "@/lib/auth/server";
import {requestOrigin} from "@/lib/auth/origin";
import {mutateMedia} from "@/lib/mediaServer";
import {recordAudit} from "@/lib/auditServer";
import {PROVIDERS,PROVIDER_NAME,SocialAuthError,exchangeCode,readState,type Provider} from "@/lib/social/oauth";
import {discover,saveConnections,savePending} from "@/lib/social/connections";
import {socialAccess} from "@/lib/social/access";

/** The network sends the person back here. Only a state we signed, for this login, browser and network, is accepted. */
export async function GET(req:Request,{params}:{params:Promise<{provider:string}>}){
  const origin=requestOrigin(req),{provider}=await params;
  const back=(status:string,extra="")=>{
    const r=NextResponse.redirect(new URL(`/social?social=${status}&network=${encodeURIComponent(provider)}${extra}`,origin));
    r.cookies.delete({name:"soc_oauth_nonce",path:`/api/social/connect/${provider}`});r.headers.set("Cache-Control","private, no-store");return r;
  };
  try{
    if(!PROVIDERS.includes(provider as Provider))return back("unknown-network");
    const p=provider as Provider,user=await reportIdentity(req),url=new URL(req.url);
    if(url.searchParams.get("error"))return back("denied");
    const nonce=req.headers.get("cookie")?.match(/(?:^|;\s*)soc_oauth_nonce=([^;]+)/)?.[1];
    const state=readState(url.searchParams.get("state")??"",user.userId,p,nonce),code=url.searchParams.get("code");
    if(!state||!code)return back("invalid");
    await socialAccess(user.userId,state.c);
    const tokens=await exchangeCode(p,code,`${origin}/api/social/connect/${p}/callback`,state.n),found=await discover(p,tokens);
    if(found.pending){await savePending(user.userId,state.c,user.userId,found.pending.pages,found.pending.userToken);return back("choose-page",`&client=${encodeURIComponent(state.c)}`);}
    await saveConnections(user.userId,state.c,user.userId,found.connections);
    await mutateMedia(user.userId,crypto.randomUUID(),data=>{recordAudit(data,{actor:"human",actorId:user.userId,entity:"integration",clientId:state.c,action:`Connected ${PROVIDER_NAME[p]}`,after:found.connections.map(c=>`${c.platform}: ${c.accountName}`).join(" · "),outcome:"Saved"});return data;}).catch(()=>undefined);
    return back("connected",`&client=${encodeURIComponent(state.c)}`);
  }catch(error){
    console.error("[social] connect",provider,error instanceof Error?error.message:error);
    return back("failed",error instanceof SocialAuthError?`&reason=${encodeURIComponent(error.message.slice(0,200))}`:"");
  }
}
