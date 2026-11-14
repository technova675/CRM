"use client";

import {useCRM} from "@/lib/store";
import {DEAL_STAGES,SERVICES,type DealStage,type Service} from "@/lib/types";
import {SpreadsheetImportModal,type ImportColumn,type ImportRecord} from "@/components/imports/SpreadsheetImportModal";

const columns:ImportColumn[]=[
 {key:"title",label:"Deal title",aliases:["name","deal"]},
 {key:"company",label:"Company",aliases:["client"]},
 {key:"value",label:"Value",aliases:["deal value","amount"]},
 {key:"stage",label:"Stage",aliases:["status"]},
 {key:"probability",label:"Probability",aliases:["win probability"]},
 {key:"expectedClose",label:"Expected close",aliases:["close date","closing date"]},
 {key:"services",label:"Services",aliases:["services required"]},
 {key:"notes",label:"Notes"},
];
const template={title:"",company:"",value:"",stage:"New",probability:"10",expectedClose:"YYYY-MM-DD",services:"",notes:""};
const validNumber=(value:string)=>value.trim()!==""&&Number.isFinite(Number(value));

export function DealImportModal({onClose}:{onClose:()=>void}){
 const deals=useCRM(state=>state.deals),ownerId=useCRM(state=>state.currentUserId);
 const existing=new Set(deals.map(deal=>`${deal.company.trim().toLocaleLowerCase()}|${deal.title.trim().toLocaleLowerCase()}`));
 const validate=(row:ImportRecord)=>{
  const title=row.title?.trim(),company=row.company?.trim(),key=`${company?.toLocaleLowerCase()}|${title?.toLocaleLowerCase()}`;
  if(!title||!company)return "Deal title and company are required.";
  if(existing.has(key))return "This company and deal title already exist.";
  if(!validNumber(row.value??"")||Number(row.value)<0)return "Enter a non-negative deal value.";
  if(row.stage&&!DEAL_STAGES.includes(row.stage as DealStage))return "Unknown pipeline stage.";
  if(row.probability&&(!validNumber(row.probability)||Number(row.probability)<0||Number(row.probability)>100))return "Probability must be 0–100.";
  if(row.expectedClose&&!/^\d{4}-\d{2}-\d{2}$/.test(row.expectedClose))return "Expected close must use YYYY-MM-DD.";
  const unknown=(row.services??"").split(/[;,]/).map(service=>service.trim()).filter(Boolean).find(service=>!SERVICES.includes(service as Service));
  if(unknown)return `Unknown service: ${unknown}.`;
  return undefined;
 };
 const save=(row:ImportRecord)=>{
  useCRM.getState().addDeal({title:row.title.trim(),company:row.company.trim(),value:Number(row.value),stage:(row.stage||"New") as DealStage,
   probability:row.probability?Number(row.probability):10,expectedClose:row.expectedClose||new Date(Date.now()+30*86400000).toISOString().slice(0,10),
   services:(row.services??"").split(/[;,]/).map(service=>service.trim()).filter(Boolean) as Service[],notes:row.notes??"",ownerId,paymentStatus:"Pending"});
 };
 return <SpreadsheetImportModal title="deals" columns={columns} template={template} required={["title","company","value"]} validate={validate} uniqueBy={row=>`${row.company?.toLocaleLowerCase()}|${row.title?.toLocaleLowerCase()}`} save={save} onClose={onClose}/>;
}
