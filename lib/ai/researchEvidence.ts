import type { Lead, LeadResearch, ResearchFinding, Service } from "../types";

export const RESEARCH_TOPICS=[
  ["website","Website"],["social","Social presence"],["business_model","Business model"],["products","Products"],["audience","Target audience"],
  ["marketing","Marketing activity"],["ads","Publicly observable advertising"],["content","Content"],["competitors","Competitors"],["growth","Growth opportunities"],
] as const;
export type EvidenceDocument={id:string;url:string;title:string;text:string;status:"ok"|"unavailable";checkedAt:string;reason?:string;tracking?:string[]};
export type ProposedFinding={text:string;kind:"verified"|"assumption"|"recommendation";sourceId:string|null;quote:string|null};
export type ProposedResearch={identity?:{status:"verified"|"not_verified";reason:string;conflicts:string[]};analysis:{topic:string;findings:ProposedFinding[]}[];problems:ProposedFinding[];opportunities:ProposedFinding[];recommendedServices:{service:Service;reason:string;sourceId:string|null;quote:string|null}[];outreachAngle:string};
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
  if(finding.kind==="verified")return grounded?{kind:"verified",text:`The source states: “${quote}”`,source:source!.url,evidenceQuote:quote}:null;
  if(!finding.text.trim()||finding.text.length>1500||/guaranteed?\b|\d+(?:\.\d+)?\s*%/i.test(finding.text))return null;
  if(finding.kind==="assumption"&&!grounded)return null;
  if(finding.kind==="assumption"&&!/\b(may|might|could|if|possible|suggests|potential)\b/i.test(finding.text))return null;
  return{kind:finding.kind,text:finding.kind==="assumption"?`AI inference — confirm before use: ${finding.text}`:finding.text,...(grounded?{source:source!.url,evidenceQuote:quote}:{source:"General recommendation; not an observed company problem"})};
}

const unavailable=(text:string):ResearchFinding=>({kind:"unavailable",text});
export function evidenceResearch(lead:Pick<Lead,"company"|"industry"|"location"|"companySize"|"website"|"linkedin"|"instagram"|"services">,documents:EvidenceDocument[],proposal:ProposedResearch|null,limitations:string[]=[],model?:string):LeadResearch{
  let rejected=0;
  const identityUnverified=proposal?.identity?.status==="not_verified";
  const clean=(findings:ProposedFinding[]=[])=>findings.flatMap(finding=>{const result=groundFinding(finding,documents);if(!result)rejected++;return result?[result]:[];});
  const analysis=new Map<string,ResearchFinding[]>();
  for(const [topic]of RESEARCH_TOPICS){
    const proposed=identityUnverified?[]:proposal?.analysis.filter(item=>item.topic===topic).flatMap(item=>item.findings)??[];
    analysis.set(topic,clean(proposed).filter(finding=>{
      if(topic==="competitors")return finding.kind==="verified"&&/competitor|alternative|compete|competing|versus|\bvs\b/i.test(finding.evidenceQuote??"");
      if(topic==="ads"&&finding.kind==="verified")return adTransparencySource(finding.source??"");
      return true;
    }));
  }
  const read=documents.filter(document=>document.status==="ok");
  if(!proposal&&read.length){analysis.set("website",read.filter(document=>document.id.startsWith("site")).slice(0,2).map(document=>({kind:"verified",text:`Readable public page: ${document.title}`,source:document.url,evidenceQuote:document.text.slice(0,220)})));}
  const record:ResearchFinding[]=[{kind:"record",text:`Company supplied in CRM: ${lead.company}.`,source:"CRM record — not independently verified"},
    ...[["Industry",lead.industry],["Location",lead.location],["Company size",lead.companySize]].filter(([,value])=>value&&value!=="Unknown").map(([label,value])=>({kind:"record" as const,text:`${label} supplied in CRM: ${value}.`,source:"CRM record — not independently verified"}))];
  const get=(...topics:string[])=>topics.flatMap(topic=>analysis.get(topic)??[]);
  const marketing=get("website","social","marketing","ads","content","competitors");
  if(!identityUnverified)for(const document of read)for(const tag of document.tracking??[])marketing.push({kind:"verified",text:`${tag} was observed in this page's HTML. A tracking reference does not establish active advertising or campaign performance.`,source:document.url});
  if(!get("ads").length)marketing.push(unavailable("Active ads, budgets, targeting and performance have not been verified. Tracking tags and a missing ad-library result are not proof of advertising activity or inactivity."));
  if(!get("competitors").length)marketing.push(unavailable("No competitor names have been established by the checked sources. No competitor list has been invented."));
  const services=identityUnverified?[]:proposal?.recommendedServices.flatMap(item=>{const finding=groundFinding({text:item.reason,kind:"recommendation",sourceId:item.sourceId,quote:item.quote},documents);return finding?[{service:item.service,finding}]:[];})??lead.services.map(service=>({service,finding:{kind:"recommendation" as const,text:`Discuss whether ${service} matches the company's priorities. This service is listed in CRM, not established as a business need.`,source:"CRM record"}}));
  const companyEvidence=get("business_model","products","audience","website").filter(finding=>finding.kind==="verified"&&finding.evidenceQuote);
  const context=companyEvidence[0];
  const angle=context?`Reference this public-source excerpt: “${context.evidenceQuote}”. Ask ${lead.company} whether a short conversation about ${services[0]?.service??"its growth priorities"} would be useful. Treat any suggested opportunity as a discovery question, not an established problem.`:`Ask ${lead.company} which growth priorities matter most, then offer a short discovery conversation. Do not claim to have identified problems or results that the sources do not establish.`;
  const summary=identityUnverified?`Identity Not Verified for the company supplied as “${lead.company}”. Public pages were read, but they could not be confidently linked to this company. No company-specific findings are presented.`:read.length?`Company supplied in CRM: ${lead.company}. ${companyEvidence.slice(0,2).map(finding=>`Public source (${finding.source}) states: “${finding.evidenceQuote}”.`).join(" ")||`${read.length} public page(s) were readable, but business details could not be reliably established.`} Interpretations and recommendations are labelled below; published statements are not independently verified business facts.`:`No public source was successfully read for the company supplied as “${lead.company}”. This is a CRM-only assessment, not a completed public company audit.`;
  const problems=identityUnverified?[]:clean(proposal?.problems),opportunities=identityUnverified?[]:[...get("growth"),...clean(proposal?.opportunities)];
  const sections:LeadResearch["sections"]=[
    {key:"overview",title:"AI Company Summary",findings:[...record,...get("business_model","products","audience"),...(get("business_model","products","audience").length?[]:[unavailable("Business model, products and target audience have not been established by the available evidence.")])]},
    {key:"marketing",title:"Marketing Audit",findings:marketing.length?marketing:[unavailable("No public marketing evidence was available.")]},
    {key:"problems",title:"Potential Problems",findings:problems.length?problems:[unavailable("No company-specific problem has been established. Missing CRM information is not evidence of a business problem.")]},
    {key:"opportunities",title:"Growth Opportunities",findings:opportunities.length?opportunities:[{kind:"recommendation",text:"Confirm business goals, customer journeys and measurement before recommending growth experiments."}]},
    {key:"services",title:"Recommended Services",findings:services.length?services.map(item=>({...item.finding,text:`${item.service}: ${item.finding.text}`})):[unavailable("There is not enough evidence to recommend a specific service responsibly.")]},
    {key:"outreach",title:"Personalized Outreach Angle",findings:[{kind:"recommendation",text:angle,...(context?{source:context.source,evidenceQuote:context.evidenceQuote}:{})}]},
  ];
  return{status:"done",generatedAt:new Date().toISOString(),summary,sections,recommendedServices:[...new Set(services.map(item=>item.service))].slice(0,4),outreachAngle:angle,
    mode:proposal?"public_ai":read.length?"public_evidence":"crm_only",...(model?{model}:{}),
    ...(proposal?.identity?{identityAssessment:proposal.identity}:{}),
    sources:documents.map(document=>({id:document.id,url:document.url,title:document.title,status:document.status,checkedAt:document.checkedAt,...(document.reason?{reason:document.reason}:{})})),
    coverage:RESEARCH_TOPICS.map(([topic,label])=>({topic,label,status:(analysis.get(topic)??[]).some(finding=>finding.kind==="verified")?"evidence":(analysis.get(topic)??[]).some(finding=>finding.kind==="assumption"||finding.kind==="recommendation")?"inference":"unavailable",findings:[...(analysis.get(topic)??[])].sort((a,b)=>Number(b.kind==="verified")-Number(a.kind==="verified")).slice(0,2)})),
    limitations:[...limitations,...(identityUnverified?[`Identity Not Verified: ${proposal?.identity?.reason??"Source association is uncertain."}`,...(proposal?.identity?.conflicts??[]).map(conflict=>`Identity conflict: ${conflict}`)]:[]),...(!proposal?["AI synthesis was unavailable or not requested; no model-generated audit is presented as completed research."]:[]),...(rejected?[`${rejected} unsupported model finding(s) were omitted because evidence or grounding requirements were not met.`]:[])],
  };
}
