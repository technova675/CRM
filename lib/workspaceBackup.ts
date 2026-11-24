import "server-only";
import {createHmac,timingSafeEqual} from "node:crypto";
import type {CRMLibrary} from "./domain/crmLibrary";
import {workspaceCryptoKey} from "./workspaceVault";

export const RESTORABLE={
  leads:"Leads",deals:"Deals",clients:"Clients",campaigns:"Campaigns",ads:"Ad records",analyticsFeeds:"Analytics feeds",
  projects:"Projects",tasks:"Tasks",meetings:"Meetings",invoices:"Invoices",expenses:"Expenses",strategies:"Strategies",
  proposals:"Proposals",knowledge:"Knowledge entries",savedViews:"Saved views",customFields:"Custom fields",
} as const;
type Collection=keyof typeof RESTORABLE;
const collections=Object.keys(RESTORABLE) as Collection[];
type Backup={version:2;createdAt:string;workspace:string;data:CRMLibrary};

export function backupMac(owner:string,purpose:"export"|"preview",value:unknown){
  return createHmac("sha256",workspaceCryptoKey(owner,"backup")).update(purpose+"\0").update(JSON.stringify(value)).digest("hex");
}

export function validMac(actual:unknown,expected:string){
  return typeof actual==="string"&&/^[a-f0-9]{64}$/.test(actual)&&timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(expected,"hex"));
}

export function createBackup(owner:string,workspace:string,data:CRMLibrary){
  const snapshot=structuredClone(data);
  delete snapshot.staffInvites;
  delete snapshot.workspaceApiKeys;
  delete snapshot.credentialVault;
  delete snapshot.calendarLinks;
  for(const member of snapshot.team)delete member.staffAuthId;
  for(const campaign of snapshot.outreach??[])for(const recipient of campaign.recipients)delete recipient.approvalToken;
  const payload:Backup={version:2,createdAt:new Date().toISOString(),workspace,data:snapshot};
  return {...payload,signature:backupMac(owner,"export",payload)};
}

export function readBackup(owner:string,workspace:string,input:unknown){
  const {version,createdAt,workspace:source,data,signature}=(input??{}) as Partial<Backup>&{signature?:unknown};
  if(version!==2||source!==workspace||typeof createdAt!=="string"||!data)return;
  const payload:Backup={version,createdAt,workspace:source,data};
  try{
    if(!validMac(signature,backupMac(owner,"export",payload)))return;
  }catch{return;}
  return {...payload,signature:signature as string};
}

type Row={id?:string;key?:string};
const rowKey=(item:Row)=>item.id??item.key!;
function canonical(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.entries(value).filter(([,entry])=>entry!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>JSON.stringify(key)+":"+canonical(entry)).join(",")+"}";
  return JSON.stringify(value);
}

export function prepareRestore(current:CRMLibrary,backup:CRMLibrary){
  const next=structuredClone(current);
  const changed=new Map<Collection,Set<string>>();
  const counts=collections.flatMap(key=>{
    if(!Array.isArray(backup[key]))return [];
    const incoming=new Map((backup[key] as Row[]).map(item=>[rowKey(item),item]));
    const existing=new Map(((current[key]??[]) as Row[]).map(item=>[rowKey(item),item]));
    const ids=new Set<string>();
    let added=0,removed=0,updated=0;
    for(const [id,item] of incoming){
      const before=existing.get(id);
      if(!before){added++;ids.add(id);}
      else if(canonical(before)!==canonical(item)){updated++;ids.add(id);}
    }
    for(const id of existing.keys())if(!incoming.has(id)){removed++;ids.add(id);}
    if(!ids.size)return [];
    changed.set(key,ids);
    Object.assign(next,{[key]:structuredClone(backup[key])});
    return [{label:RESTORABLE[key],added,updated,removed}];
  });

  let pausedWorkflows=0;
  if(changed.size)for(const workflow of next.marketingAutomations??[]){
    if(!workflow.enabled)continue;
    workflow.enabled=false;
    pausedWorkflows++;
  }
  return {next,preview:{counts,pausedWorkflows}};
}
