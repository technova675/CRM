"use client";

import {useMemo,useState} from "react";
import Papa from "papaparse";
import {readSheet} from "read-excel-file/browser";
import {FileSpreadsheet,Upload} from "lucide-react";
import {useCRM} from "@/lib/store";
import {SERVICES,type Service} from "@/lib/types";
import {safeClientLink} from "@/lib/domain/clientProfile";
import {downloadFile,toCSV} from "@/lib/utils";
import {flushCRMChanges} from "@/lib/crmSync";
import {Badge,Button,Field,Modal,Select,Table,Td,Th} from "@/components/ui";

const columns=[
 {key:"company",label:"Company",aliases:["company","companyname","client","clientname"]},
 {key:"industry",label:"Industry",aliases:["industry"]},
 {key:"location",label:"Location",aliases:["location","city"]},
 {key:"website",label:"Website",aliases:["website","url","companywebsite"]},
 {key:"contactName",label:"Contact name",aliases:["contactname","primarycontact","name"]},
 {key:"contactEmail",label:"Contact email",aliases:["contactemail","email"]},
 {key:"contactPhone",label:"Contact phone",aliases:["contactphone","phone","mobile"]},
 {key:"services",label:"Services",aliases:["services","servicesrequired"]},
 {key:"linkedin",label:"LinkedIn",aliases:["linkedin","linkedinurl"]},
 {key:"instagram",label:"Instagram",aliases:["instagram","instagramurl"]},
 {key:"twitter",label:"X / Twitter",aliases:["twitter","x","twitterurl"]},
 {key:"facebook",label:"Facebook",aliases:["facebook","facebookurl"]},
 {key:"youtube",label:"YouTube",aliases:["youtube","youtubeurl"]},
] as const;
type Key=typeof columns[number]["key"];
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
const socials:Partial<Record<Key,string>>={linkedin:"LinkedIn",instagram:"Instagram",twitter:"X / Twitter",facebook:"Facebook",youtube:"YouTube"};
type Preview={line:number;company:string;details:Parameters<ReturnType<typeof useCRM.getState>["addClient"]>[0];issue?:string};

export function ClientImportModal({onClose}:{onClose:()=>void}){
 const team=useCRM(s=>s.team),clients=useCRM(s=>s.clients);
 const [file,setFile]=useState(""),[headers,setHeaders]=useState<string[]>([]),[rows,setRows]=useState<string[][]>([]);
 const [mapping,setMapping]=useState<Record<number,Key|"skip">>({}),[manager,setManager]=useState(()=>useCRM.getState().currentUserId);
 const [error,setError]=useState(""),[done,setDone]=useState<{added:number;skipped:number}|null>(null),[busy,setBusy]=useState(false);
 const managers=team.filter(member=>member.role!=="client"&&member.status!=="disabled"&&member.status!=="invited");
 const load=(header:string[],data:string[][],name:string)=>{
  if(!header.length||!data.length)throw new Error("The file needs a header and at least one data row.");
  if(data.length>201)throw new Error("Import up to 200 clients per file. Split a larger list into batches.");
  const used=new Set<Key>(),next:Record<number,Key|"skip">={};
  header.forEach((value,index)=>{const found=columns.find(column=>!used.has(column.key)&&(column.aliases as readonly string[]).includes(normalize(value)));next[index]=found?.key??"skip";if(found)used.add(found.key);});
  setHeaders(header);setRows(data.filter(row=>row.some(cell=>cell.trim())));setMapping(next);setFile(name);setDone(null);setError("");
 };
 const readFile=async(file:File)=>{
  setError("");
  try{
   if(file.size>20_000_000)throw new Error("Choose a file smaller than 20 MB.");
   if(/\.xls$/i.test(file.name))throw new Error("Save legacy .xls files as .xlsx or CSV first.");
   if(/\.xlsx$/i.test(file.name)){
    const data=(await readSheet(file)).map(row=>row.map(cell=>cell==null?"":cell instanceof Date?cell.toISOString():String(cell)));
    load(data[0]??[],data.slice(1),file.name);
   }else if(/\.csv$/i.test(file.name)){
    const parsed=Papa.parse<string[]>(await file.text(),{skipEmptyLines:true});
    if(parsed.errors.length)throw new Error(`CSV row ${(parsed.errors[0]?.row??0)+1}: ${parsed.errors[0]?.message??"Invalid CSV"}`);
    load(parsed.data[0]??[],parsed.data.slice(1),file.name);
   }else throw new Error("Upload a .csv or .xlsx file.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not read this file.");}
 };
 const duplicateMapping=useMemo(()=>{const selected=Object.values(mapping).filter(key=>key!=="skip");return new Set(selected).size!==selected.length;},[mapping]);
 const preview=useMemo<Preview[]>(()=>{
  const existing=new Set(clients.map(client=>client.company.trim().toLocaleLowerCase())),seen=new Set<string>();
  return rows.map((cells,index)=>{
   const data={} as Record<Key,string>;headers.forEach((_,column)=>{const key=mapping[column];if(key&&key!=="skip")data[key]=(cells[column]??"").trim();});
   const company=data.company??"",key=company.toLocaleLowerCase();
   const services=(data.services??"").split(/[;,]/).map(value=>value.trim()).filter(Boolean);
   const invalidServices=services.filter(service=>!SERVICES.includes(service as Service));
   const socialProfiles=Object.entries(socials).flatMap(([field,platform])=>data[field as Key]?[{platform,handle:data[field as Key]}]:[]);
   let issue:string|undefined;
   if(!company)issue="Company is required.";
   else if(existing.has(key)||seen.has(key))issue="Company already exists or appears earlier in this file.";
   else if(data.website&&!safeClientLink(data.website))issue="Website must be a valid HTTP or HTTPS URL.";
   else if(data.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail))issue="Contact email is invalid.";
   else if((data.contactEmail||data.contactPhone)&&!data.contactName)issue="Contact name is required when email or phone is given.";
   else if(invalidServices.length)issue=`Unknown service: ${invalidServices[0]}.`;
   if(key)seen.add(key);
   const details:Preview["details"]={company,industry:data.industry??"",location:data.location??"",website:data.website||undefined,
    contacts:data.contactName?[{name:data.contactName,email:data.contactEmail??"",phone:data.contactPhone??"",role:"Primary contact"}]:[],
    services:services as Service[],socialProfiles,accountManagerId:manager};
   return {line:index+2,company,details,issue};
  });
 },[rows,headers,mapping,clients,manager]);
 const valid=preview.filter(row=>!row.issue),invalid=preview.filter(row=>row.issue);
 const importClients=async()=>{
  if(duplicateMapping||!Object.values(mapping).includes("company")||!valid.length)return;
  setBusy(true);setError("");
  let added=0;const errors=[...invalid.map(row=>`Row ${row.line}: ${row.issue}`)];
  for(const row of valid){try{useCRM.getState().addClient(row.details);added++;}catch(cause){errors.push(`Row ${row.line}: ${cause instanceof Error?cause.message:"Could not save client."}`);}}
  try{await flushCRMChanges();setDone({added,skipped:errors.length});setError(errors.slice(0,5).join(" "));}
  catch(cause){setError(`Clients were added locally, but cloud sync failed: ${cause instanceof Error?cause.message:"Retry from the CRM sync notice."}`);}
  finally{setBusy(false);}
 };
 return <Modal open onClose={onClose} size="xl" title="Import clients" subtitle="Upload CSV or Excel, review the column mapping, then add valid clients. Existing companies are skipped."
  footer={done?<Button variant="primary" onClick={onClose}>Done</Button>:<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={busy||!valid.length||duplicateMapping||!Object.values(mapping).includes("company")} onClick={()=>void importClients()}>Import {valid.length.toLocaleString()} clients</Button></>}>
  <div className="space-y-4">
   {error&&<p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
   {done?<div className="py-6 text-center"><p className="text-3xl font-semibold">{done.added}</p><p className="text-sm text-fg-2">clients imported · {done.skipped} skipped</p></div>:<>
    <Button icon={<FileSpreadsheet size={16}/>} onClick={()=>downloadFile("crm-clients-template.csv",toCSV([{company:"",industry:"",location:"",website:"",contact_name:"",contact_email:"",contact_phone:"",services:"",linkedin:"",instagram:"",twitter:"",facebook:"",youtube:""}]),"text/csv")}>Download CSV template</Button>
    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-5 text-center hover:bg-surface-2 focus-within:border-accent" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const selected=event.dataTransfer.files[0];if(selected)void readFile(selected);}}><Upload className="mb-2 size-5" aria-hidden="true"/><span className="text-sm font-medium">Choose or drop a CSV or Excel file</span><span className="mt-1 text-xs text-fg-3">.csv or .xlsx · 20 MB max · 200 clients per file</span><input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={event=>{const selected=event.target.files?.[0];if(selected)void readFile(selected);}}/></label>
    {rows.length>0&&<>
     <div className="flex flex-wrap items-center gap-2 text-sm"><FileSpreadsheet size={16}/><strong>{file}</strong><Badge>{rows.length} rows</Badge><Field label="Default account manager"><Select value={manager} onChange={event=>setManager(event.target.value)}>{managers.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field></div>
     <div><h3 className="mb-2 text-sm font-semibold">Match columns</h3><div className="grid gap-2 sm:grid-cols-2">{headers.map((header,index)=><div key={index} className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2"><span className="min-w-0 flex-1 truncate text-sm" title={header}>{header||`Column ${index+1}`}</span><Select aria-label={`Map ${header||`column ${index+1}`}`} value={mapping[index]??"skip"} onChange={event=>setMapping(current=>({...current,[index]:event.target.value as Key|"skip"}))} className="w-40"><option value="skip">Skip</option>{columns.map(column=><option key={column.key} value={column.key}>{column.label}</option>)}</Select></div>)}</div></div>
     {duplicateMapping&&<p role="alert" className="text-sm text-danger">Map each destination field only once.</p>}
     {!Object.values(mapping).includes("company")&&<p role="alert" className="text-sm text-danger">Map a Company column to continue.</p>}
     <p className="text-sm text-fg-2">{valid.length} ready to import · {invalid.length} skipped. Each imported client gets an onboarding workspace.</p>
     <div className="max-h-64 overflow-auto rounded-lg border border-border"><Table><thead><tr><Th>Row</Th><Th>Company</Th><Th>Result</Th></tr></thead><tbody>{preview.slice(0,30).map(row=><tr key={row.line}><Td>{row.line}</Td><Td>{row.company||"—"}</Td><Td className={row.issue?"text-danger":"text-success"}>{row.issue??"Ready"}</Td></tr>)}</tbody></Table></div>
     {preview.length>30&&<p className="text-xs text-fg-3">Showing the first 30 rows. All {preview.length} rows are checked before import.</p>}
    </>}
   </>}
  </div>
 </Modal>;
}
