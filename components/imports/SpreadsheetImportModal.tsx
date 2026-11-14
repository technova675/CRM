"use client";

import {useMemo,useState} from "react";
import Papa from "papaparse";
import {readSheet} from "read-excel-file/browser";
import {Upload} from "lucide-react";
import {Badge,Button,Modal,Select,Table,Td,Th} from "@/components/ui";
import {downloadFile,toCSV} from "@/lib/utils";
import {flushCRMChanges} from "@/lib/crmSync";

export type ImportColumn={key:string;label:string;aliases?:string[]};
export type ImportRecord=Record<string,string>;
const normalize=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,"");

export function SpreadsheetImportModal({title,columns,template,required,validate,save,uniqueBy,onClose}:{
 title:string;columns:ImportColumn[];template:ImportRecord;required:string[];
 validate:(row:ImportRecord,rowIndex:number)=>string|undefined;save:(row:ImportRecord)=>void;uniqueBy?:(row:ImportRecord)=>string;onClose:()=>void;
}){
 const [filename,setFilename]=useState(""),[headers,setHeaders]=useState<string[]>([]),[rows,setRows]=useState<string[][]>([]);
 const [mapping,setMapping]=useState<Record<number,string>>({}),[error,setError]=useState(""),[result,setResult]=useState<{added:number;skipped:number}|null>(null),[busy,setBusy]=useState(false);
 const load=(data:string[][],name:string)=>{
  if(data.length<2)throw new Error("The file needs a header and at least one data row.");
  if(data.length>1001)throw new Error("Import up to 1,000 records per file.");
  const header=data[0]??[],used=new Set<string>(),next:Record<number,string>={};
  header.forEach((value,index)=>{const column=columns.find(col=>!used.has(col.key)&&[col.key,col.label,...(col.aliases??[])].map(normalize).includes(normalize(value)));next[index]=column?.key??"skip";if(column)used.add(column.key);});
  setHeaders(header);setRows(data.slice(1).filter(row=>row.some(cell=>cell.trim())));setMapping(next);setFilename(name);setResult(null);setError("");
 };
 const read=async(file:File)=>{
  setError("");
  try{
   if(file.size>20_000_000)throw new Error("Choose a file smaller than 20 MB.");
   if(/\.xlsx$/i.test(file.name))load((await readSheet(file)).map(row=>row.map(cell=>cell==null?"":cell instanceof Date?cell.toISOString():String(cell))),file.name);
   else if(/\.csv$/i.test(file.name)){
    const parsed=Papa.parse<string[]>(await file.text(),{skipEmptyLines:true});
    if(parsed.errors.length)throw new Error(parsed.errors[0]?.message??"Invalid CSV file.");
    load(parsed.data,file.name);
   }else throw new Error("Upload a CSV or .xlsx file. Save legacy .xls files as .xlsx first.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not read file.");}
 };
 const mapped=useMemo(()=>{
  const seen=new Set<string>();
  return rows.map((cells,index)=>{
   const record:ImportRecord={};headers.forEach((_,column)=>{const key=mapping[column];if(key&&key!=="skip")record[key]=(cells[column]??"").trim();});
   const key=uniqueBy?.(record),issue=validate(record,index)||(key&&seen.has(key)?"Duplicate record in this file.":undefined);
   if(key&&!issue)seen.add(key);
   return {line:index+2,record,issue};
  });
 },[rows,headers,mapping,validate,uniqueBy]);
 const keys=Object.values(mapping).filter(key=>key!=="skip"),duplicateKeys=new Set(keys).size!==keys.length;
 const missing=required.filter(key=>!keys.includes(key)),valid=mapped.filter(item=>!item.issue),invalid=mapped.filter(item=>item.issue);
 const commit=async()=>{
  if(duplicateKeys||missing.length)return;
  setBusy(true);setError("");
  let added=0;const failures:string[]=[];
  for(const item of valid){try{save(item.record);added++;}catch(cause){failures.push(`Row ${item.line}: ${cause instanceof Error?cause.message:"Save failed."}`);}}
  try{await flushCRMChanges();setResult({added,skipped:invalid.length+failures.length});setError(failures.slice(0,5).join(" "));}
  catch(cause){setError(`Records were added locally, but cloud sync failed: ${cause instanceof Error?cause.message:"Retry from the CRM sync notice."}`);}
  finally{setBusy(false);}
 };
 return <Modal open onClose={onClose} size="xl" title={`Import ${title}`} subtitle="Upload CSV or Excel, check the matched columns and row preview, then import valid records."
  footer={result?<Button variant="primary" onClick={onClose}>Done</Button>:<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={busy||!valid.length||duplicateKeys||!!missing.length} onClick={()=>void commit()}>Import {valid.length.toLocaleString()} {title}</Button></>}>
  <div className="space-y-4">
   {error&&<p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
   {result?<p className="py-8 text-center text-sm"><strong className="block text-3xl">{result.added}</strong>{title} imported · {result.skipped} skipped</p>:<>
    <Button onClick={()=>downloadFile(`crm-${title.replace(/\s+/g,"-")}-template.csv`,toCSV([template]),"text/csv")}>Download CSV template</Button>
    <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-5 text-center hover:bg-surface-2 focus-within:border-accent" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const selected=event.dataTransfer.files[0];if(selected)void read(selected);}}><Upload size={20} aria-hidden="true"/><span className="mt-2 text-sm font-medium">Choose or drop a CSV or Excel file</span><span className="mt-1 text-xs text-fg-3">.csv or .xlsx · 20 MB · up to 1,000 rows</span><input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={event=>{const selected=event.target.files?.[0];if(selected)void read(selected);}}/></label>
    {!!rows.length&&<><p className="text-sm"><strong>{filename}</strong> <Badge>{rows.length} rows</Badge></p><div className="grid gap-2 sm:grid-cols-2">{headers.map((header,index)=><div key={index} className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2"><span className="min-w-0 flex-1 truncate text-sm" title={header}>{header||`Column ${index+1}`}</span><Select aria-label={`Map ${header||`column ${index+1}`}`} value={mapping[index]??"skip"} onChange={event=>setMapping(current=>({...current,[index]:event.target.value}))} className="w-40"><option value="skip">Skip</option>{columns.map(column=><option key={column.key} value={column.key}>{column.label}</option>)}</Select></div>)}</div>
     {duplicateKeys&&<p role="alert" className="text-sm text-danger">Map each destination field once.</p>}{!!missing.length&&<p role="alert" className="text-sm text-danger">Required columns: {missing.map(key=>columns.find(column=>column.key===key)?.label??key).join(", ")}</p>}
     <p className="text-sm text-fg-2">{valid.length} ready · {invalid.length} skipped</p><div className="max-h-64 overflow-auto rounded-lg border border-border"><Table><thead><tr><Th>Row</Th><Th>Record</Th><Th>Result</Th></tr></thead><tbody>{mapped.slice(0,30).map(item=><tr key={item.line}><Td>{item.line}</Td><Td>{item.record[required[0]??""]||"—"}</Td><Td className={item.issue?"text-danger":"text-success"}>{item.issue??"Ready"}</Td></tr>)}</tbody></Table></div>{mapped.length>30&&<p className="text-xs text-fg-3">Showing first 30 rows; all {mapped.length} rows are validated.</p>}
    </>}
   </>}
  </div>
 </Modal>;
}
