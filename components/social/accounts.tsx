"use client";
import {useMemo,useState} from "react";
import type {SocialPost} from "@/lib/types";
import {socialPlatforms} from "@/lib/domain/socialWorkspace";
import {accountFacts,postResults,type SocialAccount} from "@/lib/domain/socialStudio";
import {Badge,Button,Card,Field,Input,Modal,Select,Textarea} from "@/components/ui";
import type {useStudio} from "./useStudio";

type Studio=ReturnType<typeof useStudio>;
type Form={id?:string;platform:SocialAccount["platform"];handle:string;url:string;bio:string;category:string;followers:string;following:string;postsCount:string;profileImage:string;notes:string};
const blank:Form={platform:"Instagram",handle:"",url:"",bio:"",category:"",followers:"",following:"",postsCount:"",profileImage:"",notes:""};
const num=(v:string)=>v.trim()===""?null:Number(v.replace(/[,\s]/g,""));
const BIO_LIMIT:Record<string,number>={Instagram:150,X:160,LinkedIn:220,Facebook:255,YouTube:1000};

/** Social account profiles, follower history and the AI account audit. */
export function AccountsTab({clientId,posts,studio,writable}:{clientId:string;posts:SocialPost[];studio:Studio;writable:boolean}){
  const {data,act,busy}=studio,[form,setForm]=useState<Form|null>(null),[snap,setSnap]=useState<{id:string;date:string;followers:string}|null>(null),[deleting,setDeleting]=useState("");
  const results=useMemo(()=>data?postResults(data.metrics,posts,clientId):[],[data,posts,clientId]);
  const open=(a?:SocialAccount)=>setForm(a?{id:a.id,platform:a.platform,handle:a.handle,url:a.url,bio:a.bio,category:a.category,followers:a.followers?.toString()??"",following:a.following?.toString()??"",postsCount:a.postsCount?.toString()??"",profileImage:a.profileImage,notes:a.notes}:{...blank});
  const save=async()=>{if(!form)return;const counts=[form.followers,form.following,form.postsCount].map(num);
    if(counts.some(n=>n!==null&&(!Number.isInteger(n)||n<0))){studio.setError("Follower, following and post counts must be whole numbers.");return;}
    if(await act("account-save",{id:form.id,clientId,platform:form.platform,handle:form.handle.replace(/^@/,""),url:form.url,bio:form.bio,category:form.category,followers:counts[0],following:counts[1],postsCount:counts[2],profileImage:form.profileImage,notes:form.notes},"Account saved."))setForm(null);};
  if(!data)return <p className="text-sm text-fg-2">Loading accounts…</p>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-fg-2">Add each social profile with its current numbers, then run an AI audit. Numbers are entered from the platform app; automatic syncing needs a platform connection.</p>{writable&&<Button className="min-h-11" variant="primary" onClick={()=>open()}>Add account</Button>}</div>
    {!data.accounts.length&&<Card className="p-6 text-sm text-fg-2">No accounts yet. Add the client&apos;s Instagram, Facebook, LinkedIn, X or YouTube profile to start.</Card>}
    {data.accounts.map(a=>{const f=accountFacts(a,results),au=a.audit;return <Card key={a.id} className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">{a.platform} · @{a.handle}</h3><p className="text-xs text-fg-2">{a.category||"No category"}{a.url&&<> · <a className="text-accent-text underline" href={a.url} target="_blank" rel="noreferrer">Open profile</a></>}</p></div>
        {writable&&<div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="primary" loading={busy==="account-audit"} disabled={!!busy||!data.ai} onClick={()=>act("account-audit",{accountId:a.id},"Audit ready. Scroll down to read it.")}>{au?"Re-run AI audit":"Run AI audit"}</Button><Button className="min-h-11" onClick={()=>open(a)}>Edit</Button><Button className="min-h-11" onClick={()=>setSnap({id:a.id,date:new Date().toISOString().slice(0,10),followers:a.followers?.toString()??""})}>Log followers</Button>
          {deleting===a.id?<Button className="min-h-11" variant="danger" disabled={!!busy} onClick={async()=>{await act("account-delete",{accountId:a.id},"Account removed.");setDeleting("");}}>Confirm remove</Button>:<Button className="min-h-11" onClick={()=>setDeleting(a.id)}>Remove</Button>}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6">{[
        ["Followers",a.followers?.toLocaleString("en-IN")??"–"],["Following",a.following?.toLocaleString("en-IN")??"–"],["Posts",a.postsCount?.toLocaleString("en-IN")??"–"],
        ["Follower growth",f.followerGrowth?`${f.followerGrowth.change>=0?"+":""}${f.followerGrowth.change.toLocaleString("en-IN")}${f.followerGrowth.percent!==null?` (${f.followerGrowth.percent.toFixed(1)}%)`:""}`:"Log 2+ dates"],
        ["Avg engagement",f.avgEngagementRate===null?"Not measured":`${f.avgEngagementRate}%`],["Posts per week",f.postsPerWeek===null?"Not measured":String(f.postsPerWeek)],
      ].map(([k,v])=><div key={k}><dt className="text-xs text-fg-2">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}</dl>
      <div><p className="text-xs text-fg-2">Bio ({a.bio.length}/{BIO_LIMIT[a.platform]} characters)</p><p className="mt-1 whitespace-pre-wrap text-sm">{a.bio||"No bio entered."}</p></div>
      {au?<div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">AI audit</h4><Badge tone={au.score>=70?"success":au.score>=45?"warning":"danger"}>{au.score}/100 account health</Badge><span className="text-xs text-fg-2">{new Date(au.at).toLocaleString("en-IN")} · {au.source} · AI opinion</span></div>
        <p className="text-sm leading-6">{au.summary}</p>
        <div className="grid gap-3 md:grid-cols-2">{([["Bio analysis",au.bioAnalysis],["Profile optimization",au.profile],["Content audit",au.content],["Posting frequency",au.frequency],["Growth",au.growth]] as const).map(([t,items])=>items.length>0&&<div key={t} className="rounded-lg border border-border p-3"><h5 className="text-sm font-semibold">{t}</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">{items.map((x,i)=><li key={i}>{x}</li>)}</ul></div>)}</div>
        {au.suggestedBios.length>0&&<div><h5 className="text-sm font-semibold">Suggested bios</h5><ul className="mt-1 space-y-2">{au.suggestedBios.map((b,i)=><li key={i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-surface-2 p-3 text-sm"><span className="whitespace-pre-wrap">{b}</span><span className="text-xs text-fg-2">{b.length}/{BIO_LIMIT[a.platform]} · <button className="min-h-11 text-accent-text underline" onClick={()=>navigator.clipboard?.writeText(b)}>Copy</button></span></li>)}</ul></div>}
        <div><h5 className="text-sm font-semibold">Action plan</h5><ul className="mt-1 space-y-1 text-sm">{au.actions.map((x,i)=><li key={i}><Badge tone={x.priority==="High"?"danger":x.priority==="Medium"?"warning":"neutral"}>{x.priority}</Badge> {x.action}</li>)}</ul></div>
      </div>:<p className="border-t border-border pt-3 text-sm text-fg-2">Not audited yet. The audit reviews the bio, profile, content, posting frequency and growth{results.length?"":"; import results in Analytics for a content and engagement audit"}.</p>}
    </Card>;})}
    {form&&<Modal open size="lg" onClose={()=>!busy&&setForm(null)} title={form.id?"Edit account":"Add social account"} subtitle="Copy the details from the profile page" footer={<><Button className="min-h-11" disabled={!!busy} onClick={()=>setForm(null)}>Cancel</Button><Button className="min-h-11" variant="primary" loading={busy==="account-save"} disabled={!!busy||!form.handle.trim()} onClick={save}>Save account</Button></>}>
      <div className="space-y-3">{studio.error&&<p role="alert" className="rounded-lg border border-danger/30 p-3 text-sm text-danger">{studio.error}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Platform"><Select className="min-h-11" value={form.platform} onChange={e=>setForm({...form,platform:e.target.value as Form["platform"]})}>{socialPlatforms.map(p=><option key={p}>{p}</option>)}</Select></Field><Field label="Handle"><Input className="min-h-11" value={form.handle} placeholder="glowleafskincare" onChange={e=>setForm({...form,handle:e.target.value})}/></Field></div>
        <Field label="Profile link (optional)"><Input className="min-h-11" value={form.url} placeholder="https://www.instagram.com/…" onChange={e=>setForm({...form,url:e.target.value})}/></Field>
        <Field label="Bio" hint={`${form.bio.length}/${BIO_LIMIT[form.platform]} characters`}><Textarea rows={3} value={form.bio} onChange={e=>setForm({...form,bio:e.target.value})}/></Field>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Followers"><Input className="min-h-11" inputMode="numeric" value={form.followers} onChange={e=>setForm({...form,followers:e.target.value})}/></Field><Field label="Following"><Input className="min-h-11" inputMode="numeric" value={form.following} onChange={e=>setForm({...form,following:e.target.value})}/></Field><Field label="Total posts"><Input className="min-h-11" inputMode="numeric" value={form.postsCount} onChange={e=>setForm({...form,postsCount:e.target.value})}/></Field></div>
        <Field label="Category (optional)"><Input className="min-h-11" value={form.category} placeholder="Skincare brand" onChange={e=>setForm({...form,category:e.target.value})}/></Field>
        <Field label="Profile picture and highlights (optional)" hint="Describe them, e.g. 'Logo on white; highlights: Reviews, Shop, FAQ'"><Input className="min-h-11" value={form.profileImage} onChange={e=>setForm({...form,profileImage:e.target.value})}/></Field>
        <Field label="Notes for the audit (optional)"><Textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
      </div></Modal>}
    {snap&&<Modal open onClose={()=>!busy&&setSnap(null)} title="Log follower count" subtitle="Adds a dated point for follower growth tracking" footer={<><Button className="min-h-11" onClick={()=>setSnap(null)}>Cancel</Button><Button className="min-h-11" variant="primary" loading={busy==="account-snapshot"} disabled={!!busy||!snap.followers} onClick={async()=>{const n=num(snap.followers);if(n===null||!Number.isInteger(n)||n<0){studio.setError("Enter a whole number.");return;}if(await act("account-snapshot",{accountId:snap.id,date:snap.date,followers:n},"Follower count logged."))setSnap(null);}}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">{studio.error&&<p role="alert" className="text-sm text-danger sm:col-span-2">{studio.error}</p>}<Field label="Date"><Input className="min-h-11" type="date" max={new Date().toISOString().slice(0,10)} value={snap.date} onChange={e=>setSnap({...snap,date:e.target.value})}/></Field><Field label="Followers on that date"><Input className="min-h-11" inputMode="numeric" value={snap.followers} onChange={e=>setSnap({...snap,followers:e.target.value})}/></Field></div></Modal>}
  </div>;
}
