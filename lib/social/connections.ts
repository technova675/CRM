// Connected social accounts, one per client and network. Tokens are sealed in the workspace vault and never leave the server.
import "server-only";
import {mutateMedia} from "../mediaServer";
import {openSecret,sealSecret,type SealedCredential} from "../workspaceVault";
import type {CRMLibrary} from "../domain/crmLibrary";
import type {SocialPlatform} from "../types";
import {GRAPH,PROVIDER_OF,REDDIT_UA,THREADS,SocialAuthError,getJson,refresh,type Provider} from "./oauth";

export type Secret={token:string;refreshToken?:string;expiresAt?:number;accountId:string;igUserId?:string};
export type StoredConnection={clientId:string;platform:SocialPlatform;accountId:string;accountName:string;credential:SealedCredential;connectedBy:string;connectedAt:string;expiresAt?:string;lastError?:string};
export type PublicConnection=Omit<StoredConnection,"credential">&{provider:Provider};
export type PendingPages={credential:SealedCredential;pages:{id:string;name:string;instagram?:string}[];at:string;by:string};

export const connectionKey=(clientId:string,platform:SocialPlatform)=>`${clientId}|${platform}`;
const slot=(key:string)=>`social:${key}`;
export const publicConnection=(c:StoredConnection):PublicConnection=>{const {credential,...rest}=c;void credential;return {...rest,provider:PROVIDER_OF[c.platform]};};
export function connectionsFor(library:Pick<CRMLibrary,"socialConnections">,clientId:string){
  return Object.values(library.socialConnections??{}).filter(c=>c.clientId===clientId).map(publicConnection);
}
export const openConnection=(owner:string,c:StoredConnection)=>JSON.parse(openSecret(owner,slot(connectionKey(c.clientId,c.platform)),c.credential)) as Secret;

export type NewConnection={platform:SocialPlatform;accountId:string;accountName:string;secret:Secret};
/** Saves one or more connections for a client. Connecting again replaces the earlier account for that network. */
export async function saveConnections(owner:string,clientId:string,userId:string,items:NewConnection[]){
  const at=new Date().toISOString();
  await mutateMedia(owner,crypto.randomUUID(),data=>{
    if(!data.clients.some(c=>c.id===clientId))throw new SocialAuthError("This client is no longer in the account.");
    data.socialConnections??={};
    for(const i of items){const key=connectionKey(clientId,i.platform);
      data.socialConnections[key]={clientId,platform:i.platform,accountId:i.accountId,accountName:i.accountName.slice(0,200),credential:sealSecret(owner,slot(key),JSON.stringify(i.secret)),connectedBy:userId,connectedAt:at,...(i.secret.expiresAt?{expiresAt:new Date(i.secret.expiresAt).toISOString()}:{})};}
    if(items.some(i=>PROVIDER_OF[i.platform]==="meta"))delete data.socialPending?.[clientId];
    return data;
  });
}
export async function removeConnection(owner:string,clientId:string,platform:SocialPlatform){
  let removed:StoredConnection|undefined;
  await mutateMedia(owner,crypto.randomUUID(),data=>{const key=connectionKey(clientId,platform);removed=data.socialConnections?.[key];if(removed)delete data.socialConnections![key];return data;});
  return removed;
}
async function markError(owner:string,c:StoredConnection,message:string|undefined,secret?:Secret){
  await mutateMedia(owner,crypto.randomUUID(),data=>{const key=connectionKey(c.clientId,c.platform),cur=data.socialConnections?.[key];if(!cur)return data;
    if(message)cur.lastError=message.slice(0,300);else delete cur.lastError;
    if(secret){cur.credential=sealSecret(owner,slot(key),JSON.stringify(secret));if(secret.expiresAt)cur.expiresAt=new Date(secret.expiresAt).toISOString();}
    return data;}).catch(()=>undefined);
}
export const recordConnectionError=(owner:string,c:StoredConnection,message:string)=>markError(owner,c,message);

/** A usable access token, refreshed when it is about to expire. Rotated refresh tokens are saved before use. */
const inflight=new Map<string,Promise<Secret>>();
export async function liveSecret(owner:string,c:StoredConnection):Promise<Secret>{
  const s=openConnection(owner,c),provider=PROVIDER_OF[c.platform];
  if(!s.expiresAt||s.expiresAt-Date.now()>5*60_000)return s;
  const lock=`${owner}|${connectionKey(c.clientId,c.platform)}`;
  if(inflight.has(lock))return inflight.get(lock)!;
  const job=(async()=>{
    const refreshWith=provider==="threads"?s.token:s.refreshToken;
    if(!refreshWith){await markError(owner,c,"Access expired. Connect this account again.");throw new SocialAuthError(`${c.platform} access expired. Connect the account again.`,true);}
    try{
      const t=await refresh(provider,refreshWith);
      const next:Secret={...s,token:t.access_token!,refreshToken:t.refresh_token??s.refreshToken,expiresAt:t.expires_in?Date.now()+t.expires_in*1000:undefined};
      await markError(owner,c,undefined,next);return next;
    }catch(e){if(e instanceof SocialAuthError&&e.reconnect)await markError(owner,c,"Access was revoked or expired. Connect this account again.");throw e;}
  })().finally(()=>inflight.delete(lock));
  inflight.set(lock,job);return job;
}

// ---------- discovering the account after sign-in ----------
const bearer=(t:string,extra:Record<string,string>={})=>({headers:{Authorization:`Bearer ${t}`,...extra}});
const expiry=(s?:number)=>s?Date.now()+s*1000:undefined;
type Discovery={connections:NewConnection[];pending?:{pages:PendingPages["pages"];userToken:string}};

type Page={id:string;name:string;access_token:string;instagram_business_account?:{id:string;username?:string}};
async function metaPages(userToken:string){
  const r=await getJson<{data:Page[]}>(`${GRAPH}/me/accounts?${new URLSearchParams({fields:"id,name,access_token,instagram_business_account{id,username}",limit:"100",access_token:userToken})}`);
  return r.data??[];
}
function pageConnections(p:Page):NewConnection[]{
  const out:NewConnection[]=[{platform:"Facebook",accountId:p.id,accountName:p.name,secret:{token:p.access_token,accountId:p.id}}];
  if(p.instagram_business_account)out.push({platform:"Instagram",accountId:p.instagram_business_account.id,accountName:p.instagram_business_account.username?`@${p.instagram_business_account.username}`:`${p.name} (Instagram)`,secret:{token:p.access_token,accountId:p.instagram_business_account.id,igUserId:p.instagram_business_account.id}});
  return out;
}
/** Finishes a Meta sign-in for a client who manages several Pages, once the team picks one. */
export async function chooseMetaPage(owner:string,clientId:string,pageId:string,userId:string){
  const lib=(await import("../outreachServer")).ownedLibrary;const data=await lib(owner),pending=data?.socialPending?.[clientId];
  if(!pending)throw new SocialAuthError("The Facebook sign-in expired. Connect again.");
  const token=openSecret(owner,`social-pending:${clientId}`,pending.credential),page=(await metaPages(token)).find(p=>p.id===pageId);
  if(!page)throw new SocialAuthError("That Page is no longer available to this Facebook login.");
  const items=pageConnections(page);await saveConnections(owner,clientId,userId,items);return items;
}
export async function savePending(owner:string,clientId:string,userId:string,pages:PendingPages["pages"],userToken:string){
  await mutateMedia(owner,crypto.randomUUID(),data=>{data.socialPending??={};data.socialPending[clientId]={credential:sealSecret(owner,`social-pending:${clientId}`,userToken),pages,at:new Date().toISOString(),by:userId};return data;});
}

export async function discover(provider:Provider,t:{access_token?:string;refresh_token?:string;expires_in?:number;user_id?:string|number}):Promise<Discovery>{
  const token=t.access_token!;
  switch(provider){
    case "meta":{
      const pages=await metaPages(token);
      if(!pages.length)throw new SocialAuthError("No Facebook Page was shared. Sign in again and select the client's Page (and its linked Instagram Business account).");
      if(pages.length===1)return {connections:pageConnections(pages[0])};
      return {connections:[],pending:{userToken:token,pages:pages.map(p=>({id:p.id,name:p.name,...(p.instagram_business_account?{instagram:p.instagram_business_account.username??"linked"}:{})}))}};
    }
    case "threads":{
      const me=await getJson<{id:string;username?:string}>(`${THREADS}/me?${new URLSearchParams({fields:"id,username",access_token:token})}`);
      return {connections:[{platform:"Threads",accountId:me.id,accountName:me.username?`@${me.username}`:"Threads profile",secret:{token,accountId:me.id,expiresAt:expiry(t.expires_in)}}]};
    }
    case "linkedin":{
      const me=await getJson<{sub:string;name?:string}>("https://api.linkedin.com/v2/userinfo",bearer(token));
      return {connections:[{platform:"LinkedIn",accountId:`urn:li:person:${me.sub}`,accountName:me.name??"LinkedIn profile",secret:{token,refreshToken:t.refresh_token,expiresAt:expiry(t.expires_in),accountId:`urn:li:person:${me.sub}`}}]};
    }
    case "x":{
      const me=await getJson<{data:{id:string;username:string}}>("https://api.x.com/2/users/me",bearer(token));
      return {connections:[{platform:"X",accountId:me.data.id,accountName:`@${me.data.username}`,secret:{token,refreshToken:t.refresh_token,expiresAt:expiry(t.expires_in),accountId:me.data.id}}]};
    }
    case "reddit":{
      const me=await getJson<{name:string}>("https://oauth.reddit.com/api/v1/me",bearer(token,{"User-Agent":REDDIT_UA}));
      if(!t.refresh_token)throw new SocialAuthError("Reddit did not grant lasting access. Connect again and approve.");
      return {connections:[{platform:"Reddit",accountId:me.name,accountName:`u/${me.name}`,secret:{token,refreshToken:t.refresh_token,expiresAt:expiry(t.expires_in),accountId:me.name}}]};
    }
    case "youtube":{
      const me=await getJson<{items?:{id:string;snippet:{title:string}}[]}>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",bearer(token));
      const ch=me.items?.[0];if(!ch)throw new SocialAuthError("This Google account has no YouTube channel.");
      if(!t.refresh_token)throw new SocialAuthError("Google did not grant lasting access. Remove the app from your Google account permissions, then connect again.");
      return {connections:[{platform:"YouTube",accountId:ch.id,accountName:ch.snippet.title,secret:{token,refreshToken:t.refresh_token,expiresAt:expiry(t.expires_in),accountId:ch.id}}]};
    }
  }
}
