import { z } from "zod";
import type { CRMLibrary } from "./crmLibrary";

export const reviewFormats=["Image","Video","Copy","Ad","Landing page","Campaign"] as const;
export const revisionInput=z.object({
  title:z.string().trim().min(1).max(180),
  url:z.string().trim().max(1800).refine(value=>{
    if(!value)return true;
    try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}
  }),
  copy:z.string().trim().max(5000),
}).refine(v=>!!(v.url||v.copy),"Provide a preview link or review copy.");
export type ReviewContent=z.infer<typeof revisionInput>;
export type ReviewDecision="Approved"|"Changes requested";
export type Revision=ReviewContent & {version:number;at:string;comments:{id:string;by:"Team"|"Client";text:string;at:string}[];decision?:{status:ReviewDecision;by:"Team"|"Client";at:string}};
export type CreativeReview={id:string;clientId:string;format:typeof reviewFormats[number];audience:"Team"|"Client";revisions:Revision[];archived?:boolean};
export class ReviewError extends Error{
  readonly status:number;
  constructor(message:string,status=400){super(message);this.status=status;}
}

export function addReviewRevision(item:CreativeReview,content:ReviewContent,expected:number){
  if(item.archived||item.revisions.at(-1)?.version!==expected)throw new ReviewError("This review changed. Reload before adding a version.",409);
  if(item.revisions.length>=40)throw new ReviewError("This review has reached its version limit.");
  item.revisions.push({...content,version:expected+1,at:new Date().toISOString(),comments:[]});
}
export function reviewResponse(data:CRMLibrary,id:string,version:number,by:"Team"|"Client",text:string,decision?:ReviewDecision,clientId?:string){
  const item=data.creativeReviews?.find(r=>r.id===id&&(!clientId||r.clientId===clientId&&r.audience==="Client")&&!r.archived);
  if(!item||!data.clients.some(c=>c.id===item.clientId))throw new ReviewError("Review not found.",404);
  if(decision&&item.audience!==by)throw new ReviewError("Only the requested reviewer can record a decision.",403);
  const current=item.revisions.at(-1);
  if(!current||current.version!==version)throw new ReviewError("A newer version is available. Reload to review it.",409);
  if(current.decision)throw new ReviewError("This version already has a decision. Submit a new version for another review.",409);
  if(decision==="Changes requested"&&!text)throw new ReviewError("Describe the changes requested.");
  if(text){
    if(current.comments.length>=100)throw new ReviewError("This version has reached its comment limit.");
    current.comments.push({id:crypto.randomUUID(),by,text,at:new Date().toISOString()});
  }
  if(decision)current.decision={status:decision,by,at:new Date().toISOString()};
}
export const reviewResponseInput=z.object({
  id:z.string().uuid(),version:z.number().int().min(1).max(40),
  text:z.string().trim().max(2000),decision:z.enum(["Approved","Changes requested"]).optional(),
}).refine(v=>!!(v.text||v.decision),"Enter a comment or a decision.");
