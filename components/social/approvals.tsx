"use client";
import {useState} from "react";
import type {SocialPost} from "@/lib/types";
import {Badge,Button,Card,Field,Input,Select,Textarea} from "@/components/ui";
import type {useStudio} from "./useStudio";

type Studio=ReturnType<typeof useStudio>;
const CHANNELS=["Email","WhatsApp","Phone","Meeting","Other"] as const;

/**
 * Approval queue with comments, revision requests, version history and optional client sign-off.
 * Client sign-off is recorded by the team (who approved and how); there is no client login.
 */
export function ApprovalsTab({posts,studio,writable,onOpen,approvedDigest}:{posts:SocialPost[];studio:Studio;writable:boolean;onOpen:(p:SocialPost)=>void;approvedDigest:(p:SocialPost)=>boolean}){
  const {data,act,busy}=studio,[selected,setSelected]=useState(""),[text,setText]=useState(""),[client,setClient]=useState({name:"",channel:"WhatsApp" as typeof CHANNELS[number],note:""});
  if(!data)return <p className="text-sm text-fg-2">Loading approvals…</p>;
  const needsClient=data.settings.requireClientApproval;
  const queue=posts.filter(p=>p.stage!=="Published"&&(p.stage==="AI Review"||(p.stage==="Awaiting Approval"&&!p.humanApproval)||(needsClient&&p.humanApproval&&data.threads[p.id]?.clientApproval?.digest===undefined)||(data.threads[p.id]?.entries.at(-1)?.kind==="revision"&&p.stage==="Draft")));
  const post=posts.find(p=>p.id===selected)??queue[0],thread=post?data.threads[post.id]:undefined;
  const clientOk=!!post&&!!thread?.clientApproval&&approvedDigest(post);
  const status=(p:SocialPost)=>p.stage==="Draft"&&data.threads[p.id]?.entries.at(-1)?.kind==="revision"?"Revision requested":p.humanApproval?(needsClient&&!data.threads[p.id]?.clientApproval?"Waiting for client":"Approved"):p.stage;
  return <div className="space-y-5">
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-semibold">Approval levels</h2><p className="mt-1 text-sm text-fg-2">{needsClient?"Two levels: AI review → your team approves → client signs off. Posts cannot be scheduled until the client's approval is recorded.":"One level: AI review → your team approves. Turn on client sign-off if this client approves every post."}</p></div>
      {writable&&<label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={needsClient} disabled={!!busy} onChange={e=>act("settings",{clientId:posts[0]?.clientId??"",requireClientApproval:e.target.checked,brandVoice:data.settings.brandVoice},e.target.checked?"Client sign-off is now required.":"Client sign-off turned off.")}/>Client must sign off every post</label>}</Card>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-2"><h3 className="text-sm font-semibold">Needs attention · {queue.length}</h3>
        {queue.map(p=><button key={p.id} onClick={()=>setSelected(p.id)} className={`min-h-11 w-full rounded-lg border p-3 text-left text-sm ${post?.id===p.id?"border-accent":"border-border"} hover:border-accent`}><div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">{p.platform} · {p.format}<Badge tone={status(p)==="Revision requested"?"warning":status(p)==="Waiting for client"?"info":"accent"}>{status(p)}</Badge>{(data.threads[p.id]?.entries.length??0)>0&&<span>{data.threads[p.id].entries.length} comments</span>}</div><p className="mt-1 font-medium">{p.title}</p></button>)}
        {!queue.length&&<p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-2">Nothing waiting. Posts appear here after AI review, while waiting for approval or client sign-off, and when a revision is requested.</p>}
      </section>
      {post?<Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-fg-2">{post.platform} · {post.format} · {status(post)}</p><h3 className="font-semibold">{post.title}</h3></div><Button className="min-h-11" onClick={()=>onOpen(post)}>Open post</Button></div>
        <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm"><p className="font-medium">{post.hook}</p><p className="whitespace-pre-wrap leading-6">{post.caption||"No caption yet."}</p><p className="text-accent-text">{post.hashtags.join(" ")}</p></div>
        {post.review&&<p className="text-sm">AI review: <Badge>{post.review.score}/100</Badge> <span className="text-fg-2">{post.review.notes[0]}</span></p>}
        {needsClient&&post.humanApproval&&(clientOk?<p className="text-sm text-success">Client approved: {thread!.clientApproval!.name} via {thread!.clientApproval!.channel}, {new Date(thread!.clientApproval!.at).toLocaleString("en-IN")}.</p>
          :writable&&<div className="space-y-2 rounded-lg border border-border p-3"><h4 className="text-sm font-semibold">Record client approval</h4><p className="text-xs text-fg-2">After the client approves this exact version by email, WhatsApp, phone or in a meeting.</p>
            <div className="grid gap-2 sm:grid-cols-2"><Field label="Approved by"><Input className="min-h-11" value={client.name} placeholder="Client contact name" onChange={e=>setClient({...client,name:e.target.value})}/></Field><Field label="How"><Select className="min-h-11" value={client.channel} onChange={e=>setClient({...client,channel:e.target.value as typeof client.channel})}>{CHANNELS.map(c=><option key={c}>{c}</option>)}</Select></Field></div>
            <Field label="Note (optional)"><Input className="min-h-11" value={client.note} onChange={e=>setClient({...client,note:e.target.value})}/></Field>
            <Button className="min-h-11" variant="primary" loading={busy==="client-approval"} disabled={!!busy||client.name.trim().length<2} onClick={async()=>{if(await act("client-approval",{postId:post.id,...client},"Client approval recorded. The post can now be scheduled."))setClient({name:"",channel:"WhatsApp",note:""});}}>Record client approval</Button></div>)}
        {writable&&<div className="space-y-2"><Field label="Comment or change request"><Textarea rows={3} value={text} onChange={e=>setText(e.target.value)}/></Field><div className="flex flex-wrap gap-2">
          <Button className="min-h-11" loading={busy==="comment"} disabled={!!busy||text.trim().length<2} onClick={async()=>{if(await act("comment",{postId:post.id,text},"Comment added."))setText("");}}>Add comment</Button>
          <Button className="min-h-11" variant="danger" loading={busy==="revision"} disabled={!!busy||text.trim().length<2||post.stage==="Published"} onClick={async()=>{if(await act("revision",{postId:post.id,text},"Sent back for revision. The post is a draft again."))setText("");}}>Request revision</Button></div></div>}
        <div><h4 className="text-sm font-semibold">Activity</h4>{thread?.entries.length?<ol className="mt-2 space-y-2">{thread.entries.slice().reverse().map(e=><li key={e.id} className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-fg-2">{e.byName} · {new Date(e.at).toLocaleString("en-IN")} · {e.kind==="revision"?"Revision request":e.kind==="client-approval"?"Client approval":"Comment"}</p><p className="mt-1 whitespace-pre-wrap">{e.text}</p></li>)}</ol>:<p className="mt-1 text-sm text-fg-2">No comments yet.</p>}</div>
        <details><summary className="min-h-11 cursor-pointer text-sm font-semibold">Version history ({thread?.versions.length??0})</summary>{thread?.versions.length?<ol className="mt-2 space-y-2">{thread.versions.map((v,i)=><li key={i} className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-fg-2">Before the edit on {new Date(v.at).toLocaleString("en-IN")} · {v.platform} {v.format}</p><p className="mt-1 font-medium">{v.title}</p><p>{v.hook}</p><p className="mt-1 line-clamp-4 whitespace-pre-wrap text-fg-2">{v.caption}</p></li>)}</ol>:<p className="mt-1 text-sm text-fg-2">Earlier versions are kept each time the content is edited.</p>}</details>
      </Card>:<Card className="p-6 text-sm text-fg-2">Select a post to review.</Card>}
    </div>
  </div>;
}
