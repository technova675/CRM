import {z} from "zod";
import {socialPlatforms,socialFormats} from "./socialWorkspace.ts";
import type {SocialPost} from "../types.ts";

/**
 * Server-owned Social workspace data: account profiles and audits, AI strategies, imported results, approval threads,
 * generated images and AI recommendations. It lives beside the CRM library (like aiVisibility) so a browser save can
 * never overwrite it; the browser reads it from /api/social/studio.
 */
export type Platform=typeof socialPlatforms[number];
export const SOCIAL_GOALS=["Brand awareness","Engagement growth","Lead generation","Community growth","Sales"] as const;
export const STUDIO_TOOLS=["script","carousel","story","poll","headlines","cta","hashtags","repurpose","translate","voice-check"] as const;
export type StudioTool=typeof STUDIO_TOOLS[number];

export interface AccountAudit{at:string;source:string;score:number;summary:string;bioAnalysis:string[];suggestedBios:string[];profile:string[];content:string[];frequency:string[];growth:string[];actions:{priority:"High"|"Medium"|"Low";action:string}[]}
export interface SocialAccount{id:string;clientId:string;platform:Platform;handle:string;url:string;bio:string;category:string;followers:number|null;following:number|null;postsCount:number|null;profileImage:string;notes:string;snapshots:{date:string;followers:number}[];audit?:AccountAudit;updatedAt:string}
export interface SocialPlan{id:string;clientId:string;at:string;source:string;by:string;input:z.infer<typeof planInputSchema>;output:z.infer<typeof planOutputSchema>;claimWarnings?:string[]}
export interface MetricRow{id:string;clientId:string;platform:Platform;postedAt:string;permalink:string;type:string;caption:string;reach:number|null;impressions:number|null;views:number|null;likes:number|null;comments:number|null;shares:number|null;saves:number|null;follows:number|null;profileVisits:number|null;linkClicks:number|null;source:string;importedAt:string}
export interface ThreadEntry{id:string;at:string;by:string;byName:string;kind:"comment"|"revision"|"client-approval";text:string}
export interface PostVersion{at:string;by:string;title:string;hook:string;caption:string;hashtags:string[];contentPlan:string;platform:string;format:string}
export interface SocialImage{id:string;clientId:string;postId?:string;prompt:string;fileId:string;sha256:string;size:number;at:string;source:string}
export interface SocialRecommendation{id:string;clientId:string;at:string;source:string;output:z.infer<typeof recommendationSchema>}
export interface ClientSocialSettings{requireClientApproval:boolean;brandVoice:string}
export interface SocialStudioState{accounts:SocialAccount[];plans:SocialPlan[];metrics:MetricRow[];threads:Record<string,{entries:ThreadEntry[];versions:PostVersion[];clientApproval?:{at:string;by:string;name:string;channel:string;digest:string}}>;images:SocialImage[];recommendations:SocialRecommendation[];settings:Record<string,ClientSocialSettings>}

export const emptyStudio=():SocialStudioState=>({accounts:[],plans:[],metrics:[],threads:{},images:[],recommendations:[],settings:{}});
export function studioState(value:unknown):SocialStudioState{const v=(value??{}) as Partial<SocialStudioState>;return {...emptyStudio(),...v,threads:v.threads??{},settings:v.settings??{}};}
export const LIMITS={accountsPerClient:20,plansPerClient:10,metricsPerClient:2000,entriesPerPost:100,versionsPerPost:20,imagesPerClient:200,recommendationsPerClient:10,snapshots:120};

const count=z.number().int().min(0).max(1e10).nullable();
export const accountInputSchema=z.object({id:z.string().uuid().optional(),clientId:z.string().min(1).max(150),platform:z.enum(socialPlatforms),handle:z.string().trim().min(1).max(100),
  url:z.string().trim().max(500).refine(v=>!v||/^https:\/\//.test(v)).default(""),bio:z.string().max(2200).default(""),category:z.string().max(100).default(""),
  followers:count.default(null),following:count.default(null),postsCount:count.default(null),profileImage:z.string().max(500).default(""),notes:z.string().max(2000).default("")});
export const auditOutputSchema=z.object({score:z.number().int().min(0).max(100),summary:z.string().max(1500),bioAnalysis:z.array(z.string().max(500)).max(6),suggestedBios:z.array(z.string().max(300)).max(3),
  profile:z.array(z.string().max(500)).max(6),content:z.array(z.string().max(500)).max(6),frequency:z.array(z.string().max(500)).max(5),growth:z.array(z.string().max(500)).max(5),
  actions:z.array(z.object({priority:z.enum(["High","Medium","Low"]),action:z.string().max(400)})).max(8)});
export const planInputSchema=z.object({clientId:z.string().min(1).max(150),goal:z.enum(SOCIAL_GOALS),platforms:z.array(z.enum(socialPlatforms)).min(1).max(5),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),postsPerWeek:z.number().int().min(1).max(21),notes:z.string().max(3000).default("")});
export const planOutputSchema=z.object({positioning:z.string().max(1200),audience:z.string().max(1200),
  objectives:z.array(z.object({objective:z.string().max(300),kpi:z.string().max(200),target:z.string().max(200)})).min(1).max(6),
  personas:z.array(z.object({name:z.string().max(80),description:z.string().max(500),goals:z.array(z.string().max(200)).max(4),painPoints:z.array(z.string().max(200)).max(4),contentPreferences:z.array(z.string().max(200)).max(4)})).min(1).max(4),
  pillars:z.array(z.object({name:z.string().max(80),purpose:z.string().max(300),share:z.number().int().min(0).max(100),examples:z.array(z.string().max(200)).max(4)})).min(2).max(6),
  platforms:z.array(z.object({platform:z.string().max(40),role:z.string().max(300),cadence:z.string().max(200),formats:z.array(z.string().max(40)).max(6),tone:z.string().max(200)})).min(1).max(5),
  weeks:z.array(z.object({week:z.number().int().min(1).max(5),theme:z.string().max(200),posts:z.array(z.object({day:z.enum(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]),platform:z.enum(socialPlatforms),format:z.enum(socialFormats),pillar:z.string().max(80),idea:z.string().max(300)})).max(21)})).min(1).max(5),
  campaigns:z.array(z.object({name:z.string().max(120),goal:z.string().max(200),idea:z.string().max(400)})).max(4),
  growthTactics:z.array(z.string().max(300)).max(6)});
export const studioInputSchema=z.object({clientId:z.string().min(1).max(150),tool:z.enum(STUDIO_TOOLS),platform:z.enum(socialPlatforms),platforms:z.array(z.enum(socialPlatforms)).max(5).default([]),
  topic:z.string().trim().min(3).max(8000),language:z.string().max(40).default("English"),count:z.number().int().min(1).max(10).default(5)});
export const studioOutputSchema=z.object({title:z.string().max(300),hook:z.string().max(600),caption:z.string().max(5000),cta:z.string().max(300),hashtags:z.array(z.string().max(80)).max(30),
  plan:z.string().max(8000),items:z.array(z.object({label:z.string().max(120),text:z.string().max(1500),options:z.array(z.string().max(200)).max(6)})).max(12),
  versions:z.array(z.object({platform:z.string().max(40),format:z.string().max(40),title:z.string().max(300),hook:z.string().max(600),caption:z.string().max(5000),hashtags:z.array(z.string().max(80)).max(30)})).max(5),
  score:z.number().int().min(0).max(100).nullable(),issues:z.array(z.string().max(500)).max(10)});
export const recommendationSchema=z.object({summary:z.string().max(1500),whatWorks:z.array(z.string().max(500)).max(6),underperforming:z.array(z.string().max(500)).max(6),
  improvements:z.array(z.string().max(500)).max(8),postingTimes:z.array(z.string().max(400)).max(4),formats:z.array(z.string().max(400)).max(4),frequency:z.array(z.string().max(400)).max(3),
  nextMonth:z.array(z.string().max(500)).max(8),actionPlan:z.array(z.object({priority:z.enum(["High","Medium","Low"]),action:z.string().max(400),why:z.string().max(400)})).max(8)});

export const STUDIO_TASKS:Record<StudioTool,string>={
  script:"Write a short-form video script for the topic: title, hook (first 2 seconds), plan as numbered scenes with time range, visual, voice-over and on-screen text, a cta, caption and hashtags. Describe audio as a mood, never as a named trending track.",
  carousel:"Write a carousel: title, hook for slide 1, plan as numbered slides (headline, body text, visual direction), a final cta slide, caption and hashtags.",
  story:"Write an Instagram/Facebook Story sequence: plan as numbered frames with visual, on-screen text and an interactive sticker (poll, quiz, question, link) where useful; title and cta.",
  poll:"Write count interactive ideas in items: label is Poll, Quiz or Question box, text is the question, options are the answer choices (empty for question boxes). Keep them on-brand and easy to answer.",
  headlines:"Write count distinct hooks or headlines in items (label: the angle, text: the hook). Vary angles: curiosity, problem, benefit, number, story, contrarian. No clickbait or false claims.",
  cta:"Write count distinct calls to action in items (label: the goal such as Shop, Save, Comment, DM, Visit, Book; text: the CTA line) that fit the platform.",
  hashtags:"Research hashtags for the topic and give 3 to 5 groups in items: label is the group (Brand, Niche, Community, Location, Broad), text explains when to use it, options hold the hashtags. Do not claim any hashtag is trending; volumes are unknown.",
  repurpose:"Repurpose the source content into exactly one version per platform in task.platforms (and no others) in versions, adapting length, tone, format and hashtags to each platform's norms. Keep facts identical to the source. Leave title, hook, caption, cta and plan empty.",
  translate:"Translate and culturally adapt the content into the requested language: title, hook, caption and hashtags. Keep brand names, prices and offers unchanged. Write naturally, not word for word.",
  "voice-check":"Check the supplied text against the brand voice and brief: score 0-100 for brand voice consistency (editorial opinion), issues listing each problem (tone, claims, grammar, jargon, platform fit), and caption holding a rewritten version in the brand voice.",
};

// ---------- CSV import (Instagram / Facebook / Meta Business Suite / LinkedIn exports) ----------
export function parseCSV(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
  const src=text.replace(/^﻿/,"");
  for(let i=0;i<src.length;i++){const c=src[i];
    if(quoted){if(c==='"'){if(src[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;continue;}
    if(c==='"')quoted=true;else if(c===","||c==="\t"){row.push(field);field="";}else if(c==="\n"||c==="\r"){if(c==="\r"&&src[i+1]==="\n")i++;row.push(field);field="";if(row.some(v=>v.trim()))rows.push(row);row=[];}else field+=c;}
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
const ALIASES:Record<string,string[]>={
  postId:["post id","media id","id"],permalink:["permalink","post link","link","url","post url"],type:["post type","media type","type","content type","media product type"],
  caption:["description","caption","title","post message","message","post title","commentary"],postedAt:["publish time","published","publish date","date","created time","post time","posted","created date","date posted"],
  reach:["reach","accounts reached","post reach"],impressions:["impressions","post impressions"],views:["views","plays","video views","reel plays"],
  likes:["likes","reactions","post reactions","reactions, comments and shares"],comments:["comments"],shares:["shares","reposts"],saves:["saves","saved"],
  follows:["follows","new followers"],profileVisits:["profile visits","profile activity"],linkClicks:["link clicks","clicks","post clicks"],
};
const norm=(h:string)=>h.toLowerCase().replace(/[^a-z0-9 ,]/g," ").replace(/\s+/g," ").trim();
export function columnMap(headers:string[]){
  const map:Record<string,number>={},used=new Set<number>();
  for(const [field,names] of Object.entries(ALIASES))for(const name of names){const i=headers.findIndex((h,idx)=>!used.has(idx)&&norm(h)===name);if(i>=0){map[field]=i;used.add(i);break;}}
  return {map,ignored:headers.filter((_,i)=>!used.has(i))};
}
const number=(v:string|undefined)=>{if(v==null)return null;const t=v.replace(/[,\s₹%]/g,"");if(!t||t==="-"||/^n\/?a$/i.test(t))return null;const n=Number(t);return Number.isFinite(n)&&n>=0?Math.round(n):null;};
/**
 * Meta exports use MM/DD/YYYY HH:mm; others use ISO. Day-first is used only when the first number cannot be a month.
 * Times without a zone are the account's local time (India by default), so the result is the same on any server.
 */
export function parseDate(v:string,offset="+05:30"):string|null{
  const t=v.trim();if(!t)return null;
  const m=t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?$/i);
  if(m){let [a,b]=[+m[1],+m[2]];if(a>12&&b<=12)[a,b]=[b,a];let h=m[4]?+m[4]:12;const min=m[5]?+m[5]:0;if(m[6]){h=h%12+(/pm/i.test(m[6])?12:0);}
    const pad=(n:number)=>String(n).padStart(2,"0"),d=new Date(`${m[3]}-${pad(a)}-${pad(b)}T${pad(h)}:${pad(min)}:00${offset}`);
    return Number.isFinite(d.getTime())&&new Date(`${m[3]}-${pad(a)}-${pad(b)}T00:00:00Z`).getUTCMonth()===a-1&&new Date(`${m[3]}-${pad(a)}-${pad(b)}T00:00:00Z`).getUTCDate()===b?d.toISOString():null;}
  const local=t.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2})(?::\d{2})?)?$/);if(local){const d=Date.parse(`${local[1]}T${(local[2]??"12:00").padStart(5,"0")}:00${offset}`);return Number.isFinite(d)?new Date(d).toISOString():null;}
  const d=Date.parse(t);return Number.isFinite(d)?new Date(d).toISOString():null;
}
export function importMetrics(text:string,clientId:string,platform:Platform,at:string){
  const rows=parseCSV(text);if(rows.length<2)return {rows:[] as MetricRow[],skipped:0,ignored:[] as string[],error:"The file has no data rows."};
  const {map,ignored}=columnMap(rows[0]);
  if(map.postedAt===undefined)return {rows:[],skipped:0,ignored,error:"No publish date column found. Export with a column such as Publish time or Date."};
  if(!["reach","impressions","views","likes"].some(k=>map[k]!==undefined))return {rows:[],skipped:0,ignored,error:"No result columns found, such as Reach, Views or Likes."};
  const out:MetricRow[]=[];let skipped=0;
  for(const r of rows.slice(1)){const postedAt=parseDate(r[map.postedAt]??"");if(!postedAt){skipped++;continue;}
    const get=(k:string)=>map[k]===undefined?null:number(r[map[k]]);const text=(k:string)=>map[k]===undefined?"":(r[map[k]]??"").trim();
    const key=text("postId")||text("permalink")||postedAt+"|"+text("caption").slice(0,60);
    out.push({id:`${platform}:${key}`.slice(0,300),clientId,platform,postedAt,permalink:/^https:\/\//.test(text("permalink"))?text("permalink").slice(0,500):"",type:normalType(text("type")),caption:text("caption").slice(0,600),
      reach:get("reach"),impressions:get("impressions"),views:get("views"),likes:get("likes"),comments:get("comments"),shares:get("shares"),saves:get("saves"),follows:get("follows"),profileVisits:get("profileVisits"),linkClicks:get("linkClicks"),source:"CSV import",importedAt:at});}
  return {rows:out,skipped,ignored,error:out.length?null:"No rows had a readable publish date."};
}
function normalType(t:string){const v=t.toLowerCase();if(/reel|video|clip/.test(v))return "Reel";if(/carousel|album/.test(v))return "Carousel";if(/story/.test(v))return "Story";if(/text|status|article/.test(v))return "Text";if(/image|photo|static|post/.test(v)||!v)return v?"Static":"Unknown";return t.slice(0,40);}
/** New imports replace rows with the same post id; older rows are kept. */
export function mergeMetrics(existing:MetricRow[],incoming:MetricRow[],clientId:string){
  const byId=new Map(existing.filter(r=>r.clientId===clientId).map(r=>[r.id,r]));for(const r of incoming)byId.set(r.id,r);
  const mine=[...byId.values()].sort((a,b)=>b.postedAt.localeCompare(a.postedAt)).slice(0,LIMITS.metricsPerClient);
  return [...existing.filter(r=>r.clientId!==clientId),...mine];
}

// ---------- Analytics (deterministic; AI never computes these numbers) ----------
export interface PostResult{id:string;title:string;platform:string;type:string;postedAt:string;reach:number|null;views:number|null;impressions:number|null;engagements:number|null;rate:number|null;permalink:string;source:string}
const engagementsOf=(r:{likes:number|null;comments:number|null;shares:number|null;saves:number|null})=>{const parts=[r.likes,r.comments,r.shares,r.saves].filter((v):v is number=>v!==null);return parts.length?parts.reduce((s,v)=>s+v,0):null;};
/** Engagement rate by reach (the Instagram convention); falls back to views, then impressions, when reach is missing. */
export function rateOf(engagements:number|null,reach:number|null,views:number|null,impressions:number|null){const base=reach||views||impressions;return engagements!==null&&base?engagements/base*100:null;}
export function postResults(metrics:MetricRow[],posts:SocialPost[],clientId:string):PostResult[]{
  const imported=metrics.filter(r=>r.clientId===clientId).map(r=>{const e=engagementsOf(r);return {id:r.id,title:r.caption.split(/\n/)[0].slice(0,90)||"Untitled post",platform:r.platform,type:r.type,postedAt:r.postedAt,reach:r.reach,views:r.views,impressions:r.impressions,engagements:e,rate:rateOf(e,r.reach,r.views,r.impressions),permalink:r.permalink,source:r.source};});
  const known=new Set(imported.map(r=>r.permalink).filter(Boolean));
  const recorded=posts.filter(p=>p.clientId===clientId&&p.stage==="Published"&&p.analytics&&!known.has(p.publication?.url??"")).map(p=>{const a=p.analytics!,e=engagementsOf(a);
    return {id:p.id,title:p.title,platform:p.platform,type:p.format,postedAt:p.publishedAt??a.start,reach:a.reach,views:null,impressions:a.impressions,engagements:e,rate:rateOf(e,a.reach,null,a.impressions),permalink:p.publication?.url??"",source:"Entered in post"};});
  return [...imported,...recorded].sort((a,b)=>b.postedAt.localeCompare(a.postedAt));
}
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const slot=(h:number)=>h<6?"Night (0–6)":h<12?"Morning (6–12)":h<17?"Afternoon (12–17)":h<21?"Evening (17–21)":"Late (21–24)";
const avg=(v:number[])=>v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
function groupBy(rows:PostResult[],key:(r:PostResult)=>string){const m=new Map<string,PostResult[]>();rows.forEach(r=>m.set(key(r),[...(m.get(key(r))??[]),r]));
  return [...m.entries()].map(([name,list])=>({name,posts:list.length,avgRate:avg(list.map(r=>r.rate).filter((v):v is number=>v!==null)),avgReach:avg(list.map(r=>r.reach).filter((v):v is number=>v!==null))})).sort((a,b)=>(b.avgRate??-1)-(a.avgRate??-1));}
export function analyticsSummary(results:PostResult[],timeZone="Asia/Kolkata"){
  const rated=results.filter(r=>r.rate!==null),local=(iso:string)=>{const parts=new Intl.DateTimeFormat("en-GB",{timeZone,weekday:"short",hour:"numeric",hour12:false}).formatToParts(new Date(iso));return {day:parts.find(p=>p.type==="weekday")?.value??"",hour:Number(parts.find(p=>p.type==="hour")?.value??0)%24};};
  const times=results.map(r=>Date.parse(r.postedAt)).filter(Number.isFinite),spanDays=times.length>1?(Math.max(...times)-Math.min(...times))/864e5:0;
  const sorted=rated.slice().sort((a,b)=>b.rate!-a.rate!);
  return {posts:results.length,rated:rated.length,avgRate:avg(rated.map(r=>r.rate!)),totalReach:results.reduce((s,r)=>s+(r.reach??0),0),totalEngagements:results.reduce((s,r)=>s+(r.engagements??0),0),
    postsPerWeek:spanDays>=7?results.length/(spanDays/7):null,best:sorted.slice(0,5),worst:sorted.slice(5).slice(-5).reverse(),
    byFormat:groupBy(results,r=>r.type||"Unknown"),byPlatform:groupBy(results,r=>r.platform),byDay:groupBy(results,r=>local(r.postedAt).day).sort((a,b)=>DAYS.indexOf(a.name)-DAYS.indexOf(b.name)),byTime:groupBy(results,r=>slot(local(r.postedAt).hour))};
}
export function followerGrowth(account:SocialAccount){const s=account.snapshots.slice().sort((a,b)=>a.date.localeCompare(b.date));if(s.length<2)return null;const first=s[0],last=s[s.length-1];return {from:first.date,to:last.date,change:last.followers-first.followers,percent:first.followers?((last.followers-first.followers)/first.followers)*100:null};}
/** Facts the audit and recommendations are allowed to rely on, computed here so the AI cannot misquote them. */
export function accountFacts(account:SocialAccount,results:PostResult[]){
  const mine=results.filter(r=>r.platform===account.platform),summary=analyticsSummary(mine),growth=followerGrowth(account);
  return {platform:account.platform,handle:account.handle,followers:account.followers,following:account.following,postsCount:account.postsCount,bioLength:account.bio.length,hasLink:/https?:\/\/|www\./i.test(account.bio)||!!account.url,
    measuredPosts:summary.posts,avgEngagementRate:summary.avgRate===null?null:Math.round(summary.avgRate*100)/100,postsPerWeek:summary.postsPerWeek===null?null:Math.round(summary.postsPerWeek*10)/10,
    bestFormat:summary.byFormat[0]?.avgRate!=null?summary.byFormat[0].name:null,bestDay:summary.byDay.slice().sort((a,b)=>(b.avgRate??-1)-(a.avgRate??-1))[0]?.name??null,bestTime:summary.byTime[0]?.name??null,followerGrowth:growth};
}
/** Rows for a bulk upload: title, platform, format, caption, hashtags, pillar, campaign. Invalid rows are reported, not guessed. */
export function bulkPosts(text:string){
  const rows=parseCSV(text);if(rows.length<2)return {posts:[],errors:["The file has no data rows."]};
  const head=rows[0].map(norm),col=(...names:string[])=>head.findIndex(h=>names.includes(h));
  const c={title:col("title","post title","name"),platform:col("platform","channel"),format:col("format","type","post type"),caption:col("caption","copy","text"),hook:col("hook","headline"),hashtags:col("hashtags","tags"),pillar:col("pillar","content pillar","category"),campaign:col("campaign")};
  if(c.title<0)return {posts:[],errors:["Add a Title column."]};
  const errors:string[]=[],posts:{title:string;platform:Platform;format:typeof socialFormats[number];caption:string;hook:string;hashtags:string[];pillar:string;campaign:string}[]=[];
  rows.slice(1,201).forEach((r,i)=>{const cell=(k:keyof typeof c)=>c[k]<0?"":(r[c[k]]??"").trim();const title=cell("title");if(!title){errors.push(`Row ${i+2}: missing title.`);return;}
    const platform=socialPlatforms.find(p=>p.toLowerCase()===(cell("platform")||"instagram").toLowerCase()||(p==="X"&&/twitter/i.test(cell("platform"))));const format=socialFormats.find(f=>f.toLowerCase()===(cell("format")||"static").toLowerCase());
    if(!platform){errors.push(`Row ${i+2}: platform must be one of ${socialPlatforms.join(", ")}.`);return;}if(!format){errors.push(`Row ${i+2}: format must be one of ${socialFormats.join(", ")}.`);return;}
    posts.push({title:title.slice(0,300),platform,format,caption:cell("caption").slice(0,15000),hook:cell("hook").slice(0,2000),hashtags:cell("hashtags").split(/[\s,]+/).filter(Boolean).map(h=>h.startsWith("#")?h:"#"+h).slice(0,40),pillar:(cell("pillar")||"General").slice(0,200),campaign:cell("campaign").slice(0,120)});});
  if(rows.length>201)errors.push("Only the first 200 rows were read.");
  return {posts,errors};
}

// ---------- Claim check ----------
/** Regulated or trust-sensitive claims that must come from the client, never from the AI. */
const CLAIMS=["cruelty-free","vegan","organic","dermatologist","clinically","certified","paraben-free","sulphate-free","sulfate-free","chemical-free","toxin-free","award-winning","best-selling","bestseller","no. 1","#1 ","guaranteed","100% natural","fda","ayush","ayurvedic","hypoallergenic","non-comedogenic","eco-friendly","sustainable","handmade","doctor recommended","scientifically proven"];
const flat=(v:string)=>v.toLowerCase().replace(/[‐‑–—-]/g,"-").replace(/\s+/g," ");
/** Claims in the AI output that do not appear in the client's own facts, so a person checks them before anything is shared. */
export function unsupportedClaims(output:unknown,facts:string){
  const text=flat(JSON.stringify(output)),known=flat(facts);
  return CLAIMS.filter(c=>text.includes(c)&&!known.includes(c)&&!known.includes(c.replace(/-/g," "))).map(c=>c.trim());
}
