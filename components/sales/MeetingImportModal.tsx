"use client";

import {useCRM} from "@/lib/store";
import {SpreadsheetImportModal,type ImportColumn,type ImportRecord} from "@/components/imports/SpreadsheetImportModal";
import {safeClientLink} from "@/lib/domain/clientProfile";

const columns:ImportColumn[]=[
 {key:"title",label:"Meeting title",aliases:["title","meeting"]},
 {key:"targetType",label:"Target type",aliases:["type","lead or client"]},
 {key:"target",label:"Lead or client",aliases:["company","target name","email"]},
 {key:"startsAt",label:"Start date and time",aliases:["starts at","date time"]},
 {key:"durationMin",label:"Duration minutes",aliases:["duration","minutes"]},
 {key:"link",label:"Meeting link",aliases:["url"]},
 {key:"notes",label:"Notes"},
];
const template={title:"",targetType:"Lead",target:"",startsAt:"YYYY-MM-DDTHH:mm",durationMin:"30",link:"",notes:""};

export function MeetingImportModal({onClose}:{onClose:()=>void}){
 const leads=useCRM(state=>state.leads),clients=useCRM(state=>state.clients),meetings=useCRM(state=>state.meetings),ownerId=useCRM(state=>state.currentUserId);
 const findTarget=(row:ImportRecord)=>{
  const name=(row.target??"").trim().toLocaleLowerCase();
  if(row.targetType?.toLowerCase()==="lead"){
   const matches=leads.filter(lead=>lead.id===row.target||lead.email?.toLocaleLowerCase()===name||lead.name.toLocaleLowerCase()===name||lead.company.toLocaleLowerCase()===name);
   return matches.length===1?{leadId:matches[0]!.id}:null;
  }
  if(row.targetType?.toLowerCase()==="client"){
   const matches=clients.filter(client=>client.id===row.target||client.company.toLocaleLowerCase()===name);
   return matches.length===1?{clientId:matches[0]!.id}:null;
  }
  return null;
 };
 const validate=(row:ImportRecord)=>{
  if(!row.title?.trim())return "Meeting title is required.";
  if(!["lead","client"].includes(row.targetType?.toLowerCase()??""))return "Target type must be Lead or Client.";
  if(!findTarget(row))return "Lead or client was not found uniquely. Use an exact name, email, company or ID.";
  const at=Date.parse(row.startsAt??"");if(!Number.isFinite(at))return "Enter a valid start date and time.";
  const duration=Number(row.durationMin||30);if(!Number.isInteger(duration)||duration<1||duration>1440)return "Duration must be 1–1,440 minutes.";
  if(row.link&&!safeClientLink(row.link))return "Meeting link must be a safe HTTP or HTTPS URL.";
  if(meetings.some(meeting=>meeting.title.trim().toLocaleLowerCase()===row.title.trim().toLocaleLowerCase()&&meeting.startsAt===new Date(at).toISOString()))return "Meeting already exists at this time.";
  return undefined;
 };
 const save=(row:ImportRecord)=>{
  const target=findTarget(row);if(!target)throw new Error("Target no longer exists uniquely.");
  useCRM.getState().addMeeting({title:row.title.trim(),...target,startsAt:new Date(row.startsAt).toISOString(),durationMin:Number(row.durationMin||30),link:row.link||undefined,ownerId,notes:row.notes??"",outcome:"Pending"});
 };
 return <SpreadsheetImportModal title="meetings" columns={columns} template={template} required={["title","targetType","target","startsAt"]} validate={validate} uniqueBy={row=>`${row.title?.toLocaleLowerCase()}|${row.startsAt}`} save={save} onClose={onClose}/>;
}
