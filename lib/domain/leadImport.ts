import { LEAD_SOURCES, LEAD_STATUSES, SERVICES, type CompanySize, type Lead } from "../types.ts";

export const LEAD_IMPORT_FIELDS = [
  {key:"name",label:"Name",aliases:["name","full name","contact name","lead name"]},
  {key:"company",label:"Company",aliases:["company","company name","brand","organization","organisation","business"]},
  {key:"website",label:"Website",aliases:["website","company website","url","domain"]},
  {key:"email",label:"Email",aliases:["email","email address","e mail"]},
  {key:"phone",label:"Phone",aliases:["phone","phone number","mobile","mobile number","contact number","whatsapp"]},
  {key:"linkedin",label:"LinkedIn",aliases:["linkedin","linkedin url","linkedin profile"]},
  {key:"instagram",label:"Instagram",aliases:["instagram","instagram url","instagram handle"]},
  {key:"industry",label:"Industry",aliases:["industry","sector","category"]},
  {key:"location",label:"Location",aliases:["location","city","region","country","address"]},
  {key:"companySize",label:"Company size",aliases:["company size","size","employees","headcount"]},
  {key:"source",label:"Lead source",aliases:["source","lead source"]},
  {key:"services",label:"Services required",aliases:["services","services required","potential services"]},
  {key:"ownerId",label:"Assigned salesperson",aliases:["assigned salesperson","salesperson","owner","assigned to"]},
  {key:"initialScore",label:"Lead score",aliases:["lead score","score"]},
  {key:"status",label:"Status",aliases:["status","lead status","stage","pipeline stage"]},
  {key:"notes",label:"Notes",aliases:["notes","note","comments","remarks"]},
  {key:"communicationHistory",label:"Communication history",aliases:["communication history","history","last conversation"]},
  {key:"researchSummary",label:"AI research summary",aliases:["ai research","ai research summary","research","research summary"]},
  {key:"dealValue",label:"Deal value",aliases:["deal value","expected deal value","value","deal amount"]},
  {key:"tags",label:"Tags",aliases:["tags","lead tags","labels"]},
  {key:"jobTitle",label:"Job title",aliases:["job title","title","designation","role"]},
] as const;
export const normalizeHeader=(value:string)=>value.trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
export const emailKey=(value:string)=>value.trim().toLowerCase();
export const phoneKey=(value:string)=>{const digits=value.replace(/\D/g,"");return digits.length>=8?digits:"";};

export function importCompanySize(value:string):CompanySize{
  const sizes:CompanySize[]=["Unknown","1-10","11-50","51-200","201-1000","1000+"];
  if(sizes.includes(value as CompanySize))return value as CompanySize;
  if(!value.trim())return "Unknown";
  const n=Number(value.replace(/[,\s]/g,""));
  if(!Number.isFinite(n)||n<=0)throw new Error("Company size must be an employee count or a supported range");
  return n<=10?"1-10":n<=50?"11-50":n<=200?"51-200":n<=1000?"201-1000":"1000+";
}
export function importedLead(row:Record<string,string>,ownerId:string,team:{id:string;name:string;email:string}[]){
  const status=LEAD_STATUSES.find(status=>status.toLowerCase()===(row.status||"New").trim().toLowerCase());
  if(!status)throw new Error(`Unknown status: ${row.status}`);
  const source=LEAD_SOURCES.find(source=>source.toLowerCase()===(row.source||"Cold List").trim().toLowerCase());
  if(!source)throw new Error(`Unknown lead source: ${row.source}`);
  if(!row.name?.trim()||!row.company?.trim())throw new Error("Name and company are required");
  const services=(row.services||"").split(/[;,|]/).map(value=>value.trim()).filter(Boolean).map(value=>{
    const service=SERVICES.find(service=>service.toLowerCase()===value.toLowerCase());if(!service)throw new Error(`Unknown service: ${value}`);return service;
  });
  let assigned=ownerId;
  if(row.ownerId){const member=team.find(member=>[member.id,member.name,member.email].some(value=>value.toLowerCase()===row.ownerId.toLowerCase()));if(!member)throw new Error(`Salesperson not found: ${row.ownerId}`);assigned=member.id;}
  const number=(value:string|undefined,label:string)=>{if(!value?.trim())return undefined;const n=Number(value.replace(/[₹$,\s]/g,""));if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a non-negative number`);return n;};
  const score=number(row.initialScore,"Lead score");if(score!==undefined&&(score>100||!Number.isInteger(score)))throw new Error("Lead score must be a whole number from 0 to 100");
  const fields=Object.fromEntries(Object.entries(row).filter(([key])=>key.startsWith("custom:")).map(([key,value])=>[key.slice(7),value]));
  const email=row.email?.trim()||"";if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Invalid email address");
  const website=row.website?.trim();if(website&&!/^https?:\/\//i.test(website)&&/^[a-z][a-z\d+.-]*:/i.test(website))throw new Error("Website must use http or https");
  return {name:row.name.trim(),company:row.company.trim(),jobTitle:row.jobTitle||"",email,phone:row.phone||"",website:website?(/^https?:\/\//i.test(website)?website:`https://${website}`):undefined,
    linkedin:row.linkedin||undefined,instagram:row.instagram||undefined,industry:row.industry||"Other",location:row.location||"",companySize:importCompanySize(row.companySize||""),source,services:[...new Set(services)],ownerId:assigned,status,
    tags:[...new Set(["imported",...(row.tags||"").split(/[;,|]/).map(value=>value.trim().replace(/^#/,"")).filter(Boolean)])],notes:row.notes||"",communicationHistory:row.communicationHistory||undefined,
    initialScore:score,dealValue:number(row.dealValue,"Deal value"),customFields:fields,
    research:row.researchSummary?{status:"done" as const,summary:row.researchSummary,sections:[{key:"imported",title:"Imported research",findings:[{kind:"assumption" as const,text:"This research was imported and has not been independently verified."}]}],recommendedServices:[]}:undefined,
  };
}
export function duplicateLead(candidate:{email:string;phone:string},leads:Pick<Lead,"email"|"phone">[]){
  const email=emailKey(candidate.email),phone=phoneKey(candidate.phone);
  return leads.some(lead=>(!!email&&emailKey(lead.email)===email)||(!!phone&&phoneKey(lead.phone)===phone));
}
