"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { useCRM, useMe } from "@/lib/store";
import { shareKinds, type PortalAccount, type PortalMessage, type PortalDecision, type ShareKind } from "@/lib/domain/clientPortal";

type Choice={kind:ShareKind;id:string;title:string;shared:boolean;version?:number;olderShared?:boolean};
type ClientView={accounts:PortalAccount[];choices:Choice[];messages:PortalMessage[];decisions:(PortalDecision&{title:string})[]};
const labels:Record<ShareKind,string>={campaign:"Campaigns and performance",report:"Approved reports",upload:"Uploaded report previews",creative:"Creative review",task:"Tasks",document:"Document links",invoice:"Invoices",meeting:"Meetings"};

function PortalAccess() {
  const params=useSearchParams();
  const clients=useCRM(s=>s.clients);
  const me=useMe();
  const [selected,setSelected]=useState(params.get("client")??"");
  const client=clients.find(c=>c.id===selected)??clients[0];
  const clientId=client?.id;
  const [saved,setSaved]=useState<{client:string;data:ClientView}>();
  const [creds,setCreds]=useState<{email:string;password:string}>();
  const [kind,setKind]=useState<ShareKind>("campaign");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const view=saved?.client===clientId?saved?.data:undefined;
  const refresh=useCallback(async()=>{
    if(!clientId||me.role!=="admin")return;
    const res=await fetch("/api/client-portal?client="+encodeURIComponent(clientId),{cache:"no-store",signal:AbortSignal.timeout(20000)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error??"Could not load portal access.");
    setSaved({client:clientId,data});
  },[clientId,me.role]);
  useEffect(()=>{
    let live=true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
    void refresh().catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  },[refresh]);
  const act=async(action:object,message:string)=>{
    setError("");setNotice("");setBusy(true);
    try {
      await flushCRMChanges();
      const res=await fetch("/api/client-portal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...action,clientId}),signal:AbortSignal.timeout(30000)});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error??"Could not update portal access.");
      if(data.password)setCreds(data);
      await refreshCRMChanges();
      await refresh();
      setNotice(message);
      return true;
    }catch(e){setError((e as Error).message);return false;}
    finally{setBusy(false);}
  };
  const emails=[...new Set((client?.contacts??[]).map(c=>c.email?.trim().toLowerCase()).filter(Boolean))].filter(email=>!view?.accounts.some(a=>a.email===email));
  const post=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const form=e.currentTarget;
    if(await act({action:"message",id:crypto.randomUUID(),text:new FormData(form).get("message")},"Message posted in the client portal."))form.reset();
  };

  return <div className="min-w-0 space-y-4">
    <PageHeader title="Client portal access" icon={<ShieldCheck size={20} className="text-accent-text"/>} description="Create a separate client login and choose which records appear in its workspace."
      actions={<Button href="/portal/login" className="min-h-11">Client sign-in page</Button>}/>
    {me.role!=="admin"?<Card className="p-4"><p>An agency administrator manages client portal access.</p></Card>:!client?<Card className="p-4"><p>Create a CRM client first.</p></Card>:<>
      <Card className="p-4"><Field label="Manage client"><Select value={clientId} disabled={busy} className="min-h-11 sm:max-w-xs" onChange={e=>{setSelected(e.target.value);setCreds(undefined);setNotice("");setError("");}}>
        {clients.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field></Card>
      {error&&<p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-danger">{error}</p>}
      {notice&&<p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">{notice}</p>}
      {creds&&<Card className="space-y-3 border-accent p-4">
        <h2 className="font-semibold">Client sign-in details</h2>
        <p className="break-all text-sm">{creds.email}</p><code className="block break-all text-sm">{creds.password}</code>
        <p className="text-sm text-fg-2">Copy this temporary password now. Ask the client to change it after signing in.</p>
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" onClick={()=>void navigator.clipboard.writeText(creds.password).then(()=>setNotice("Temporary password copied.")).catch(()=>setError("Select and copy the password above."))}>Copy password</Button>
          <Button className="min-h-11" onClick={()=>setCreds(undefined)}>Hide password</Button></div>
      </Card>}
      <Card>
        <CardHeader title="Client logins" subtitle="Use a saved contact email that is separate from the agency login."/>
        <div className="space-y-4 p-4">
          {view?.accounts.length?<ul className="divide-y divide-border">{view.accounts.map(a=><li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0 break-all text-sm">{a.email} <Badge tone={a.active?"success":"neutral"}>{a.active?"Active":"Paused"}</Badge></div>
            <Button className="min-h-11" disabled={busy} onClick={()=>void act({action:"access",userId:a.userId,active:!a.active},a.active?"Portal access paused.":"Portal access restored.")}>{a.active?"Pause access":"Restore access"}</Button>
          </li>)}</ul>:<p className="text-sm text-fg-2">{view?"No portal logins yet.":"Loading portal access…"}</p>}
          {!!emails.length&&view&&<form className="flex flex-wrap items-end gap-2" onSubmit={e=>{
            e.preventDefault();void act({action:"create",email:new FormData(e.currentTarget).get("email")},"Client login created.");
          }}><Field label="Saved contact" className="min-w-0 flex-1"><Select name="email" className="min-h-11">{emails.map(email=><option key={email}>{email}</option>)}</Select></Field>
            <Button type="submit" variant="primary" className="min-h-11" disabled={busy||!!creds}>Create client login</Button></form>}
          {!emails.length&&<p className="text-sm text-fg-2">Add a client contact in Client Management to create another login.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Shared records" subtitle="Only the selected records appear in this client’s portal."/>
        <div className="p-4"><Field label="Record category"><Select value={kind} className="min-h-11 sm:max-w-xs" onChange={e=>setKind(e.target.value as ShareKind)}>
          {shareKinds.map(item=><option key={item} value={item}>{labels[item]}</option>)}</Select></Field></div>
        {view?.choices.some(c=>c.kind===kind)?<ul className="divide-y divide-border border-t border-border">
          {view.choices.filter(c=>c.kind===kind).map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 break-words text-sm font-medium">{item.title} {item.shared&&<Badge tone="success">Shared</Badge>}{item.olderShared&&<Badge tone="warning">Older version shared</Badge>}</div>
            <div className="flex flex-wrap gap-2">
              {!item.shared&&<Button className="min-h-11" disabled={busy} onClick={()=>void act({action:"share",kind:item.kind,id:item.id,version:item.version,enabled:true},"Record shared in the portal.")}>{item.olderShared?"Share latest version":"Share record"}</Button>}
              {(item.shared||item.olderShared)&&<Button className="min-h-11" disabled={busy} onClick={()=>void act({action:"share",kind:item.kind,id:item.id,enabled:false},"Record removed from the portal.")}>Stop sharing</Button>}
            </div>
          </li>)}</ul>:<p className="px-4 pb-4 text-sm text-fg-2">{kind==="report"?"Approve a generated report in AI Client Reporting to make it available here.":kind==="upload"?"Link a report company exclusively to this client in the Client 360° overview before sharing its tables.":kind==="document"?"Add an HTTPS document link to the client profile.":"No eligible records in this category."}</p>}
      </Card>
      <Card>
        <CardHeader title="Client creative decisions" subtitle="Decisions are recorded against the version the client reviewed."/>
        {view?.decisions.length?<ul className="divide-y divide-border">{view.decisions.map(item=><li key={item.fingerprint+item.creativeId} className="break-words p-4 text-sm">
          <p><strong>{item.title}</strong> · {item.verdict} · {item.at.slice(0,10)}</p>{item.feedback&&<p className="mt-1 text-fg-2">{item.feedback}</p>}
        </li>)}</ul>:<p className="p-4 text-sm text-fg-2">No client decisions yet.</p>}
      </Card>
      <Card>
        <CardHeader title="Portal messages" subtitle="Messages posted here are visible to this client." action={<Button className="min-h-11" onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh messages</Button>}/>
        {view?.messages.length?<ul className="divide-y divide-border">{view.messages.map(m=><li key={m.id} className="break-words p-4 text-sm">
          <p className="text-xs text-fg-2">{m.from} · {m.at.slice(0,10)}</p><p className="whitespace-pre-wrap">{m.text}</p>
        </li>)}</ul>:<p className="p-4 text-sm text-fg-2">No portal messages yet.</p>}
        <form className="space-y-2 border-t border-border p-4" onSubmit={post}>
          <Field label="Message to client"><Textarea name="message" required maxLength={2000}/></Field>
          <Button type="submit" disabled={busy||!view} variant="primary" className="min-h-11">Post portal message</Button>
        </form>
      </Card>
    </>}
  </div>;
}
export default function PortalAccessPage(){return <Suspense><PortalAccess/></Suspense>;}
