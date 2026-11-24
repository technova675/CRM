import {z} from "zod";
import {reportIdentity,sameOrigin} from "@/lib/auth/server";
import {boundedJSON} from "@/lib/outreachServer";
import {dbError} from "@/lib/db";
import {fetchPublicHtml,firecrawlHtml,publicResearchUrl} from "@/lib/ai/publicResearch";
import {contactPages,contactsFromHtml,mergeContacts,type WebsiteContacts} from "@/lib/domain/leadEnrich";

export const maxDuration=60;
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
const input=z.object({website:z.string().trim().min(3).max(500)});
const hrefs=(html:string)=>[...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
const thin=(c:WebsiteContacts)=>!c.phone&&!c.email&&Object.keys(c.socials).length<2;

// One website read per login at a time, so a double click or a stuck tab cannot spend Firecrawl credits twice.
const running=new Set<string>();

/** Reads a company's own website for the contact details it publishes: phone, email, social profiles and location.
 * The plain reader goes first (free); Firecrawl renders the page only when the plain read is blocked or finds too little. */
export async function POST(req:Request){
  if(!sameOrigin(req))return reply({error:"Request origin is not allowed."},403);
  let userId="",locked=false;
  try{
    userId=(await reportIdentity(req)).userId;
    const parsed=input.safeParse(await boundedJSON(req,2000).catch(()=>null));
    if(!parsed.success)return reply({error:"Enter the company's website."},400);
    let start:URL;try{start=publicResearchUrl(parsed.data.website);}catch{return reply({error:"Enter a public website address, for example https://example.com."},400);}
    if(running.has(userId))return reply({error:"A website is already being read for this login. Try again in a moment."},429);
    running.add(userId);locked=true;
    const signal=AbortSignal.timeout(50000),pages:WebsiteContacts[]=[],notes:string[]=[];let firecrawl=false,links:string[]=[],base=start.href;

    try{const home=await fetchPublicHtml(start.href,signal);base=home.url;pages.push(contactsFromHtml(home.html,home.url));links=hrefs(home.html);}
    catch(error){notes.push(error instanceof Error?error.message:"The website could not be read directly.");}
    if(!pages.length||thin(pages[0])){
      try{const r=await firecrawlHtml(start.href,signal);if(r){firecrawl=true;base=r.url;pages.unshift(contactsFromHtml(r.html,r.url));links=[...r.links,...hrefs(r.html)];}}
      catch(error){notes.push(error instanceof Error?error.message:"Firecrawl could not read the website.");}
    }
    if(!pages.length)return reply({error:"The website could not be read. Check the address, or add the details by hand on the lead.",notes},422);

    // A contact or about page usually carries the phone and email the home page leaves out.
    for(const page of contactPages(links,base)){
      const sofar=mergeContacts(pages);if(sofar.phone&&sofar.email)break;
      try{const p=await fetchPublicHtml(page,signal);pages.push(contactsFromHtml(p.html,p.url));}
      catch{try{const r=await firecrawlHtml(page,signal);if(r){firecrawl=true;pages.push(contactsFromHtml(r.html,r.url));}}catch{/* the home page result still stands */}}
    }
    return reply({contacts:mergeContacts(pages),website:base,firecrawl,notes});
  }catch(error){return dbError(error);}
  finally{if(locked)running.delete(userId);}
}
