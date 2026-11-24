import { Agent } from "undici";
import ipaddr from "ipaddr.js";
import { isIP, type LookupFunction } from "node:net";
import { nat64IPv4, supabaseLookup } from "../auth/networkLookup.ts";
import type { Lead } from "../types";

export function isPublicAddress(address:string){
  try{return ipaddr.process(nat64IPv4(address)??address).range()==="unicast";}catch{return false;}
}
export function publicResearchUrl(value:string){
  if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&!/^https?:\/\//i.test(value))throw new Error("Only public HTTP/HTTPS pages can be researched.");
  const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);
  const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase();
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys()].some(key=>/^(access_token|token|secret|password|api_key|apikey|authorization)$/i.test(key))||(url.port&&!["80","443"].includes(url.port))||host==="localhost"||/\.(localhost|local|internal|test|invalid)$/.test(host)||(isIP(host)&&!isPublicAddress(host)))throw new Error("Only public HTTP/HTTPS pages without credentials can be researched.");
  url.hash="";return url;
}
const publicLookup:LookupFunction=(hostname,options,callback)=>supabaseLookup(hostname,options,(error,address,family)=>{
  if(error){callback(error,[]);return;}
  const addresses=typeof address==="string"?[{address,family:family??0}]:address;
  if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address))){callback(Object.assign(new Error("Private network destination blocked"),{code:"EACCES"}),[]);return;}
  if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
});
const dispatcher=new Agent({connect:{lookup:publicLookup,timeout:6000},autoSelectFamily:true});
export type PublicDocument={id:string;url:string;title:string;text:string;links:string[];status:"ok"|"unavailable";checkedAt:string;reason?:string;tracking?:string[]};
const decode=(text:string)=>text.replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi,entity=>{
  const named:Record<string,string>={"&nbsp;":" ","&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">"};
  if(named[entity.toLowerCase()])return named[entity.toLowerCase()];const n=entity.startsWith("&#x")?parseInt(entity.slice(3),16):parseInt(entity.slice(2),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):" ";
});
export const normalizeEvidence=(text:string)=>decode(text).replace(/\s+/g," ").trim();
export function readablePublicPage(html:string,base:string){
  const title=normalizeEvidence(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??new URL(base).hostname);
  const clean=html.replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ").replace(/<!--[\s\S]*?-->/g," ");
  const text=normalizeEvidence(clean.replace(/<[^>]*>/g," ")).slice(0,14000);
  const links=[...clean.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].flatMap(match=>{try{return[publicResearchUrl(new URL(decode(match[1]),base).href).href];}catch{return[];}});
  return {title,text,links:[...new Set(links)],tracking:[/connect\.facebook\.net|\bfbq\s*\(/i.test(html)?"Meta tracking reference":null,/googletagmanager\.com|\bgtag\s*\(/i.test(html)?"Google tagging reference":null].filter((value):value is string=>!!value)};
}
/** Fetches a public page's HTML through the private-network guard, following up to three redirects. Throws a readable reason on failure. */
export async function fetchPublicHtml(value:string,signal?:AbortSignal,onUrl?:(url:string)=>void):Promise<{url:string;html:string}>{
  let current=value;
  for(let redirects=0;redirects<4;redirects++){
    const url=publicResearchUrl(current);current=url.href;onUrl?.(current);
    if(/\/(?:login|signin|sign-in|authwall|checkpoint|challenge|accounts\/login)(?:\/|$)/i.test(url.pathname))throw new Error("Public content requires login or an access check");
    const response=await fetch(url,{dispatcher,redirect:"manual",cache:"no-store",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),headers:{"User-Agent":"AdbibePublicResearch/1.0",Accept:"text/html,text/plain"}} as RequestInit & {dispatcher:Agent});
    if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get("location");if(!location)throw new Error("Redirect has no public destination");current=new URL(location,url).href;continue;}
    if(!response.ok){await response.body?.cancel();throw new Error(`Public page returned HTTP ${response.status}`);}
    const type=response.headers.get("content-type")??"";if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(type)){await response.body?.cancel();throw new Error("Page is not readable HTML or text");}
    const reader=response.body?.getReader();if(!reader)throw new Error("Page has no readable body");
    let bytes=0,html="";const decoder=new TextDecoder();
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>600000)throw new Error("Public page exceeded the safe read limit");html+=decoder.decode(part.value,{stream:true});}html+=decoder.decode();}catch(error){await reader.cancel();throw error;}
    return{url:current,html};
  }throw new Error("Too many public-page redirects");
}
export async function readPublicDocument(value:string,id:string,signal?:AbortSignal):Promise<PublicDocument>{
  const checkedAt=new Date().toISOString();let current=value;
  try{
    const page=await fetchPublicHtml(value,signal,url=>{current=url;});current=page.url;
    const content=readablePublicPage(page.html,current);
    if(content.text.length<80||(content.text.length<1500&&/captcha|verify.{0,10}human|access denied|just a moment|sign in to|log in to|enable javascript/i.test(content.text)))throw new Error("Public content unavailable, blocked or requires a browser/login");
    return{id,url:current,...content,status:"ok",checkedAt};
  }catch(error){return{id,url:current,title:"Source unavailable",text:"",links:[],status:"unavailable",checkedAt,reason:error instanceof Error&&/public|Private|HTTP|limit|Redirect|redirect|readable|blocked/.test(error.message)?error.message:"Public page could not be reached within the time limit"};}
}

// Firecrawl (free tier) renders JavaScript pages and runs web search. Used only as a
// fallback/extra so credits are spent where the plain reader or Tavily cannot help.
const FIRECRAWL="https://api.firecrawl.dev/v1";
const firecrawlKey=()=>process.env.FIRECRAWL_API_KEY||"";
const markdownToText=(md:string)=>md.replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/\[([^\]]*)\]\([^)]*\)/g,"$1").replace(/[#*_`>|]+/g," ");
async function firecrawlPost<T>(path:string,body:unknown,signal?:AbortSignal):Promise<T|null>{
  const key=firecrawlKey();if(!key)return null;
  try{
    const response=await fetch(`${FIRECRAWL}${path}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),cache:"no-store"});
    if(!response.ok){
      if(response.status===402)throw new Error("Firecrawl credits are exhausted. No paid fallback or top-up was requested.");
      if(response.status===429)throw new Error("Firecrawl request limit reached. Retry research later.");
      if(response.status===401)throw new Error("Firecrawl authorization failed. Check the configured API key.");
      if(response.status===403)throw new Error(`Firecrawl denied access to ${path==="/search"?"public search":"a requested public page"} (HTTP 403). Restricted sources remain unverified.`);
      throw new Error(`Firecrawl source collection returned HTTP ${response.status}.`);
    }
    return await response.json() as T;
  }catch(error){throw new Error(error instanceof Error&&error.message.startsWith("Firecrawl")?error.message:"Firecrawl could not be reached within the source collection time limit.");}
}
async function firecrawlScrape(value:string,id:string,signal?:AbortSignal):Promise<PublicDocument|null>{
  let url:URL;try{url=publicResearchUrl(value);}catch{return null;}
  const result=await firecrawlPost<{success?:boolean;data?:{markdown?:string;links?:string[];metadata?:{title?:string;sourceURL?:string}}}>("/scrape",{url:url.href,formats:["markdown","links"],onlyMainContent:true,timeout:25000},signal);
  const markdown=result?.data?.markdown;if(!result?.success||!markdown)return null;
  const text=normalizeEvidence(markdownToText(markdown)).slice(0,14000);if(text.length<80)return null;
  const links=(result.data?.links??[]).flatMap(link=>{try{return[publicResearchUrl(new URL(link,url).href).href];}catch{return[];}});
  return{id,url:url.href,title:normalizeEvidence(result.data?.metadata?.title??url.hostname),text,links:[...new Set(links)],status:"ok",checkedAt:new Date().toISOString()};
}
/** The rendered HTML of a page via Firecrawl, for sites that build their content with JavaScript or block plain requests. Null when Firecrawl is not configured. */
export async function firecrawlHtml(value:string,signal?:AbortSignal):Promise<{url:string;html:string;links:string[]}|null>{
  const url=publicResearchUrl(value);
  const result=await firecrawlPost<{success?:boolean;data?:{rawHtml?:string;html?:string;links?:string[];metadata?:{sourceURL?:string}}}>("/scrape",{url:url.href,formats:["rawHtml","links"],onlyMainContent:false,timeout:25000},signal);
  const html=result?.data?.rawHtml??result?.data?.html;if(!result?.success||!html)return null;
  return{url:url.href,html,links:result.data?.links??[]};
}
// Plain fetch first (free, unlimited); Firecrawl only when the page is empty, blocked or JS-rendered.
async function readPage(value:string,id:string,signal?:AbortSignal,limitations:string[]=[]):Promise<PublicDocument>{
  const plain=await readPublicDocument(value,id,signal);
  if(plain.status==="ok"&&plain.text.length>=1500)return plain;
  if(!firecrawlKey())return plain;
  try{
    const rendered=await firecrawlScrape(value,id,signal);
    return rendered&&rendered.text.length>(plain.status==="ok"?plain.text.length:0)?rendered:plain;
  }catch(error){limitations.push(error instanceof Error?error.message:"Firecrawl source collection was unavailable.");return plain;}
}
async function firecrawlSearch(query:string,signal?:AbortSignal):Promise<string[]>{
  const result=await firecrawlPost<{data?:{url?:string}[]|{web?:{url?:string}[]}}>("/search",{query,limit:3},signal);
  const items=Array.isArray(result?.data)?result.data:result?.data?.web??[];
  return items.map(item=>item.url).filter((url):url is string=>typeof url==="string");
}

export async function collectPublicEvidence(lead:Pick<Lead,"company"|"website"|"linkedin"|"instagram">,signal?:AbortSignal,options:{searchProvider?:"auto"|"firecrawl"}={}){
  const documents:PublicDocument[]=[];const limitations:string[]=[];let siteRead=false;
  if(lead.website){
    const home=await readPage(lead.website,"site-1",signal,limitations);documents.push(home);
    if(home.status==="ok"){
      siteRead=true;
      const origin=new URL(home.url).origin;
      const links=home.links.filter(link=>new URL(link).origin===origin&&/about|product|service|solution|pricing|blog|news|case-stud/i.test(new URL(link).pathname)).slice(0,3);
      documents.push(...await Promise.all(links.map((link,index)=>readPage(link,`site-${index+2}`,signal,limitations))));
    }
  }else limitations.push("No website was supplied. This does not prove the company has no website.");
  const social=[lead.linkedin,lead.instagram?(/^https?:\/\//i.test(lead.instagram)?lead.instagram:`https://www.instagram.com/${lead.instagram.replace(/^@/,"")}/`):undefined].filter((value):value is string=>!!value);
  documents.push(...await Promise.all(social.map((link,index)=>readPublicDocument(link,`social-${index+1}`,signal))));
  if(!social.length)limitations.push("No social profiles were supplied. Social presence and activity have not been verified.");
  // A company name alone can match an unrelated business. Search wider only once the lead's own site confirms who it is.
  if(!siteRead)limitations.push("Broader public search was skipped because the lead's own website could not be read. Results found by company name alone could describe a different business.");
  else if(firecrawlKey()){
    const host=(()=>{try{return lead.website?new URL(publicResearchUrl(lead.website).href).hostname.replace(/^www\./,""):"";}catch{return "";}})();
    const queries=[`"${lead.company}" ${host} competitors alternatives`,`"${lead.company}" ${host} reviews news marketing`];
    const found=(await Promise.all(queries.map(async query=>{try{return await firecrawlSearch(query,signal);}catch(error){limitations.push(error instanceof Error?error.message:"Firecrawl search was unavailable.");return[];}}))).flat();
    const urls=[...new Set(found)].filter(url=>!documents.some(document=>document.url===url)).slice(0,4);
    if(!urls.length)limitations.push("Broader public search returned no new sources. Competitor and advertising checks may be incomplete.");
    documents.push(...await Promise.all(urls.map((url,index)=>readPage(url,`search-${index+1}`,signal,limitations))));
  }else if(options.searchProvider!=="firecrawl"&&process.env.TAVILY_API_KEY){
    try{
      const response=await fetch("https://api.tavily.com/search",{method:"POST",headers:{Authorization:`Bearer ${process.env.TAVILY_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({query:`"${lead.company}" competitors products marketing advertising`,search_depth:"basic",max_results:3,include_answer:false,include_raw_content:false}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),cache:"no-store"});
      if(!response.ok)throw new Error();
      const result=await response.json() as {results?:{url:string}[]};
      const urls=(result.results??[]).slice(0,3).filter(item=>typeof item.url==="string"&&!documents.some(document=>document.url===item.url));
      documents.push(...await Promise.all(urls.map((item,index)=>readPublicDocument(item.url,`search-${index+1}`,signal))));
    }catch{limitations.push("Broader public search was unavailable. Competitor and advertising checks may be incomplete.");}
  }else limitations.push(options.searchProvider==="firecrawl"?"Firecrawl search is not configured. Add FIRECRAWL_API_KEY to collect broader public sources.":"Broader public search is not configured. Competitors and ad-library activity must remain unverified unless a fetched source explicitly documents them.");
  return{documents,limitations:[...new Set(limitations)]};
}
