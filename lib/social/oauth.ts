// Official OAuth for each social network. No cookies, passwords or browser automation: a client signs in on the
// network's own page, approves the listed permissions, and the CRM keeps only the tokens, sealed in the vault.
import "server-only";
import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {workspaceCryptoKey,vaultConfigured} from "../workspaceVault";
import type {SocialPlatform} from "../types";

export type Provider="meta"|"threads"|"linkedin"|"x"|"reddit"|"youtube";
export const PROVIDERS:Provider[]=["meta","threads","linkedin","x","reddit","youtube"];
/** Which sign-in connects which network. One Meta sign-in connects a Facebook Page and its Instagram account. */
export const PROVIDER_OF:Record<SocialPlatform,Provider>={Facebook:"meta",Instagram:"meta",Threads:"threads",LinkedIn:"linkedin",X:"x",Reddit:"reddit",YouTube:"youtube"};
export const PROVIDER_NAME:Record<Provider,string>={meta:"Facebook & Instagram",threads:"Threads",linkedin:"LinkedIn",x:"X",reddit:"Reddit",youtube:"YouTube"};

export const GRAPH=`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||"v23.0"}`;
export const THREADS="https://graph.threads.net/v1.0";
export const REDDIT_UA=process.env.REDDIT_USER_AGENT||"web:adbibe-os:1.0";
export const TIMEOUT=30_000;

const env=(name:string)=>process.env[name]?.trim()||"";
const CREDS:Record<Provider,[string,string]>={meta:["META_APP_ID","META_APP_SECRET"],threads:["THREADS_APP_ID","THREADS_APP_SECRET"],linkedin:["LINKEDIN_CLIENT_ID","LINKEDIN_CLIENT_SECRET"],x:["X_CLIENT_ID","X_CLIENT_SECRET"],reddit:["REDDIT_CLIENT_ID","REDDIT_CLIENT_SECRET"],youtube:["YOUTUBE_CLIENT_ID","YOUTUBE_CLIENT_SECRET"]};
export const clientId=(p:Provider)=>env(CREDS[p][0]);
export const clientSecret=(p:Provider)=>env(CREDS[p][1]);
/** The app keys exist and tokens can be stored safely. */
export const providerReady=(p:Provider)=>!!clientId(p)&&!!clientSecret(p)&&vaultConfigured();
export const missingKeys=(p:Provider)=>[...CREDS[p].filter(k=>!env(k)),...(vaultConfigured()?[]:["WORKSPACE_VAULT_KEY"])];

/** Permissions asked for: only what publishing needs. */
const SCOPES:Record<Provider,string>={
  meta:"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management",
  threads:"threads_basic,threads_content_publish",
  linkedin:"openid profile w_member_social",
  x:"tweet.read tweet.write users.read media.write offline.access",
  reddit:"identity submit",
  youtube:"https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
};

// ---------- state: signed, short-lived, bound to the login, the client, the network and this browser ----------
type State={u:string;c:string;p:Provider;n:string;e:number};
const stateKey=()=>workspaceCryptoKey("social-oauth-state","vault");
export const newNonce=()=>randomBytes(24).toString("base64url");
export function signState(s:Omit<State,"e">){const body=Buffer.from(JSON.stringify({...s,e:Date.now()+10*60_000})).toString("base64url");return body+"."+createHmac("sha256",stateKey()).update(body).digest("base64url");}
export function readState(state:string,userId:string,provider:Provider,cookieNonce:string|undefined):State|null{
  const [body,sig]=state.split(".");if(!body||!sig||!cookieNonce)return null;
  const want=createHmac("sha256",stateKey()).update(body).digest(),got=Buffer.from(sig,"base64url");
  if(got.length!==want.length||!timingSafeEqual(got,want))return null;
  try{const s=JSON.parse(Buffer.from(body,"base64url").toString()) as State;const a=Buffer.from(s.n),b=Buffer.from(cookieNonce);
    return s.u===userId&&s.p===provider&&s.e>Date.now()&&a.length===b.length&&timingSafeEqual(a,b)?s:null;}catch{return null;}
}
/** X requires PKCE; the verifier is derived from the browser-bound nonce, so it never travels in the URL. */
const verifier=(nonce:string)=>createHmac("sha256",stateKey()).update("pkce|"+nonce).digest("base64url");
const challenge=(nonce:string)=>createHash("sha256").update(verifier(nonce)).digest("base64url");

export function authUrl(p:Provider,redirectUri:string,state:string,nonce:string){
  const id=clientId(p);let u:URL;const q:Record<string,string>={client_id:id,redirect_uri:redirectUri,state,response_type:"code"};
  switch(p){
    case "meta":u=new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION||"v23.0"}/dialog/oauth`);q.scope=SCOPES.meta;break;
    case "threads":u=new URL("https://threads.net/oauth/authorize");q.scope=SCOPES.threads;break;
    case "linkedin":u=new URL("https://www.linkedin.com/oauth/v2/authorization");q.scope=SCOPES.linkedin;break;
    case "x":u=new URL("https://x.com/i/oauth2/authorize");Object.assign(q,{scope:SCOPES.x,code_challenge:challenge(nonce),code_challenge_method:"S256"});break;
    case "reddit":u=new URL("https://www.reddit.com/api/v1/authorize");Object.assign(q,{scope:SCOPES.reddit,duration:"permanent"});break;
    case "youtube":u=new URL("https://accounts.google.com/o/oauth2/v2/auth");Object.assign(q,{scope:SCOPES.youtube,access_type:"offline",prompt:"consent",include_granted_scopes:"true"});break;
  }
  for(const [k,v] of Object.entries(q))u.searchParams.set(k,v);
  return u.toString();
}

export class SocialAuthError extends Error{readonly reconnect:boolean;constructor(message:string,reconnect=false){super(message);this.reconnect=reconnect;}}
type Token={access_token?:string;refresh_token?:string;expires_in?:number;user_id?:string|number;error?:string|{message?:string};error_description?:string};
const basic=(p:Provider)=>"Basic "+Buffer.from(`${clientId(p)}:${clientSecret(p)}`).toString("base64");
async function form(url:string,params:Record<string,string>,headers:Record<string,string>={}){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json",...headers},body:new URLSearchParams(params),signal:AbortSignal.timeout(TIMEOUT),cache:"no-store"});
  const body=await r.json().catch(()=>({})) as Token;
  if(!r.ok||!body.access_token){const msg=typeof body.error==="object"?body.error.message:body.error_description||body.error;throw new SocialAuthError(`Sign-in was not accepted${msg?`: ${msg}`:"."}`,r.status===400||r.status===401);}
  return body;
}
export async function getJson<T>(url:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(url,{...init,signal:init.signal??AbortSignal.timeout(TIMEOUT),cache:"no-store"});
  const body=await r.json().catch(()=>({}));
  if(!r.ok){const e=body as {error?:{message?:string}|string;message?:string;detail?:string};throw new SocialAuthError(typeof e.error==="object"?e.error.message??"Request failed":e.error||e.message||e.detail||`HTTP ${r.status}`,r.status===401);}
  return body as T;
}

/** Exchanges the sign-in code for tokens. */
export async function exchangeCode(p:Provider,code:string,redirectUri:string,nonce:string):Promise<Token>{
  switch(p){
    case "meta":{
      const short=await getJson<Token>(`${GRAPH}/oauth/access_token?${new URLSearchParams({client_id:clientId(p),client_secret:clientSecret(p),redirect_uri:redirectUri,code})}`);
      // Page tokens derived from a long-lived user token do not expire.
      return getJson<Token>(`${GRAPH}/oauth/access_token?${new URLSearchParams({grant_type:"fb_exchange_token",client_id:clientId(p),client_secret:clientSecret(p),fb_exchange_token:short.access_token!})}`);
    }
    case "threads":{
      const short=await form("https://graph.threads.net/oauth/access_token",{client_id:clientId(p),client_secret:clientSecret(p),grant_type:"authorization_code",redirect_uri:redirectUri,code});
      const long=await getJson<Token>(`https://graph.threads.net/access_token?${new URLSearchParams({grant_type:"th_exchange_token",client_secret:clientSecret(p),access_token:short.access_token!})}`);
      return {...long,user_id:short.user_id};
    }
    case "linkedin":return form("https://www.linkedin.com/oauth/v2/accessToken",{grant_type:"authorization_code",code,redirect_uri:redirectUri,client_id:clientId(p),client_secret:clientSecret(p)});
    case "x":return form("https://api.x.com/2/oauth2/token",{grant_type:"authorization_code",code,redirect_uri:redirectUri,code_verifier:verifier(nonce)},{Authorization:basic(p)});
    case "reddit":return form("https://www.reddit.com/api/v1/access_token",{grant_type:"authorization_code",code,redirect_uri:redirectUri},{Authorization:basic(p),"User-Agent":REDDIT_UA});
    case "youtube":return form("https://oauth2.googleapis.com/token",{grant_type:"authorization_code",code,redirect_uri:redirectUri,client_id:clientId(p),client_secret:clientSecret(p)});
  }
}

/** A fresh access token from a refresh token. Networks that rotate refresh tokens return a new one, which the caller must save. */
export async function refresh(p:Provider,refreshToken:string):Promise<Token>{
  switch(p){
    case "threads":return getJson<Token>(`https://graph.threads.net/refresh_access_token?${new URLSearchParams({grant_type:"th_refresh_token",access_token:refreshToken})}`);
    case "linkedin":return form("https://www.linkedin.com/oauth/v2/accessToken",{grant_type:"refresh_token",refresh_token:refreshToken,client_id:clientId(p),client_secret:clientSecret(p)});
    case "x":return form("https://api.x.com/2/oauth2/token",{grant_type:"refresh_token",refresh_token:refreshToken,client_id:clientId(p)},{Authorization:basic(p)});
    case "reddit":return form("https://www.reddit.com/api/v1/access_token",{grant_type:"refresh_token",refresh_token:refreshToken},{Authorization:basic(p),"User-Agent":REDDIT_UA});
    case "youtube":return form("https://oauth2.googleapis.com/token",{grant_type:"refresh_token",refresh_token:refreshToken,client_id:clientId(p),client_secret:clientSecret(p)});
    case "meta":throw new SocialAuthError("Facebook Page tokens do not need refreshing.");
  }
}

/** Revokes a token at the network when a client disconnects, where the network offers it. Failures are ignored. */
export async function revoke(p:Provider,token:string){
  const run=(url:string,init:RequestInit)=>fetch(url,{...init,signal:AbortSignal.timeout(10_000)}).catch(()=>undefined);
  if(p==="x")await run("https://api.x.com/2/oauth2/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:basic(p)},body:new URLSearchParams({token,client_id:clientId(p)})});
  if(p==="reddit")await run("https://www.reddit.com/api/v1/revoke_token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:basic(p),"User-Agent":REDDIT_UA},body:new URLSearchParams({token,token_type_hint:"refresh_token"})});
  if(p==="youtube")await run(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,{method:"POST"});
  if(p==="linkedin")await run("https://www.linkedin.com/oauth/v2/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token,client_id:clientId(p),client_secret:clientSecret(p)})});
}
