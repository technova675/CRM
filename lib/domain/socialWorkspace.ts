import {z} from "zod";
import type {SocialPost} from "../types.ts";

export const socialPlatforms=["Instagram","LinkedIn","Facebook","X","YouTube"] as const;
export const socialFormats=["Reel","Carousel","Static","Story","Text","Short"] as const;
export const socialDraftSchema=z.object({
  clientId:z.string().min(1).max(150),platform:z.enum(socialPlatforms),format:z.enum(socialFormats),
  title:z.string().trim().min(1).max(300),pillar:z.string().trim().min(1).max(200),
  hook:z.string().max(2000),caption:z.string().max(15000),hashtags:z.array(z.string().max(100)).max(40),
  brief:z.string().max(12000).default(""),strategyId:z.string().max(150).optional(),contentPlan:z.string().max(12000).default(""),
  mediaUrls:z.array(z.string().url().max(2000).refine(s=>s.startsWith("https://"))).max(10).default([]),
});
export const socialGenerationSchema=z.object({clientId:z.string().min(1).max(150),platform:z.enum(socialPlatforms),format:z.enum(socialFormats),brief:z.string().trim().min(10).max(12000),strategyId:z.string().max(150).optional(),count:z.number().int().min(1).max(8)});
export const socialOutputSchema=z.object({posts:z.array(z.object({title:z.string().min(1).max(300),pillar:z.string().min(1).max(200),hook:z.string().min(1).max(2000),caption:z.string().min(1).max(15000),hashtags:z.array(z.string().max(100)).max(40),contentPlan:z.string().min(1).max(12000)})).min(1).max(8)});
export const socialReviewSchema=z.object({score:z.number().int().min(0).max(100),notes:z.array(z.string().min(1).max(2000)).min(1).max(10)});
const metric=z.number().int().min(0).max(1e12).nullable();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
export const socialAnalyticsSchema=z.object({start:date,end:date,reach:metric,impressions:metric,likes:metric,comments:metric,shares:metric,saves:metric}).refine(v=>v.start<=v.end,"End must follow start");
export const socialEvidenceSchema=z.array(z.object({url:z.string().url().max(2000).refine(s=>/^https:\/\//.test(s)),observedAt:z.string().datetime(),observation:z.string().trim().min(5).max(5000),kind:z.enum(["Trend","Competitor"])})).max(30);
export const socialAnalysisSchema=z.object({summary:z.string().max(4000),competitors:z.array(z.string().max(2000)).max(10),gaps:z.array(z.string().max(2000)).max(10),trends:z.array(z.string().max(2000)).max(10),performance:z.array(z.string().max(2000)).max(10),nextIdeas:z.array(z.string().max(2000)).max(10)});

// Fixed order and explicit fields keep approvals bound to the exact copy and destination.
export function socialContent(post:SocialPost){return JSON.stringify({clientId:post.clientId,platform:post.platform,format:post.format,title:post.title,pillar:post.pillar,hook:post.hook,caption:post.caption,hashtags:post.hashtags,brief:post.brief??"",strategyId:post.strategyId??"",contentPlan:post.contentPlan??"",mediaUrls:post.mediaUrls??[]});}
export function editableSocial(post:SocialPost,patch:Partial<SocialPost>,at:string):SocialPost {
  if(post.stage==="Published"||post.delivery)throw new Error("Published or dispatched posts are locked. Create a new draft to change the content.");
  return {...post,...patch,workflowVersion:2,stage:"Draft",updatedAt:at,review:undefined,aiReview:undefined,humanApproval:undefined,scheduledAt:undefined,scheduleTimezone:undefined};
}
export function socialScheduleIssue(post:SocialPost,digest:string,at:string,timezone:string,now=Date.now()){
  if(!post.review||post.review.digest!==digest||!post.humanApproval||post.humanApproval.digest!==digest)return "AI review and human approval of the current content are required.";
  if(!Number.isFinite(Date.parse(at))||Date.parse(at)<=now)return "Choose a future date and time.";
  try{new Intl.DateTimeFormat("en",{timeZone:timezone}).format();}catch{return "Choose a valid IANA time zone.";}
  return null;
}
export function socialPerformance(post:SocialPost){
  const a=post.analytics;if(!a)return {engagements:null,rate:null};
  const all=[a.likes,a.comments,a.shares,a.saves];
  const engagements=all.every(v=>v!==null)?all.reduce<number>((s,v)=>s+(v??0),0):null;
  return {engagements,rate:engagements!==null&&a.impressions!==null&&a.impressions>0?engagements/a.impressions*100:null};
}
