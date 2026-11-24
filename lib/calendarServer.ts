import "server-only";
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {ownedLibrary} from "./outreachServer";
import {mutateMedia} from "./mediaServer";
import {openSecret,sealSecret,vaultConfigured,workspaceCryptoKey} from "./workspaceVault";
import {fromCalcom,fromCalendly,fromGoogle,type CalendarEvent,type CalendarLink,type CalendarProvider} from "./domain/calendar";

export class CalendarError extends Error{constructor(message:string,public status=400){super(message);}}

const TIMEOUT=15000;
const slot=(userId:string)=>`calendar:${userId}`;
const googleId=()=>process.env.GOOGLE_CALENDAR_CLIENT_ID||process.env.GOOGLE_CLIENT_ID||"";
const googleSecret=()=>process.env.GOOGLE_CALENDAR_CLIENT_SECRET||process.env.GOOGLE_CLIENT_SECRET||"";
export const googleReady=()=>!!googleId()&&!!googleSecret()&&vaultConfigured();
const calendlyId=()=>process.env.CALENDLY_CLIENT_ID||"";
const calendlySecret=()=>process.env.CALENDLY_CLIENT_SECRET||"";
/** Sign in with Calendly (OAuth) is available once the agency registers a Calendly OAuth app. */
export const calendlyOAuthReady=()=>!!calendlyId()&&!!calendlySecret()&&vaultConfigured();
export const tokensReady=()=>vaultConfigured();
export const GOOGLE_SCOPES="openid email https://www.googleapis.com/auth/calendar.readonly";

type Secret={provider:"google";refreshToken:string}|{provider:"calendly";token:string;userUri:string}|{provider:"calendly";oauth:true;refreshToken:string;userUri:string}|{provider:"calcom";key:string};

// ---------- storage: one connection per login, never sent to the browser ----------
export async function getLink(userId:string){
  return ((await ownedLibrary(userId))?.calendarLinks??{})[userId] as CalendarLink|undefined;
}
async function saveLink(userId:string,link:CalendarLink|null,op:string){
  await mutateMedia(userId,op,data=>{const links=data.calendarLinks??={};if(link)links[userId]=link;else delete links[userId];return data;});
}
export async function storeConnection(userId:string,provider:CalendarProvider,account:string,secret:Secret,op:string){
  const existing=await getLink(userId);
  if(existing)throw new CalendarError(`This login is already connected to ${existing.account}. Disconnect it before connecting another calendar.`,409);
  await saveLink(userId,{provider,account,connectedAt:new Date().toISOString(),credential:sealSecret(userId,slot(userId),JSON.stringify(secret))},op);
}
function secretOf(userId:string,link:CalendarLink):Secret{return JSON.parse(openSecret(userId,slot(userId),link.credential));}
async function markSync(userId:string,error?:string){
  await mutateMedia(userId,crypto.randomUUID(),data=>{const l=data.calendarLinks?.[userId];if(l){l.lastSyncAt=new Date().toISOString();if(error)l.lastError=error;else delete l.lastError;}return data;}).catch(()=>undefined);
}

// ---------- Google OAuth ----------
/** The state names the login and a nonce also held in an httpOnly cookie, and is signed, so a callback cannot be replayed or forged for another user. */
export function signState(userId:string,nonce:string,provider:"google"|"calendly"="google"){
  const body=Buffer.from(JSON.stringify({u:userId,n:nonce,p:provider,e:Date.now()+10*60_000})).toString("base64url");
  return body+"."+createHmac("sha256",workspaceCryptoKey("calendar-oauth-state","vault")).update(body).digest("base64url");
}
export function verifyState(state:string,userId:string,cookieNonce:string|undefined,provider:"google"|"calendly"="google"){
  const [body,sig]=state.split(".");if(!body||!sig||!cookieNonce)return false;
  const want=createHmac("sha256",workspaceCryptoKey("calendar-oauth-state","vault")).update(body).digest();
  const got=Buffer.from(sig,"base64url");if(got.length!==want.length||!timingSafeEqual(got,want))return false;
  try{const s=JSON.parse(Buffer.from(body,"base64url").toString()) as {u:string;n:string;p?:string;e:number};
    const a=Buffer.from(s.n),b=Buffer.from(cookieNonce);
    return s.u===userId&&(s.p??"google")===provider&&s.e>Date.now()&&a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}
}
export const newNonce=()=>randomBytes(24).toString("base64url");
export function googleAuthUrl(redirectUri:string,state:string){
  const u=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({client_id:googleId(),redirect_uri:redirectUri,response_type:"code",scope:GOOGLE_SCOPES,access_type:"offline",prompt:"consent",include_granted_scopes:"true",state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.toString();
}
async function googleToken(params:Record<string,string>){
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:googleId(),client_secret:googleSecret(),...params}),signal:AbortSignal.timeout(TIMEOUT)});
  const body=await r.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string};
  if(!r.ok||!body.access_token)throw new CalendarError(body.error==="invalid_grant"?"Google access was revoked or expired. Connect Google Calendar again.":"Google did not accept the sign-in. Try again.",r.status===400?401:502);
  return body;
}
export async function finishGoogle(userId:string,code:string,redirectUri:string){
  const t=await googleToken({code,grant_type:"authorization_code",redirect_uri:redirectUri});
  if(!t.refresh_token)throw new CalendarError("Google did not grant offline access. Remove Adbibe OS from your Google account's third-party access and connect again.",400);
  if(!t.scope?.includes("calendar.readonly"))throw new CalendarError("Calendar access was not granted. Tick the calendar permission when Google asks.",400);
  const me=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${t.access_token}`},signal:AbortSignal.timeout(TIMEOUT)}).then(r=>r.json()).catch(()=>({})) as {email?:string};
  await storeConnection(userId,"google",me.email??"Google account",{provider:"google",refreshToken:t.refresh_token},crypto.randomUUID());
  accessCache.set(userId,{token:t.access_token!,until:Date.now()+((t.expires_in??3600)-60)*1000});
}
const accessCache=new Map<string,{token:string;until:number}>();
async function googleAccess(userId:string,refreshToken:string){
  const hit=accessCache.get(userId);if(hit&&hit.until>Date.now())return hit.token;
  const t=await googleToken({grant_type:"refresh_token",refresh_token:refreshToken});
  accessCache.set(userId,{token:t.access_token!,until:Date.now()+((t.expires_in??3600)-60)*1000});
  return t.access_token!;
}

// ---------- Calendly OAuth ----------
export function calendlyAuthUrl(redirectUri:string,state:string){
  const u=new URL("https://auth.calendly.com/oauth/authorize");
  Object.entries({client_id:calendlyId(),response_type:"code",redirect_uri:redirectUri,state}).forEach(([k,v])=>u.searchParams.set(k,v));
  return u.toString();
}
async function calendlyToken(params:Record<string,string>){
  const r=await fetch("https://auth.calendly.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:calendlyId(),client_secret:calendlySecret(),...params}),signal:AbortSignal.timeout(TIMEOUT)});
  const body=await r.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;owner?:string;error?:string};
  if(!r.ok||!body.access_token||!body.refresh_token)throw new CalendarError(body.error==="invalid_grant"?"Calendly access was revoked or expired. Connect Calendly again.":"Calendly did not accept the sign-in. Try again.",r.status===400||r.status===401?401:502);
  return body;
}
export async function finishCalendly(userId:string,code:string,redirectUri:string){
  const t=await calendlyToken({grant_type:"authorization_code",code,redirect_uri:redirectUri});
  const me=await fetch("https://api.calendly.com/users/me",{headers:{Authorization:`Bearer ${t.access_token}`},signal:AbortSignal.timeout(TIMEOUT)}).then(r=>r.json()).catch(()=>({})) as {resource?:{uri?:string;email?:string;name?:string}};
  const userUri=me.resource?.uri||t.owner;
  if(!userUri)throw new CalendarError("Calendly returned no user for this sign-in.",502);
  await storeConnection(userId,"calendly",me.resource?.email||me.resource?.name||"Calendly account",{provider:"calendly",oauth:true,refreshToken:t.refresh_token!,userUri},crypto.randomUUID());
  accessCache.set(userId,{token:t.access_token!,until:Date.now()+((t.expires_in??7200)-60)*1000});
}
/** Calendly refresh tokens are single-use: each refresh returns a new one, which is sealed and saved before use. One refresh at a time per login. */
const refreshing=new Map<string,Promise<string>>();
async function calendlyAccess(userId:string,refreshToken:string,userUri:string){
  const hit=accessCache.get(userId);if(hit&&hit.until>Date.now())return hit.token;
  const running=refreshing.get(userId);if(running)return running;
  const job=(async()=>{
    const t=await calendlyToken({grant_type:"refresh_token",refresh_token:refreshToken});
    const sealed=sealSecret(userId,slot(userId),JSON.stringify({provider:"calendly",oauth:true,refreshToken:t.refresh_token,userUri}));
    await mutateMedia(userId,crypto.randomUUID(),data=>{const l=data.calendarLinks?.[userId];if(l&&l.provider==="calendly")l.credential=sealed;return data;});
    accessCache.set(userId,{token:t.access_token!,until:Date.now()+((t.expires_in??7200)-60)*1000});
    return t.access_token!;
  })().finally(()=>refreshing.delete(userId));
  refreshing.set(userId,job);return job;
}

// ---------- token providers ----------
export async function verifyCalendly(token:string){
  const r=await fetch("https://api.calendly.com/users/me",{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(TIMEOUT)});
  if(r.status===401||r.status===403)throw new CalendarError("Calendly did not accept this token. Create a new personal access token and paste it again.",401);
  if(!r.ok)throw new CalendarError("Calendly could not be reached. Try again in a minute.",502);
  const body=await r.json() as {resource?:{uri?:string;email?:string;name?:string}};
  if(!body.resource?.uri)throw new CalendarError("Calendly returned no user for this token.",502);
  return {account:body.resource.email||body.resource.name||"Calendly account",userUri:body.resource.uri};
}
const CALCOM_HEADERS=(key:string)=>({Authorization:`Bearer ${key}`,"cal-api-version":"2024-08-13"});
export async function verifyCalcom(key:string){
  const r=await fetch("https://api.cal.com/v2/me",{headers:CALCOM_HEADERS(key),signal:AbortSignal.timeout(TIMEOUT)});
  if(r.status===401||r.status===403)throw new CalendarError("Cal.com did not accept this API key. Create a new key and paste it again.",401);
  if(!r.ok)throw new CalendarError("Cal.com could not be reached. Try again in a minute.",502);
  const body=await r.json() as {data?:{email?:string;username?:string;name?:string}};
  return {account:body.data?.email||body.data?.username||body.data?.name||"Cal.com account"};
}

// ---------- events, cached briefly per login so page navigation does not hit provider rate limits ----------
const eventCache=new Map<string,{at:number;events:CalendarEvent[]}>();
export async function eventsFor(userId:string,from:string,to:string){
  const link=await getLink(userId);if(!link)return {link:null,events:[] as CalendarEvent[]};
  const key=`${userId}|${link.connectedAt}|${from}|${to}`,hit=eventCache.get(key);
  if(hit&&Date.now()-hit.at<60_000)return {link,events:hit.events};
  const secret=secretOf(userId,link);let events:CalendarEvent[];
  try{
    if(secret.provider==="google"){
      const access=await googleAccess(userId,secret.refreshToken),u=new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      Object.entries({timeMin:from,timeMax:to,singleEvents:"true",orderBy:"startTime",maxResults:"250"}).forEach(([k,v])=>u.searchParams.set(k,v));
      const r=await fetch(u,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(TIMEOUT)});
      if(r.status===401){accessCache.delete(userId);throw new CalendarError("Google access was revoked. Connect Google Calendar again.",401);}
      if(!r.ok)throw new CalendarError("Google Calendar could not be read right now.",502);
      events=fromGoogle(((await r.json()) as {items?:unknown[]}).items??[]);
    }else if(secret.provider==="calendly"){
      const u=new URL("https://api.calendly.com/scheduled_events");
      Object.entries({user:secret.userUri,min_start_time:from,max_start_time:to,count:"100",status:"active",sort:"start_time:asc"}).forEach(([k,v])=>u.searchParams.set(k,v));
      const bearer="oauth" in secret?await calendlyAccess(userId,secret.refreshToken,secret.userUri):secret.token;
      const r=await fetch(u,{headers:{Authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(TIMEOUT)});
      if(r.status===401||r.status===403){accessCache.delete(userId);throw new CalendarError("Calendly no longer allows access. Disconnect and connect Calendly again.",401);}
      if(!r.ok)throw new CalendarError("Calendly could not be read right now.",502);
      events=fromCalendly(((await r.json()) as {collection?:unknown[]}).collection??[]);
    }else{
      const u=new URL("https://api.cal.com/v2/bookings");
      Object.entries({afterStart:from,beforeEnd:to,take:"100",sortStart:"asc"}).forEach(([k,v])=>u.searchParams.set(k,v));
      const r=await fetch(u,{headers:CALCOM_HEADERS(secret.key),signal:AbortSignal.timeout(TIMEOUT)});
      if(r.status===401||r.status===403)throw new CalendarError("Cal.com no longer accepts the saved API key. Disconnect and connect again.",401);
      if(!r.ok)throw new CalendarError("Cal.com could not be read right now.",502);
      const body=await r.json() as {data?:unknown[]|{bookings?:unknown[]}};
      events=fromCalcom(Array.isArray(body.data)?body.data:body.data?.bookings??[]);
    }
  }catch(error){
    if(error instanceof CalendarError){if(error.status===401)await markSync(userId,error.message);throw error;}
    throw new CalendarError("The calendar could not be reached. Try again in a minute.",502);
  }
  eventCache.set(key,{at:Date.now(),events});if(eventCache.size>500)eventCache.delete(eventCache.keys().next().value!);
  if(!link.lastSyncAt||link.lastError||Date.now()-Date.parse(link.lastSyncAt)>15*60_000)await markSync(userId);
  return {link,events};
}

/** Removes the connection; for Google the refresh token is also revoked so no access remains with us. */
export async function disconnect(userId:string){
  const link=await getLink(userId);if(!link)return;
  try{const secret=secretOf(userId,link);
    if(secret.provider==="calendly"&&"oauth" in secret)await fetch("https://auth.calendly.com/oauth/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:calendlyId(),client_secret:calendlySecret(),token:secret.refreshToken}),signal:AbortSignal.timeout(TIMEOUT)}).catch(()=>undefined);
    if(secret.provider==="google")await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token:secret.refreshToken}),signal:AbortSignal.timeout(TIMEOUT)}).catch(()=>undefined);
  }catch{/* the stored secret is unreadable; removing the record is still right */}
  accessCache.delete(userId);for(const k of eventCache.keys())if(k.startsWith(userId+"|"))eventCache.delete(k);
  await saveLink(userId,null,crypto.randomUUID());
}
