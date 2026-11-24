// Sends an approved post to its network through the official API: once, with a record of what happened.
// Used by "Publish now" and by the scheduled job for posts whose planned time has come.
import "server-only";
import {mutateMedia} from "../mediaServer";
import {ownedLibrary} from "../outreachServer";
import {recordAudit} from "../auditServer";
import {supabaseRequest} from "../db";
import {socialDigest} from "../socialServer";
import {studioState} from "../domain/socialStudio";
import {postIssues} from "../domain/socialPublishing";
import type {CRMLibrary} from "../domain/crmLibrary";
import type {SocialPost} from "../types";
import {connectionKey,liveSecret,recordConnectionError} from "./connections";
import {PUBLISHERS,PublishError} from "./publishers";
import {SocialAuthError} from "./oauth";

export class NotReady extends Error{}

/** Everything that must be true before a post may leave the CRM. */
export function publishIssue(data:CRMLibrary,p:SocialPost){
  if(p.stage==="Published")return "This post is already published.";
  if(p.delivery)return p.delivery.status==="pending"?"This post is being sent right now.":"This post was already sent. Check the network before sending again.";
  const digest=socialDigest(p);
  if(!p.review||p.review.digest!==digest||!p.humanApproval||p.humanApproval.digest!==digest)return "AI review and team approval of the current content are required.";
  const studio=studioState(data.socialStudio);
  if(studio.settings[p.clientId]?.requireClientApproval&&studio.threads[p.id]?.clientApproval?.digest!==digest)return "This client signs off every post. Record the client's approval first.";
  const problems=postIssues(p);if(problems.length)return problems.join(" ");
  if(!data.socialConnections?.[connectionKey(p.clientId,p.platform)])return `Connect the client's ${p.platform} account first.`;
  return null;
}

export async function publishPost(owner:string,postId:string,actor:{id:string;kind:"human"|"automation"}):Promise<{url?:string}>{
  const data=await ownedLibrary(owner),post=data?.socialPosts.find(p=>p.id===postId);
  if(!data||!post)throw new NotReady("Post not found in this account.");
  const issue=publishIssue(data,post);if(issue)throw new NotReady(issue);
  const connection=data.socialConnections![connectionKey(post.clientId,post.platform)],key=crypto.randomUUID(),at=new Date().toISOString(),digest=socialDigest(post);

  // Claim the post first, so a double click or two scheduler passes can never post it twice.
  await mutateMedia(owner,key,d=>{const p=d.socialPosts.find(x=>x.id===postId);
    if(!p||p.delivery||p.stage==="Published"||socialDigest(p)!==digest)throw new NotReady("The post changed or is already being sent. Reopen it and try again.");
    p.delivery={key,status:"pending",at};delete p.publishError;return d;});

  const finish=(change:(p:SocialPost,d:CRMLibrary)=>void)=>mutateMedia(owner,crypto.randomUUID(),d=>{const p=d.socialPosts.find(x=>x.id===postId);if(p&&p.delivery?.key===key)change(p,d);return d;});
  try{
    const secret=await liveSecret(owner,connection);
    const result=await PUBLISHERS[post.platform](post,secret);
    const done=new Date().toISOString();
    await finish((p,d)=>{
      p.delivery={key,status:"accepted",providerId:result.id,...(result.url?{url:result.url}:{}),at:done};p.stage="Published";p.publishedAt=done;
      d.activities.unshift({id:crypto.randomUUID(),at:done,actor:actor.kind==="human"?"human":"system",actorId:actor.id,entity:"social",entityId:p.id,action:`Published to ${p.platform}`,detail:p.title});d.activities=d.activities.slice(0,2000);
      recordAudit(d,{actor:actor.kind==="human"?"human":"api",actorId:actor.id,entity:"social",entityId:p.id,clientId:p.clientId,action:`Published to ${p.platform} through its official API`,after:result.url??result.id,outcome:"Published",detail:p.title});
    });
    return {url:result.url};
  }catch(error){
    const message=error instanceof Error?error.message:"The network could not be reached.";
    const definite=!(error instanceof PublishError)||error.definite;
    if((error instanceof PublishError&&error.reconnect)||(error instanceof SocialAuthError&&error.reconnect))await recordConnectionError(owner,connection,"Access was revoked or expired. Connect this account again.");
    await finish(p=>{
      if(definite){delete p.delivery;p.publishError={at:new Date().toISOString(),message:message.slice(0,400)};}
      else{p.delivery={key,status:"unknown",at:new Date().toISOString()};p.publishError={at:new Date().toISOString(),message:"The network did not confirm in time. It may have posted: check the account before sending again."};}
    }).catch(()=>undefined);
    throw new PublishError(definite?`${post.platform} did not publish: ${message}`:p0(post.platform),definite);
  }
}
const p0=(n:string)=>`${n} did not confirm in time. It may have posted: check the account before sending again.`;

/** Accounts that have at least one connected social account. */
export async function accountsWithSocial(limit=500){
  const rows=await supabaseRequest<{owner_id:string}[]>("crm_libraries",{query:{select:"owner_id","data->socialConnections":"not.is.null",limit:String(limit)}});
  return rows.map(r=>r.owner_id);
}
/** Publishes posts whose planned time has passed, a few per pass. Posts that cannot go yet keep their reason on the post. */
export async function publishDue(owner:string,max=5,now=Date.now()){
  const data=await ownedLibrary(owner);if(!data)return {sent:0,failed:0};
  const due=data.socialPosts.filter(p=>p.stage==="Scheduled"&&p.scheduledAt&&Date.parse(p.scheduledAt)<=now&&!p.delivery&&!p.publishError&&data.socialConnections?.[connectionKey(p.clientId,p.platform)]).slice(0,max);
  let sent=0,failed=0;
  for(const p of due){
    try{await publishPost(owner,p.id,{id:p.humanApproval?.by??owner,kind:"automation"});sent++;}
    catch(error){failed++;
      if(error instanceof NotReady)await mutateMedia(owner,crypto.randomUUID(),d=>{const x=d.socialPosts.find(y=>y.id===p.id);if(x&&!x.delivery)x.publishError={at:new Date().toISOString(),message:error.message};return d;}).catch(()=>undefined);}
  }
  return {sent,failed};
}
