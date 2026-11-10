"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import { Badge,Button,Card,CardHeader,Field,Input,Select,Textarea } from "@/components/ui";
import { useCRM } from "@/lib/store";
import { flushCRMChanges,refreshCRMChanges } from "@/lib/crmSync";
import { reviewFormats,type CreativeReview,type Revision } from "@/lib/domain/creativeReviews";

type PortalReview=Omit<CreativeReview,"clientId">;
const blank={title:"",url:"",copy:""};
export function ReviewWorkspace({portal=false,writable=true}:{portal?:boolean;writable?:boolean}){
  const clients=useCRM(s=>s.clients);
  const [reviews,setReviews]=useState<(CreativeReview|PortalReview)[]>([]);
  const [selected,setSelected]=useState(""),[version,setVersion]=useState(0);
  const [editor,setEditor]=useState<"create"|"revise"|"">("");
  const [pending,setPending]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const endpoint=portal?"/api/portal/reviews":"/api/creative-reviews";
  const refresh=useCallback(async()=>{
    const res=await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    const result=await res.json();
    if(!res.ok){if(portal&&(res.status===403||res.status===401))setReviews([]);throw new Error(result.error??"Could not load reviews.");}
    setReviews(result.reviews);
  },[endpoint,portal]);
  useEffect(()=>{const load=()=>void refresh().catch(e=>setError(e.message));load();const timer=setInterval(load,20000);return()=>clearInterval(timer);},[refresh]);
  const review=reviews.find(r=>r.id===selected)??reviews[0];
  const latest=review?.revisions.at(-1);
  const current=review?.revisions.find(r=>r.version===version)??latest;
  const act=async(body:object,notice:string)=>{
    setPending(true);setError("");setStatus("");
    try{
      if(!portal)await flushCRMChanges();
      const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const result=await res.json();
      if(!res.ok)throw new Error(result.error??"Could not save review.");
      if(!portal)await refreshCRMChanges();
      await refresh();setStatus(notice);return true;
    }catch(e){setError((e as Error).message);return false;}
    finally{setPending(false);}
  };
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    const content={title:f.get("title"),url:f.get("url"),copy:f.get("copy")};
    const id=editor==="create"?crypto.randomUUID():review?.id;
    const body=editor==="create"?{action:"create",id,clientId:f.get("client"),audience:f.get("audience"),format:f.get("format"),content}
      :{action:"revise",id,expected:latest?.version,content};
    if(await act(body,editor==="create"?"Review requested.":"New version sent for review.")){
      if(id)setSelected(id);setVersion(0);setEditor("");
    }
  };
  const respond=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!review||!current)return;
    const form=e.currentTarget,text=new FormData(form).get("comment");
    const val=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null)?.value;
    const response={id:review.id,version:current.version,text,decision:val==="comment"?undefined:val};
    if(await act(portal?response:{action:"respond",response},val==="comment"?"Comment posted.":"Decision recorded."))form.reset();
  };
  const canRespond=!!current&&current===latest&&!current.decision&&!review?.archived&&writable;
  const canDecide=portal||review?.audience==="Team";
  return <div className="min-w-0 space-y-4">
    {error&&<p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-danger">{error}</p>}
    {status&&<p role="status" className="text-sm text-fg-2">{status}</p>}
    {!portal&&writable&&<div className="flex flex-wrap gap-2">
      <Button variant="primary" className="min-h-11" disabled={pending||!clients.length} onClick={()=>setEditor("create")}>Request creative review</Button>
      {latest&&!review?.archived&&<Button className="min-h-11" disabled={pending} onClick={()=>setEditor("revise")}>Submit new version</Button>}
    </div>}
    {editor&&<Card><CardHeader title={editor==="create"?"New review request":"New version"} subtitle="The review history keeps each submitted version and its decision."/>
      <form key={editor+review?.id} className="space-y-3 p-4" onSubmit={save}>
        {editor==="create"&&<div className="grid gap-3 sm:grid-cols-3">
          <Field label="Client"><Select name="client" className="min-h-11" required>{clients.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
          <Field label="Review format"><Select name="format" className="min-h-11">{reviewFormats.map(f=><option key={f}>{f}</option>)}</Select></Field>
          <Field label="Requested reviewer"><Select name="audience" className="min-h-11"><option>Team</option><option>Client</option></Select></Field>
        </div>}
        <RevisionFields content={editor==="revise"&&latest?latest:blank}/>
        <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" className="min-h-11" disabled={pending}>{editor==="create"?"Submit review request":"Save version"}</Button><Button type="button" className="min-h-11" onClick={()=>setEditor("")}>Cancel</Button></div>
      </form>
    </Card>}
    {review&&current?<Card>
      <CardHeader title="Review queue" subtitle={portal?"Items your account team has sent for review.":"Select a request to see its content, comments and version history."}/>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
        <Field label="Review request"><Select value={review.id} className="min-h-11" onChange={e=>{setSelected(e.target.value);setVersion(0);setEditor("");}}>
          {reviews.map(r=><option key={r.id} value={r.id}>{r.revisions.at(-1)?.title} · {r.format} · {r.archived?"Archived":r.revisions.at(-1)?.decision?.status??"Awaiting "+r.audience.toLowerCase()}</option>)}
        </Select></Field>
        <Field label="Version history"><Select value={current.version} className="min-h-11" onChange={e=>setVersion(+e.target.value)}>
          {review.revisions.map(v=><option key={v.version} value={v.version}>Version {v.version} · {v.decision?.status??"Pending"}</option>)}
        </Select></Field>
      </div>
      <section className="space-y-3 border-t border-border p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold">{current.title}</h3><Badge>{review.format}</Badge>
          <Badge tone={current.decision?.status==="Approved"?"success":"neutral"}>{current.decision?.status??"Awaiting "+review.audience.toLowerCase()}</Badge></div>
        {current.url&&<a className="inline-flex min-h-11 items-center text-sm text-accent-text underline" href={current.url} target="_blank" rel="noreferrer">Open version preview</a>}
        {current.copy&&<p className="whitespace-pre-wrap break-words text-sm">{current.copy}</p>}
        <ul className="divide-y divide-border">{current.comments.map(c=><li key={c.id} className="py-2 text-sm">
          <p className="text-xs text-fg-2">{c.by} · {c.at.slice(0,10)}</p><p className="whitespace-pre-wrap break-words">{c.text}</p>
        </li>)}</ul>
        {canRespond&&<form key={review.id+current.version} className="space-y-2" onSubmit={respond}>
          <Field label="Review comment" hint="Add feedback when requesting changes. Client reviews share these comments with the client."><Textarea name="comment" maxLength={2000}/></Field>
          <div className="flex flex-wrap gap-2"><Button type="submit" value="comment" className="min-h-11" disabled={pending}>Post comment</Button>
            {canDecide&&<><Button type="submit" value="Approved" className="min-h-11" disabled={pending} variant="primary">Approve version</Button>
              <Button type="submit" value="Changes requested" className="min-h-11" disabled={pending}>Request changes</Button></>}
          </div>
        </form>}
      </section>
    </Card>:<Card className="p-4"><p className="text-sm text-fg-2">No review requests yet.</p></Card>}
  </div>;
}
function RevisionFields({content}:{content:Pick<Revision,"title"|"url"|"copy">}){
  return <>
    <Field label="Review title"><Input name="title" defaultValue={content.title} className="min-h-11" required maxLength={180}/></Field>
    <Field label="HTTPS preview link" hint="Use a link the requested reviewer can open."><Input name="url" defaultValue={content.url} type="url" className="min-h-11" maxLength={1800}/></Field>
    <Field label="Copy or review details"><Textarea name="copy" defaultValue={content.copy} maxLength={5000}/></Field>
  </>;
}
