"use client";

import {useCallback,useEffect,useState} from "react";
import {ShieldCheck} from "lucide-react";
import {useAuth} from "@/components/auth/AuthProvider";
import {Badge,Button,Card,CardHeader,Select,Table,Td,Th} from "@/components/ui";
import {LEAD_STATUSES,type Role} from "@/lib/types";
import {ROLE_LABEL} from "@/lib/permissions";
import {fmtShort,money} from "@/lib/utils";

type Item={id:string;title:string;company?:string;industry?:string;status?:string;platform?:string;folder?:string;priority?:string;dueDate?:string;balance?:number};
const panels={tasks:"My tasks",leads:"Leads",clients:"Clients",campaigns:"Campaigns",documents:"Documents",reports:"Reports",invoices:"Invoices"};
type Panel=keyof typeof panels;
type Workspace={organization:string;member:{name:string;role:Role}} & Partial<Record<Panel,{rows:Item[];writable?:boolean}>>;
export default function StaffWorkspace(){
  const {signOut}=useAuth();
  const [data,setData]=useState<Workspace>();
  const [tab,setTab]=useState<Panel>();
  const [error,setError]=useState(""),[busy,setBusy]=useState("");
  const load=useCallback(async()=>{
    const response=await fetch("/api/staff/workspace",{cache:"no-store"});
    const body=await response.json();
    if(!response.ok){setData(undefined);throw new Error(body.error);}
    setData(body);
    setError("");
  },[]);
  useEffect(()=>{
    const refresh=()=>void load().catch(error=>setError(error.message));
    refresh();
    const interval=setInterval(refresh,15000);
    window.addEventListener("focus",refresh);
    return()=>{clearInterval(interval);window.removeEventListener("focus",refresh);};
  },[load]);
  const visible=(Object.keys(panels) as Panel[]).filter(key=>data?.[key]);
  const active=tab&&visible.includes(tab)?tab:visible[0];
  const panel=active?data?.[active]:undefined;
  async function change(item:Item,status:string){
    if(!active||!item.status)return;
    setBusy(item.id);setError("");
    try{
      const response=await fetch("/api/staff/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:active==="tasks"?"taskStatus":"leadStatus",id:item.id,status,previous:item.status})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error);
      await load();
    }catch(error){setError(error instanceof Error?error.message:"Could not save the change.");}
    finally{setBusy("");}
  }
  return <main className="mx-auto min-h-dvh max-w-6xl space-y-5 p-4 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div><p className="mb-1 inline-flex items-center gap-2 text-xs font-medium text-accent-text"><ShieldCheck className="size-4"/> Staff Workspace</p>
        <h1 className="break-words text-3xl font-semibold">{data?.organization??"Your workspace"}</h1>
        {data&&<p className="mt-2 text-sm text-fg-2">{data.member.name} · {ROLE_LABEL[data.member.role]}</p>}
      </div>
      <Button className="min-h-11" onClick={()=>void signOut().catch(error=>setError(error.message))}>Sign out</Button>
    </header>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {!data&&!error&&<p role="status" className="text-sm text-fg-2">Loading your workspace…</p>}
    {data&&<nav className="flex flex-wrap gap-2" aria-label="Staff workspace sections">
      {visible.map(key=><Button key={key} className="min-h-11" aria-pressed={key===active} variant={key===active?"primary":"secondary"} onClick={()=>setTab(key)}>{panels[key]}</Button>)}
    </nav>}
    {data&&(!active||!panel)?<Card className="p-4 text-sm text-fg-2">Your role has no access to the available staff sections.</Card>:null}
    {active&&panel&&<Card>
      <CardHeader title={panels[active]} subtitle={panel.rows.length+" records shown"}/>
      {!panel.rows.length?<p className="px-4 pb-4 text-sm text-fg-2">No records in this section yet.</p>:
      <Table><thead><tr><Th>Name</Th><Th>Details</Th><Th>{active==="documents"?"File":"Status"}</Th></tr></thead>
        <tbody>{panel.rows.map(item=><tr key={item.id}>
          <Td className="font-medium">{item.title}</Td>
          <Td className="text-fg-2">{[item.company,item.industry,item.platform,item.folder,item.priority,item.dueDate?fmtShort(item.dueDate):undefined,item.balance===undefined?undefined:money(item.balance)].filter(Boolean).join(" · ")||"—"}</Td>
          <Td>{active==="documents"?<a className="inline-flex min-h-11 items-center text-accent-text underline" href={"/api/staff/workspace?asset="+encodeURIComponent(item.id)}>Download</a>:
            panel.writable&&item.status?<Select className="min-h-11" aria-label={"Status for "+item.title} value={item.status} disabled={!!busy} onChange={event=>void change(item,event.target.value)}>
              {(active==="tasks"?["Todo","In Progress","Blocked","Done"]:LEAD_STATUSES).map(status=><option key={status}>{status}</option>)}
            </Select>:item.status?<Badge>{item.status}</Badge>:"—"}</Td>
        </tr>)}</tbody>
      </Table>}
    </Card>}
  </main>;
}
