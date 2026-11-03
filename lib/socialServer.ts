import {createHash} from "node:crypto";
import type {SocialPost} from "./types";
import {socialContent} from "./domain/socialWorkspace";
export const socialDigest=(post:SocialPost)=>createHash("sha256").update(socialContent(post)).digest("hex");
export function socialConnectorConfigured(){try{const u=new URL(process.env.SOCIAL_CONNECTOR_URL??"");return u.protocol==="https:"&&!u.username&&!u.password&&!!process.env.SOCIAL_CONNECTOR_TOKEN;}catch{return false;}}
export async function socialConnector(path:"connections"|"research"|"schedule",ownerId:string,body?:unknown){
 if(!socialConnectorConfigured())throw new Error("An authorized social connector is not configured. Your content is saved; publishing has not occurred.");
 const url=new URL(path,(process.env.SOCIAL_CONNECTOR_URL??"").replace(/\/?$/,"/"));
 if(!body)url.searchParams.set("ownerId",ownerId);
 const response=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${process.env.SOCIAL_CONNECTOR_TOKEN}`,"Content-Type":"application/json"},body:body?JSON.stringify({ownerId,...body as object}):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error("The social connector could not confirm this request.");return response.json();
}
export function publicationURL(platform:SocialPost["platform"],value:string){try{const url=new URL(value);const hosts={Instagram:["instagram.com"],Facebook:["facebook.com","fb.watch"],LinkedIn:["linkedin.com"],X:["x.com","twitter.com"],YouTube:["youtube.com","youtu.be"]};const host=url.hostname.replace(/^www\./,"");return url.protocol==="https:"&&!url.username&&!url.password&&hosts[platform].includes(host)&&url.pathname!=="/"?url.href:null;}catch{return null;}}
