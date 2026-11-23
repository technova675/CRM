import type { Lead, LeadResearch, ResearchFinding, Service } from "../types";

export const RESEARCH_TOPICS=[
  ["website","Website"],["social","Social presence"],["business_model","Business model"],["products","Products"],["audience","Target audience"],
  ["marketing","Marketing activity"],["ads","Publicly observable advertising"],["content","Content"],["competitors","Competitors"],["growth","Growth opportunities"],
] as const;
export type EvidenceDocument={id:string;url:string;title:string;text:string;status:"ok"|"unavailable";checkedAt:string;reason?:string;tracking?:string[]};
export type ProposedFinding={text:string;kind:"verified"|"assumption"|"recommendation";sourceId:string|null;quote:string|null};
export type ProposedResearch={identity?:{status:"verified"|"not_verified";reason:string;conflicts:string[]};analysis:{topic:string;findings:ProposedFinding[]}[];problems:ProposedFinding[];opportunities:ProposedFinding[];recommendedServices:{service:Service;reason:string;sourceId:string|null;quote:string|null}[];outreachAngle:string;insights?:ResearchInsights|null};
export type ResearchInsights={industry:string;whatTheyDo:string;likelyGaps:string[];opportunities:string[];serviceFit:{service:Service;why:string}[];outreachAngle:string;questions:string[]};
const normalize=(value:string)=>value.replace(/\s+/g," ").trim();
function adTransparencySource(value:string){
  try{const url=new URL(value),host=url.hostname.replace(/^www\./,"");return host==="adstransparency.google.com"||(host==="facebook.com"&&/^\/ads\/library(?:\/|$)/.test(url.pathname))||(host==="linkedin.com"&&/^\/ad-library(?:\/|$)/.test(url.pathname));}catch{return false;}
}

// The display text of a verified finding is the matched source excerpt itself,
// never a model's unsupported paraphrase or interpretation of that excerpt.
export function groundFinding(finding:ProposedFinding,documents:EvidenceDocument[]):ResearchFinding|null{
  const source=documents.find(document=>document.id===finding.sourceId&&document.status==="ok");
  const quote=normalize(finding.quote??"");
  const grounded=!!source&&quote.length>=12&&quote.length<=280&&normalize(source.text).includes(quote);
  if(finding.kind==="verified")return grounded?{kind:"verified",text:`The source states: “${quote}”`,source:source!.url,sourceId:source!.id,evidenceQuote:quote}:null;
  if(!finding.text.trim()||finding.text.length>1500||/guaranteed?\b|\d+(?:\.\d+)?\s*%/i.test(finding.text))return null;
  if(!grounded)return null;
  if(finding.kind==="assumption"&&!/\b(may|might|could|if|possible|suggests|potential)\b/i.test(finding.text))return null;
  return{kind:finding.kind,text:finding.kind==="assumption"?`AI inference — confirm before use: ${finding.text}`:finding.text,...(grounded?{source:source!.url,sourceId:source!.id,evidenceQuote:quote}:{source:"General recommendation; not an observed company problem"})};
}

const unavailable=(text:string):ResearchFinding=>({kind:"unavailable",text});
// Industry comes from clear words in the description, not from a model's pick, which can be wrong (a coffee brand
// labelled "Consulting"). No clear match means the lead keeps its industry.
const INDUSTRY_WORDS:[RegExp,string][]=[
  [/e-?commerce|d2c|direct[- ]to[- ]consumer|online store|ecom/i,"D2C / E-commerce"],[/real estate|realty|property developer/i,"Real Estate"],[/education|edtech|academy|school|coaching/i,"Education"],
  [/hospitality|hotel|resort|travel|homestay/i,"Hospitality"],[/health ?care|clinic|hospital|diagnostic/i,"Healthcare"],[/fintech|lending|payments? (?:app|platform)|insurance/i,"Fintech"],
  [/food|restaurant|f&b|kitchen|coffee|tea\b|snack|bakery|beverage|drinks?\b/i,"Food & Beverage"],[/fitness|gym|yoga/i,"Fitness"],[/saas|software|app\b/i,"SaaS"],
  [/fashion|apparel|clothing|footwear/i,"Fashion"],[/beauty|skincare|cosmetic|salon/i,"Beauty"],[/automotive|car dealer|two-wheeler|vehicle/i,"Automotive"],[/consult/i,"Consulting"],
];
const industryFrom=(text?:string)=>text?INDUSTRY_WORDS.find(([pattern])=>pattern.test(text))?.[1]:undefined;
export function evidenceResearch(lead:Pick<Lead,"company"|"industry"|"location"|"companySize"|"website"|"linkedin"|"instagram"|"services">,documents:EvidenceDocument[],proposal:ProposedResearch|null,limitations:string[]=[],model?:string):LeadResearch{
  let rejected=0;
  const identityUnverified=!!proposal&&proposal.identity?.status!=="verified";
  // Inferred sales ideas: dropped for an unverified company, and any line claiming figures or guarantees is removed.
  // Prices quoted from the site ("free delivery over ₹350") are fine; percentages, guarantees and revenue claims are not.
  const safe=(text:string)=>!!text.trim()&&!/guaranteed?\b|\d+(?:\.\d+)?\s*%|\b(?:revenue|turnover|sales) of\b/i.test(text);
  const raw=identityUnverified?null:proposal?.insights??null;
  const insights=raw?{...raw,whatTheyDo:safe(raw.whatTheyDo)?raw.whatTheyDo.trim():"",likelyGaps:raw.likelyGaps.filter(safe),opportunities:raw.opportunities.filter(safe),serviceFit:raw.serviceFit.filter(item=>safe(item.why)),outreachAngle:safe(raw.outreachAngle)?raw.outreachAngle.trim():"",questions:raw.questions.filter(safe)}:null;
  const inferred=(text:string,kind:"assumption"|"recommendation"="assumption"):ResearchFinding=>({kind,text,source:"AI inference from the public pages read; confirm before use"});
  const clean=(findings:ProposedFinding[]=[])=>findings.flatMap(finding=>{const result=groundFinding(finding,documents);if(!result)rejected++;return result?[result]:[];});
  const analysis=new Map<string,ResearchFinding[]>();
  const topicReasons=new Map<string,string>();
  for(const [topic]of RESEARCH_TOPICS){
    const proposed=identityUnverified?[]:proposal?.analysis.filter(item=>item.topic===topic).flatMap(item=>item.findings)??[];
    const findings=clean(proposed).filter(finding=>{
      if(topic==="competitors")return finding.kind==="verified"&&/competitor|alternative|compete|competing|versus|\bvs\b/i.test(finding.evidenceQuote??"");
      if(topic==="ads"&&finding.kind==="verified")return adTransparencySource(finding.source??"");
      if(topic==="growth"&&finding.kind==="verified")return false;
      return true;
    });
    analysis.set(topic,findings);
    if(!findings.length&&proposed.length)topicReasons.set(topic,"An AI finding was omitted because its quote, source or topic did not pass verification.");
  }
  const read=documents.filter(document=>document.status==="ok");
  const record:ResearchFinding[]=[{kind:"record",text:`Company supplied in CRM: ${lead.company}.`,source:"CRM record — not independently verified"},
    ...[["Industry",lead.industry],["Location",lead.location],["Company size",lead.companySize]].filter(([,value])=>value&&value!=="Unknown").map(([label,value])=>({kind:"record" as const,text:`${label} supplied in CRM: ${value}.`,source:"CRM record — not independently verified"}))];
  const get=(...topics:string[])=>topics.flatMap(topic=>analysis.get(topic)??[]);
  const marketing=get("website","social","marketing","ads","content","competitors");
  if(!get("ads").length)marketing.push(unavailable("Active ads, budgets, targeting and performance have not been verified. Tracking tags and a missing ad-library result are not proof of advertising activity or inactivity."));
  if(!get("competitors").length)marketing.push(unavailable("No competitor names have been established by the checked sources. No competitor list has been invented."));
  const services=identityUnverified?[]:proposal?.recommendedServices.flatMap(item=>{const finding=groundFinding({text:item.reason,kind:"recommendation",sourceId:item.sourceId,quote:item.quote},documents);return finding?[{service:item.service,finding}]:[];})??[];
  const companyEvidence=get("business_model","products","audience","website").filter(finding=>finding.kind==="verified"&&finding.evidenceQuote);
  const context=companyEvidence[0];
  const evidenceAngle=context?`Reference this public-source excerpt: “${context.evidenceQuote}”. Ask ${lead.company} whether a short conversation about ${services[0]?.service??"its growth priorities"} would be useful.`:`Ask ${lead.company} which growth priorities matter most this quarter, then offer a short discovery call.`;
  const angle=insights?.outreachAngle||evidenceAngle;
  const summary=identityUnverified?`Identity Not Verified for the company supplied as “${lead.company}”. Public pages were read, but they could not be confidently linked to this company. No company-specific findings are presented.`:read.length?`Company supplied in CRM: ${lead.company}. ${companyEvidence.slice(0,2).map(finding=>`Public source (${finding.source}) states: “${finding.evidenceQuote}”.`).join(" ")||`${read.length} public page(s) were readable, but business details could not be reliably established.`} Interpretations and recommendations are labelled below; published statements are not independently verified business facts.`:`No public source was successfully read for the company supplied as “${lead.company}”. This is a CRM-only assessment, not a completed public company audit.`;
  const problems=identityUnverified?[]:[...clean(proposal?.problems),...(insights?.likelyGaps??[]).map(text=>inferred(`Likely gap: ${text}`))];
  const opportunities=identityUnverified?[]:[...get("growth"),...clean(proposal?.opportunities),...(insights?.opportunities??[]).map(text=>inferred(text,"recommendation"))];
  const fitted=services.length?services.map(item=>({...item.finding,text:`${item.service}: ${item.finding.text}`})):(insights?.serviceFit??[]).map(item=>inferred(`${item.service}: ${item.why}`,"recommendation"));
  const sections:LeadResearch["sections"]=[
    {key:"overview",title:"AI Company Summary",findings:[...(insights?.whatTheyDo?[inferred(insights.whatTheyDo)]:[]),...record,...get("business_model","products","audience"),...(get("business_model","products","audience").length||insights?.whatTheyDo?[]:[unavailable("Business model, products and target audience have not been established by the available evidence.")])]},
    {key:"marketing",title:"Marketing Audit",findings:marketing.length?marketing:[unavailable("No public marketing evidence was available.")]},
    {key:"problems",title:"Potential Problems",findings:problems.length?problems:[unavailable("No company-specific problem has been established. Missing CRM information is not evidence of a business problem.")]},
    {key:"opportunities",title:"Growth Opportunities",findings:opportunities.length?opportunities:[{kind:"recommendation",text:"Confirm business goals, customer journeys and measurement before recommending growth experiments."}]},
    {key:"services",title:"Recommended Services",findings:fitted.length?fitted:[unavailable("There is not enough evidence to recommend a specific service responsibly.")]},
    {key:"outreach",title:"Personalized Outreach Angle",findings:[{kind:"recommendation",text:angle,...(context?{source:context.source,evidenceQuote:context.evidenceQuote}:{})},...(insights?.questions.length?[inferred(`Questions for the first call: ${insights.questions.join(" · ")}`,"recommendation")]:[])]},
  ];
  return{status:"done",generatedAt:new Date().toISOString(),summary:insights?.whatTheyDo?`${insights.whatTheyDo} (AI reading of ${read.length} public page${read.length===1?"":"s"}; verified quotes and labelled ideas below.)`:summary,sections,recommendedServices:[...new Set([...services.map(item=>item.service),...(services.length?[]:insights?.serviceFit.map(item=>item.service)??[])])].slice(0,4),outreachAngle:angle,...(industryFrom(insights?.whatTheyDo)?{industry:industryFrom(insights?.whatTheyDo)}:{}),
    mode:proposal?"public_ai":read.length?"public_evidence":"crm_only",...(model?{model}:{}),
    ...(proposal?.identity?{identityAssessment:proposal.identity}:{}),
    sources:documents.map(document=>({id:document.id,url:document.url,title:document.title,status:document.status,checkedAt:document.checkedAt,...(document.reason?{reason:document.reason}:{})})),
    coverage:RESEARCH_TOPICS.map(([topic,label])=>({topic,label,status:(analysis.get(topic)??[]).some(finding=>finding.kind==="verified")?"evidence":(analysis.get(topic)??[]).some(finding=>finding.kind==="assumption"||finding.kind==="recommendation")?"inference":"unavailable",findings:[...(analysis.get(topic)??[])].sort((a,b)=>Number(b.kind==="verified")-Number(a.kind==="verified")).slice(0,1),...(topicReasons.has(topic)?{reason:topicReasons.get(topic)}:{})})),
    limitations:[...limitations,...(identityUnverified?[`Identity Not Verified: ${proposal?.identity?.reason??"Source association is uncertain."}`,...(proposal?.identity?.conflicts??[]).map(conflict=>`Identity conflict: ${conflict}`)]:[]),...(!proposal?["AI synthesis was unavailable or not requested; no model-generated audit is presented as completed research."]:[]),...(rejected?[`${rejected} unsupported model finding(s) were omitted because evidence or grounding requirements were not met.`]:[])],
  };
}
