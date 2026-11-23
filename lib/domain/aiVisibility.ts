export type VisibilityProvider = "ChatGPT" | "Gemini" | "Perplexity" | "Google AI" | "Open model";
export type VisibilityPrompt = {id:string;clientId:string;category:string;question:string;competitors:string[];createdAt:string};
export type VisibilitySample = {id:string;promptId:string;provider:VisibilityProvider;capturedAt:string;rawAnswer:string;brandMention:boolean;competitorMentions:string[];citations:string[];sentiment:"positive"|"neutral"|"negative"|"unmentioned";source:"manual"|"auto";model?:string};
export type VisibilityState = {prompts:VisibilityPrompt[];samples:VisibilitySample[];brandNames?:Record<string,string[]>};
export const visibilityState=(value:VisibilityState|undefined):VisibilityState=>value??{prompts:[],samples:[]};

const LEGAL=/\s+(private limited|pvt\.? ?ltd\.?|limited|ltd\.?|llp|llc|inc\.?|corp\.?|co\.?|gmbh|plc)$/i;
const siteName=(website?:string)=>{try{return website?new URL(/^https?:/i.test(website)?website:"https://"+website).hostname.replace(/^www\./,""):"";}catch{return "";}};
/** Names that count as a brand mention: the saved list, else the company name, the name without its legal suffix, and the website domain. */
export function brandTerms(client:{company:string;website?:string},saved?:string[]){
  const base=saved?.length?saved:[client.company,client.company.replace(LEGAL,"").trim(),siteName(client.website)];
  return [...new Set(base.map(name=>name.trim()).filter(name=>name.length>=3))];
}
const normal=(text:string)=>text.toLocaleLowerCase().replace(/[‘’]/g,"'");
export const mentions=(answer:string,names:string[])=>{const text=normal(answer);return names.some(name=>text.includes(normal(name)));};
/** Detection is recomputed from the stored answer, so changing the brand names corrects every saved sample. */
export function detectSample(sample:VisibilitySample,names:string[],competitors:string[]):VisibilitySample{
  const brandMention=mentions(sample.rawAnswer,names);
  return {...sample,brandMention,competitorMentions:competitors.filter(name=>name.length>=3&&mentions(sample.rawAnswer,[name]))};
}

export function visibilitySummary(state:VisibilityState,client:{id:string;company:string;website?:string}){
  const clientId=client.id,names=brandTerms(client,state.brandNames?.[clientId]),site=siteName(client.website);
  const prompts=state.prompts.filter(prompt=>prompt.clientId===clientId);
  const byId=new Map(prompts.map(prompt=>[prompt.id,prompt]));
  const samples=state.samples.filter(sample=>byId.has(sample.promptId)).map(sample=>detectSample(sample,names,byId.get(sample.promptId)!.competitors));
  const mentions=samples.filter(sample=>sample.brandMention).length;
  // An answer "cites the client" only when one of its sources is the client's own website.
  const citesSite=(sample:VisibilitySample)=>!!site&&sample.citations.some(url=>{try{const host=new URL(url).hostname.replace(/^www\./,"");return host===site||host.endsWith("."+site);}catch{return false;}});
  const citations=samples.filter(citesSite).length;
  const competitors=[...new Set(prompts.flatMap(prompt=>prompt.competitors))];
  const competing=samples.filter(sample=>sample.competitorMentions.length).length;
  const batches=new Map<string,{total:number;mentions:number}>();
  for(const sample of samples){
    const day=sample.capturedAt.slice(0,10),bucket=batches.get(day)??{total:0,mentions:0};
    bucket.total++;
    if(sample.brandMention)bucket.mentions++;
    batches.set(day,bucket);
  }
  const trend=[...batches].sort(([a],[b])=>a.localeCompare(b)).map(([day,stats])=>({day,...stats,rate:Math.round(stats.mentions/stats.total*100)}));
  const latest=trend.at(-1),previous=trend.at(-2);
  const alert=latest&&previous&&latest.total>=3&&previous.total>=3&&latest.rate<=previous.rate-20
    ?`Sampled mention rate fell from ${previous.rate}% to ${latest.rate}% across the last two recorded days.`:null;
  const sources=new Map<string,number>();
  for(const sample of samples)for(const url of sample.citations)try{
    const host=new URL(url).hostname.toLowerCase();
    sources.set(host,(sources.get(host)??0)+1);
  }catch{}
  const recommendations:string[]=[];
  if(samples.length>=3&&mentions/samples.length<0.5)recommendations.push("Review unanswered prompt categories and create pages that address those questions directly.");
  if(samples.length>=3&&site&&citations<mentions)recommendations.push("AI answers mention the brand but rarely link to its website. Strengthen crawlable, attributable pages on "+site+" for these questions.");
  if(samples.length>=3&&competing>mentions)recommendations.push("Compare competitor mentions with your entity description and independent references.");
  if(samples.length>=3&&samples.some(sample=>sample.sentiment==="negative"))recommendations.push("Review negative answers against the raw samples and correct verifiable source information.");
  return {promptCount:prompts.length,sampleCount:samples.length,mentionRate:samples.length?Math.round(mentions/samples.length*100):null,
    citationRate:samples.length&&site?Math.round(citations/samples.length*100):null,brandNames:names,website:site,samples,
    shareOfVoice:mentions+competing?Math.round(mentions/(mentions+competing)*100):null,
    competitors,sources:[...sources].sort((a,b)=>b[1]-a[1]).map(([domain,count])=>({domain,count})),trend,alert,recommendations};
}

/** Links an AI answer printed in its text, used as the citations of an automatic check. */
export const answerLinks=(text:string)=>[...new Set((text.match(/https?:\/\/[^\s)\]>"'`]+/g)??[]).map(url=>url.replace(/[.,;:!?]+$/,"")))].filter(url=>{try{return ["http:","https:"].includes(new URL(url).protocol);}catch{return false;}}).slice(0,30);
