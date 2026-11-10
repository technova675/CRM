"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, FileText, LogOut } from "lucide-react";
import { ReviewWorkspace } from "@/components/creative/ReviewWorkspace";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { metrics } from "@/lib/domain/analyticsEngine";
import type { portalUploads, portalUploadPreview, PortalView } from "@/lib/clientPortalServer";
import { notifyAuthChange } from "@/components/auth/notify";

const sections=["Dashboard","Campaigns","Performance","Reports","Creative approvals","Tasks","Documents","Invoices","Meetings","Messages"] as const;
type ClientView=PortalView&{libraryAssets:{id:string;name:string;folder:string}[];reviewPending:number;uploads:Awaited<ReturnType<typeof portalUploads>>};
type UploadPreview=Awaited<ReturnType<typeof portalUploadPreview>>;
type Section=typeof sections[number];
const date=(s:string)=>s.slice(0,10);
const number=new Intl.NumberFormat("en-IN",{maximumFractionDigits:2});
const money=(value:number)=>"INR "+number.format(value);
const time=(value:string)=>new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(value))+" IST";
function List<T>({items,empty,render}:{items:T[];empty:string;render:(item:T)=>ReactNode}) {
  return items.length?<ul className="divide-y divide-border">{items.map((item,index)=><li key={index} className="min-w-0 break-words p-4">{render(item)}</li>)}</ul>:<p className="p-4 text-sm text-fg-2">{empty}</p>;
}

export function ClientPortal() {
  const [view,setView]=useState<ClientView>(),[tab,setTab]=useState<Section>("Dashboard");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[password,setPassword]=useState(false);
  const [preview,setPreview]=useState<{id:string;data:UploadPreview}>();
  const refresh=useCallback(async()=>{
    const res=await fetch("/api/portal",{cache:"no-store",signal:AbortSignal.timeout(20000)});
    if(res.status===401||res.status===403){setView(undefined);setPreview(undefined);setLocked(true);return;}
    const data=await res.json();
    if(!res.ok)throw new Error(data.error??"Could not load your client workspace.");
    setView(data);setLocked(false);setPreview(current=>current&&data.uploads.some((f:{id:string})=>f.id===current.id)?current:undefined);
  },[]);
  useEffect(()=>{
    const load=()=>void refresh().catch(e=>setError(e.message));
    const authChanged=(event:StorageEvent)=>{if(event.key==="adbibe-auth-event"){setView(undefined);load();}};
    load();
    const timer=setInterval(()=>{if(document.visibilityState==="visible")load();},20000);
    window.addEventListener("focus",load);
    window.addEventListener("storage",authChanged);
    return()=>{clearInterval(timer);window.removeEventListener("focus",load);window.removeEventListener("storage",authChanged);};
  },[refresh]);

  const submit=async(body:object,success:string,url="/api/portal")=>{
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const result=await res.json();
      if(!res.ok)throw new Error(result.error??"Could not save your change.");
      await refresh();
      setNotice(success);
      return true;
    }catch(e){setError((e as Error).message);return false;}
    finally{setBusy(false);}
  };
  const openPreview=async(id:string,table?:string)=>{
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/portal?"+new URLSearchParams({upload:id,...(table?{table}:{})}),{cache:"no-store",signal:AbortSignal.timeout(25000)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Could not open the report preview.");
      setPreview({id,data});
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  };
  const signOut=async()=>{
    setBusy(true);setError("");
    try {
      const res=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signout"})});
      if(!res.ok)throw new Error("Could not sign out. Please try again.");
      setView(undefined);
      notifyAuthChange();
      window.location.replace("/portal/login");
    } catch(e){setError((e as Error).message);setBusy(false);}
  };
  const message=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const form=e.currentTarget;
    if(await submit({action:"message",id:crypto.randomUUID(),text:new FormData(form).get("message")},"Message posted to the portal."))form.reset();
  };
  return <main className="mx-auto min-h-dvh max-w-7xl space-y-5 px-4 py-6 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0"><p className="flex items-center gap-2 text-sm text-accent-text"><Building2 size={17} aria-hidden="true"/>Adbibe client portal</p>
        <h1 className="mt-1 break-words text-2xl font-semibold sm:text-3xl">{view?.company??"Client workspace"}</h1></div>
      <div className="flex flex-wrap gap-2">
        {view&&<Button className="min-h-11" onClick={()=>setPassword(!password)}>Change password</Button>}
        <Button className="min-h-11" disabled={busy} icon={<LogOut size={16}/>} onClick={()=>void signOut()}>Sign out</Button>
      </div>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-danger">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">{notice}</p>}
    {locked&&<Card className="space-y-3 p-5"><p>Your session has expired or portal access is paused.</p><Button href="/portal/login" className="min-h-11">Go to client sign-in</Button></Card>}
    {!view&&!locked&&<p role="status" className="text-sm text-fg-2">{error?"Use Refresh to try again.":"Loading your client workspace…"}</p>}
    {!view&&!locked&&error&&<Button onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh</Button>}
    {view&&<>
      {password&&<Card><CardHeader title="Change password"/><form className="space-y-3 p-4" onSubmit={async e=>{
        e.preventDefault();const value=new FormData(e.currentTarget).get("password");
        if(await submit({action:"password",password:value},"Password updated.","/api/portal/session"))setPassword(false);
      }}><Field label="New password" hint="Use at least 12 characters."><Input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="min-h-11"/></Field>
        <Button disabled={busy} type="submit" className="min-h-11" variant="primary">Save password</Button></form></Card>}
      <nav aria-label="Client workspace views" className="flex flex-wrap gap-2">
        {sections.map(item=><Button key={item} aria-pressed={tab===item} variant={tab===item?"primary":"secondary"} className="min-h-11" onClick={()=>setTab(item)}>{item}</Button>)}
      </nav>
      {tab==="Dashboard"&&<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([["Campaigns",view.campaigns.length],["Reports",view.reports.length+view.uploads.length],["Creative approvals",view.creatives.filter(c=>!c.decision).length+view.reviewPending],["Tasks",view.tasks.filter(t=>t.status!=="Done").length]] as const).map(([name,count])=>
          <button type="button" onClick={()=>setTab(name)} key={name} className="min-h-24 rounded-xl border border-border bg-surface p-4 text-left hover:border-accent"><span className="block text-sm text-fg-2">{name}</span><span className="mt-1 block text-2xl font-semibold tabular-nums">{count}</span></button>)}
      </div>}
      {tab!=="Dashboard"&&<Card>
        <CardHeader title={tab} subtitle={tab==="Performance"?"Measured campaign results from the latest 30 recorded calendar days. Each platform is shown separately.":undefined}/>
        {tab==="Campaigns"&&<List items={view.campaigns} empty="No campaigns have been shared." render={c=><><p className="font-medium">{c.name} <Badge>{c.status}</Badge></p><p className="mt-1 text-sm text-fg-2">{c.channels.filter(Boolean).join(" · ")} · {date(c.start)} to {date(c.end)}</p></>}/>}
        {tab==="Performance"&&<List items={view.performance} empty="No campaign performance has been shared." render={c=><div className="space-y-3"><h3 className="font-medium">{c.name}</h3>
          {c.series.length?c.series.map(s=><section key={s.platform} className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{s.platform} · {s.start} to {s.end}</p><p className="text-xs text-fg-2">{s.days} days with records</p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{s.metrics.map(m=><div key={m.key}><dt className="text-xs text-fg-2">{metrics[m.key]}</dt>
              <dd className="text-sm font-medium tabular-nums">{m.value===null?"—":["spend","cpa","revenue"].includes(m.key)?money(m.value):number.format(m.value)+(m.key==="roas"?"×":"")}</dd>
              <p className="text-xs text-fg-2">{m.measured}/{m.rows} rows measured</p></div>)}</dl></section>):<p className="text-sm text-fg-2">No dated performance measurements are available for this campaign.</p>}
        </div>}/>}
        {tab==="Reports"&&<List items={view.reports} empty="No approved reports have been shared." render={r=><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{r.frequency} performance report</p><p className="text-sm text-fg-2">{r.start} to {r.end}</p></div><a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm" href={"/api/portal?report="+encodeURIComponent(r.id)}><FileText size={16}/>Download PDF</a></div>}/>}
        {tab==="Reports"&&!!view.uploads.length&&<>
          <div className="border-t border-border px-4 pt-4 text-sm font-medium">Uploaded report previews</div>
          <List items={view.uploads} empty="" render={f=><div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{f.name} · {date(f.createdAt)}</p>
            <Button className="min-h-11" disabled={busy} onClick={()=>void openPreview(f.id)}>Preview tables</Button>
          </div>}/>
          {preview&&<div className="min-w-0 space-y-3 border-t border-border p-4">
            <h3 className="break-words font-medium">{preview.data.name}</h3>
            <Field label="Report table"><Select className="min-h-11" value={preview.data.table} disabled={busy} onChange={e=>void openPreview(preview.id,e.target.value)}>
              {preview.data.tables.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </Select></Field>
            <p className="text-xs text-fg-2">Preview shows up to 25 rows and 16 columns.</p>
            <div className="max-w-full overflow-x-auto"><table className="text-left text-sm">
              <thead><tr>{preview.data.columns.map((cell,i)=><th key={i} scope="col" className="min-w-20 p-2">{cell}</th>)}</tr></thead>
              <tbody>{preview.data.rows.map((row,i)=><tr key={i} className="border-t border-border">{preview.data.columns.map((_,j)=><td key={j} className="max-w-56 break-words p-2">{row[j]??"—"}</td>)}</tr>)}</tbody>
            </table></div>
          </div>}
        </>}
        {tab==="Creative approvals"&&<div className="border-b border-border p-4"><ReviewWorkspace portal/></div>}
        {tab==="Creative approvals"&&<List items={view.creatives} empty="No creative versions have been shared for review." render={c=><div className="space-y-3">
          <div><h3 className="font-medium">{c.title}</h3><p className="text-xs text-fg-2">{c.platform} · {c.format} · Version {c.version}</p></div>
          {c.headline&&<p className="font-medium">{c.headline}</p>}{c.body&&<p className="whitespace-pre-wrap text-sm">{c.body}</p>}
          {c.cta&&<p className="text-sm">CTA {c.cta}</p>}{c.storyboard?.map((line,i)=><p key={i} className="text-sm">{line}</p>)}
          {c.fileName&&<p className="text-xs text-fg-2">File reference {c.fileName}</p>}
          {c.decision?<><Badge tone={c.decision==="Approved"?"success":"warning"}>{c.decision}</Badge>{c.feedback&&<p className="text-sm">{c.feedback}</p>}</>:
            <form className="space-y-2" onSubmit={e=>{
              e.preventDefault();const values=new FormData(e.currentTarget),submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
              void submit({action:"decision",creativeId:c.id,fingerprint:c.hash,verdict:submitter.value,feedback:values.get("feedback")},"Creative decision recorded.");
            }}><Field label="Review feedback" hint="Required when requesting changes."><Textarea name="feedback" maxLength={1000}/></Field>
              <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={busy} value="Approved" variant="primary">Approve creative</Button>
                <Button type="submit" className="min-h-11" disabled={busy} value="Changes requested">Request changes</Button></div>
            </form>}
        </div>}/>}
        {tab==="Tasks"&&<List items={view.tasks} empty="No tasks have been shared." render={t=><><p className="font-medium">{t.title} <Badge>{t.status}</Badge></p><p className="text-sm text-fg-2">Due {date(t.due)}</p></>}/>}
        {tab==="Documents"&&!!view.libraryAssets?.length&&<List items={view.libraryAssets} empty="" render={item=><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{item.name}</p><p className="text-xs text-fg-2">{item.folder}</p></div><a className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm" href={"/api/portal?asset="+encodeURIComponent(item.id)}>Download file</a></div>}/>}
        {tab==="Documents"&&(!view.libraryAssets?.length||!!view.documents.length)&&<List items={view.documents} empty="No document links have been shared." render={d=><a className="inline-flex min-h-11 items-center text-sm text-accent-text underline" href={d.url} target="_blank" rel="noreferrer">{d.name}</a>}/>}
        {tab==="Invoices"&&<List items={view.invoices} empty="No invoices have been shared." render={i=><><p className="font-medium">{i.number} <Badge>{i.status}</Badge></p><p className="mt-1 text-sm">{money(i.amount)} · {money(i.paid)} paid</p><p className="text-sm text-fg-2">Issued {date(i.issued)} · Due {date(i.due)}</p></>}/>}
        {tab==="Meetings"&&<List items={view.meetings} empty="No meetings have been shared." render={m=><><p className="font-medium">{m.title}</p><p className="text-sm text-fg-2">{time(m.starts)} · {m.minutes} min</p>{m.url&&<a className="inline-flex min-h-11 items-center text-sm text-accent-text underline" href={m.url} target="_blank" rel="noreferrer">Open meeting link</a>}</>}/>}
        {tab==="Messages"&&<>
          <List items={view.messages} empty="No portal messages yet." render={m=><><p className="text-xs text-fg-2">{m.from} · {time(m.at)}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p></>}/>
          <form className="space-y-2 border-t border-border p-4" onSubmit={message}><Field label="Message for your account team"><Textarea name="message" required maxLength={2000}/></Field>
            <Button type="submit" className="min-h-11" disabled={busy} variant="primary">Post message</Button></form>
        </>}
      </Card>}
    </>}
  </main>;
}
