"use client";

import {useEffect,useState} from "react";
import {Download,History} from "lucide-react";
import {AGENTS,AGENT_LIST} from "@/lib/ai/agents";
import type {Activity} from "@/lib/types";
import {downloadFile,toCSV} from "@/lib/utils";
import {Badge,Button,Card,CardHeader,EmptyState,Field,Input,Select,Table,Td,Th} from "@/components/ui";

type Row=Activity&{company?:string;person?:string;approver?:string};
type Results={rows:Row[];total:number;entities:string[];clients:{id:string;company:string}[]};
const blank={actor:"",agent:"",client:"",entity:"",changes:"",from:"",to:"",q:""};
const pageSize=50;
const format=new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
const when=(value:string)=>format.format(new Date(value));
const actorName=(row:Row)=>row.actor==="ai"&&row.agent?AGENTS[row.agent]?.name??"AI":row.actor==="human"?row.person??"Human":row.actor==="api"?"API":row.actor==="system"?"System":"AI";
const safeCSV=(value:unknown)=>typeof value==="string"&&/^[\s\uFEFF]*[=+\-@]/.test(value)?"'"+value:value;

export function AuditLog(){
  const [filters,setFilters]=useState(blank),[applied,setApplied]=useState(blank),[page,setPage]=useState(0);
  const [result,setResult]=useState<Results>({rows:[],total:0,clients:[],entities:[]});
  const [selected,setSelected]=useState<string>(),[error,setError]=useState(""),[busy,setBusy]=useState(true),[exporting,setExporting]=useState(false),[refresh,setRefresh]=useState(0);
  const active=result.rows.find(row=>row.id===selected);
  useEffect(()=>{
    const controller=new AbortController();
    const params=new URLSearchParams({offset:String(page*pageSize)});
    for(const [key,value] of Object.entries(applied))if(value)params.set(key,value);
    fetch("/api/audit?"+params,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      if(!controller.signal.aborted){setResult(data);setError("");}
    }).catch(error=>{if(!controller.signal.aborted)setError(error.message);})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[applied,page,refresh]);
  const set=(key:keyof typeof blank,value:string)=>setFilters({...filters,[key]:value});
  function load(next:typeof blank,pageNumber=0){
    setApplied(next);setPage(pageNumber);setSelected(undefined);setBusy(true);setRefresh(value=>value+1);
  }
  async function csv(){
    setExporting(true);
    try{
      const params=new URLSearchParams({export:"1"});
      for(const [key,value] of Object.entries(applied))if(value)params.set(key,value);
      const response=await fetch("/api/audit?"+params,{cache:"no-store"});
      const data:Results&{error?:string}=await response.json();
      if(!response.ok)throw new Error(data.error??"Could not export the audit log.");
      const values=data.rows.map(row=>({when:row.at,who:actorName(row),actor_type:row.actor,agent:row.agent??"",client:row.company??"",what:row.action,
        entity:row.entity,entity_id:row.entityId??"",detail:row.detail??"",outcome:row.outcome??"",sources:row.sources?.join(" | ")??"",
        approved_by:row.approver??"",approved_at:row.approvedAt??"",before:row.before??"",after:row.after??""}));
      downloadFile("audit-log.csv",toCSV(values.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,safeCSV(value)])))),"text/csv");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not export the audit log.");}
    finally{setExporting(false);}
  }
  return <div className="space-y-4">
    <Card>
      <CardHeader title="Filter activity" subtitle="Dates and timestamps use India Standard Time."/>
      <form onSubmit={event=>{event.preventDefault();load({...filters});}} className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Agent"><Select value={filters.agent} onChange={e=>set("agent",e.target.value)}><option value="">All agents</option>{AGENT_LIST.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</Select></Field>
        <Field label="Client"><Select value={filters.client} onChange={e=>set("client",e.target.value)}><option value="">All clients</option>{result.clients.map(client=><option key={client.id} value={client.id}>{client.company}</option>)}</Select></Field>
        <Field label="Actor"><Select value={filters.actor} onChange={e=>set("actor",e.target.value)}><option value="">All actors</option><option value="human">Human</option><option value="ai">AI agent</option><option value="api">API</option><option value="system">System</option></Select></Field>
        <Field label="From date"><Input type="date" value={filters.from} onChange={e=>set("from",e.target.value)}/></Field>
        <Field label="To date"><Input type="date" value={filters.to} onChange={e=>set("to",e.target.value)}/></Field>
        <Field label="Search activity"><Input value={filters.q} onChange={e=>set("q",e.target.value)} maxLength={150} placeholder="Action, source or outcome"/></Field>
        <Field label="Entity"><Select value={filters.entity} onChange={e=>set("entity",e.target.value)}><option value="">All entities</option>{result.entities.map(entity=><option key={entity} value={entity}>{entity}</option>)}</Select></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2 sm:col-span-2"><input type="checkbox" checked={filters.changes==="1"} onChange={e=>set("changes",e.target.checked?"1":"")}/>Only entries with before or after values</label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3">
          <Button type="submit" className="min-h-11" variant="primary">Apply filters</Button>
          <Button type="button" className="min-h-11" onClick={()=>{setFilters(blank);load(blank);}}>Clear filters</Button>
          <Button type="button" className="min-h-11" icon={<Download className="size-4"/>} disabled={busy||!!error||!result.rows.length} loading={exporting} onClick={()=>void csv()}>Export CSV</Button>
        </div>
      </form>
    </Card>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {busy&&<p role="status" className="text-sm text-fg-2">Loading audit entries…</p>}
    {active&&!busy&&!error&&<Card>
      <CardHeader title={active.action} subtitle={[actorName(active),active.company,when(active.at)].filter(Boolean).join(" · ")} action={<Button onClick={()=>setSelected(undefined)}>Close details</Button>}/>
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        {([
          ["Outcome",active.outcome??active.detail??"No outcome recorded."],
          ["Record type",active.origin==="server"?"Server-recorded event":"Workspace activity"],
          ["Approved by",active.approver?[active.approver,active.approvedAt?when(active.approvedAt):""].filter(Boolean).join(" · "):"No approver recorded."],
          ["Data used",active.sources?.join("\n")??"Source details were not recorded for this entry."],
          ["Initiated by",active.person??actorName(active)],
          ["Before",active.before??"No value recorded."],["After",active.after??"No value recorded."],
        ] as const).map(([label,value])=><div key={label}><p className="text-xs font-medium text-fg-3">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</p></div>)}
      </div>
    </Card>}
    {!busy&&!error&&<Card>
      <CardHeader title="Activity timeline" subtitle={result.total+" matching entries · Newest first"}/>
      {!result.rows.length?<EmptyState icon={<History className="size-5"/>} title="No matching activity" description="Try a wider date range or clear the filters."/>:
      <Table><thead><tr><Th>Who</Th><Th>What</Th><Th>When</Th><Th>Client</Th><Th>Outcome</Th></tr></thead>
        <tbody>{result.rows.map(row=><tr key={row.id} className="hover:bg-surface-2">
          <Td className="whitespace-nowrap"><span className="block">{actorName(row)}</span>{row.agent&&row.actor!=="ai"&&<span className="text-xs text-fg-3">{AGENTS[row.agent]?.name}</span>}</Td>
          <Td className="min-w-52"><button type="button" aria-pressed={selected===row.id} className="min-h-11 text-left font-medium text-accent-text hover:underline" onClick={()=>setSelected(row.id)}>{row.action}</button><span className="block text-xs text-fg-3">{row.entity}</span></Td>
          <Td className="whitespace-nowrap">{when(row.at)}</Td>
          <Td>{row.company??"—"}</Td>
          <Td>{row.outcome?<Badge>{row.outcome}</Badge>:<span className="text-fg-3">—</span>}</Td>
        </tr>)}</tbody>
      </Table>}
      {result.total>pageSize&&<div className="flex items-center justify-between gap-2 border-t border-border p-3">
        <Button className="min-h-11" disabled={page===0} onClick={()=>load(applied,page-1)}>Previous</Button>
        <span className="text-xs text-fg-3">Page {page+1} of {Math.ceil(result.total/pageSize)}</span>
        <Button className="min-h-11" disabled={(page+1)*pageSize>=result.total} onClick={()=>load(applied,page+1)}>Next</Button>
      </div>}
    </Card>}
  </div>;
}
