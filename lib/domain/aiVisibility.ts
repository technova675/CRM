export type VisibilityProvider = "ChatGPT" | "Gemini" | "Perplexity" | "Google AI";
export type VisibilityPrompt = {id:string;clientId:string;category:string;question:string;competitors:string[];createdAt:string};
export type VisibilitySample = {id:string;promptId:string;provider:VisibilityProvider;capturedAt:string;rawAnswer:string;brandMention:boolean;competitorMentions:string[];citations:string[];sentiment:"positive"|"neutral"|"negative"|"unmentioned";source:"manual"};
export type VisibilityState = {prompts:VisibilityPrompt[];samples:VisibilitySample[]};
export const visibilityState=(value:VisibilityState|undefined):VisibilityState=>value??{prompts:[],samples:[]};

export function visibilitySummary(state:VisibilityState,clientId:string){
  const prompts=state.prompts.filter(prompt=>prompt.clientId===clientId);
  const ids=new Set(prompts.map(prompt=>prompt.id));
  const samples=state.samples.filter(sample=>ids.has(sample.promptId));
  const mentions=samples.filter(sample=>sample.brandMention).length;
  const citations=samples.filter(sample=>sample.brandMention&&sample.citations.length).length;
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
  if(samples.length>=3&&citations<mentions)recommendations.push("Review cited publishers and strengthen crawlable, attributable source pages.");
  if(samples.length>=3&&competing>mentions)recommendations.push("Compare competitor mentions with your entity description and independent references.");
  if(samples.length>=3&&samples.some(sample=>sample.sentiment==="negative"))recommendations.push("Review negative answers against the raw samples and correct verifiable source information.");
  return {promptCount:prompts.length,sampleCount:samples.length,mentionRate:samples.length?Math.round(mentions/samples.length*100):null,
    citationRate:samples.length?Math.round(citations/samples.length*100):null,
    shareOfVoice:mentions+competing?Math.round(mentions/(mentions+competing)*100):null,
    competitors,sources:[...sources].sort((a,b)=>b[1]-a[1]).map(([domain,count])=>({domain,count})),trend,alert,recommendations};
}
