"use client";
/* eslint-disable @next/next/no-img-element -- creator photos come from the talent site's own media host, whose address is configuration */
import {useCallback,useEffect,useMemo,useState} from "react";
import {Camera,ExternalLink,Mail,MapPin,Phone,PlayCircle,Search,UserPlus} from "lucide-react";
import {refreshCRMChanges} from "@/lib/crmSync";
import {CREATOR_STATUSES,STATUS_LABEL,TALENT_LABEL,TALENT_TYPES,type Creator,type CreatorStatus} from "@/lib/domain/creators";
import {Badge,Button,Card,EmptyState,Field,Input,Modal,Select,Textarea} from "@/components/ui";
import {toast} from "@/components/shell/toast";
import {fmtDate} from "@/lib/utils";

const tone:Record<CreatorStatus,"neutral"|"success"|"warning"|"danger"|"info">={pending:"warning",approved:"success",featured:"info",rejected:"danger",archived:"neutral"};
const count=(v:number|null|undefined)=>v===null||v===undefined?"—":v>=100000?`${(v/100000).toFixed(v>=1000000?0:1)}L`:v>=1000?`${(v/1000).toFixed(v>=10000?0:1)}K`:String(v);
const rupees=(v:number|null)=>v===null?"—":`₹${v.toLocaleString("en-IN")}`;
const lowestRate=(c:Creator)=>{const r=Object.values(c.rates).filter((v):v is number=>v!==null&&v>0);return r.length?Math.min(...r):null;};
const initials=(name:string)=>name.split(/\s+/).map(p=>p[0]).filter(Boolean).slice(0,2).join("").toUpperCase();

async function post(body:object){
  const r=await fetch("/api/creators",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??"Could not save. Try again.");return data;
}

/** Creator and influencer applications from the talent sign-up site, stored in the creators table. */
export function TalentPool({writable}:{writable:boolean}){
  const [creators,setCreators]=useState<Creator[]|null>(null),[setup,setSetup]=useState(false),[media,setMedia]=useState(true),[error,setError]=useState("");
  const [q,setQ]=useState(""),[status,setStatus]=useState("All"),[type,setType]=useState("All"),[genre,setGenre]=useState("All"),[city,setCity]=useState("All"),[open,setOpen]=useState<string|null>(null);
  const load=useCallback(async()=>{
    try{const r=await fetch("/api/creators",{cache:"no-store"});const data=await r.json();if(!r.ok)throw new Error(data.error??"Could not load the talent pool.");setCreators(data.creators);setSetup(!!data.setupRequired);setMedia(data.mediaConfigured!==false);setError("");}
    catch(e){setError(e instanceof Error?e.message:"Could not load the talent pool.");setCreators(c=>c??[]);}
  },[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
  useEffect(()=>{void load();},[load]);

  const list=useMemo(()=>creators??[],[creators]);
  const genres=useMemo(()=>[...new Set(list.map(c=>c.genre))].sort(),[list]);
  const cities=useMemo(()=>[...new Set(list.map(c=>c.city).filter((c):c is string=>!!c))].sort(),[list]);
  const shown=list.filter(c=>{
    const text=`${c.name} ${c.displayName??""} ${c.handles.instagram??""} ${c.handles.youtube??""} ${c.city??""} ${c.email} ${c.genre} ${c.otherGenres.join(" ")} ${c.pastBrands.join(" ")}`.toLowerCase();
    return (!q||text.includes(q.toLowerCase()))&&(status==="All"||c.status===status)&&(type==="All"||c.type===type)&&(genre==="All"||c.genre===genre||c.otherGenres.includes(genre))&&(city==="All"||c.city===city);
  });
  const current=list.find(c=>c.id===open);
  const update=(id:string,change:Partial<Creator>)=>setCreators(cs=>cs?.map(c=>c.id===id?{...c,...change}:c)??cs);

  if(creators===null)return <Card className="p-6 text-sm text-fg-3">Loading talent pool…</Card>;
  if(setup)return <EmptyState title="Talent pool database is not set up" description="Run supabase/migrations/202611240002_creators.sql in the Supabase SQL Editor, then reload this page."/>;

  return <div className="space-y-4">
    <dl className="grid grid-cols-2 gap-4 border-y border-border py-4 sm:grid-cols-4">
      {[["In talent pool",list.length],["Pending review",list.filter(c=>c.status==="pending").length],["Approved or featured",list.filter(c=>c.status==="approved"||c.status==="featured").length],["Added to roster",list.filter(c=>c.rosterId).length]].map(([l,v])=><div key={l}><dt className="text-xs text-fg-3">{l}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd></div>)}
    </dl>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Search" className="lg:col-span-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3"/><Input className="min-h-11 pl-9" value={q} placeholder="Name, handle, city, brand…" onChange={e=>setQ(e.target.value)}/></div></Field>
      <Field label="Status"><Select className="min-h-11" value={status} onChange={e=>setStatus(e.target.value)}><option value="All">All statuses</option>{CREATOR_STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></Field>
      <Field label="Type"><Select className="min-h-11" value={type} onChange={e=>setType(e.target.value)}><option value="All">All types</option>{TALENT_TYPES.map(t=><option key={t} value={t}>{TALENT_LABEL[t]}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Genre"><Select className="min-h-11" value={genre} onChange={e=>setGenre(e.target.value)}><option value="All">All</option>{genres.map(g=><option key={g}>{g}</option>)}</Select></Field>
        <Field label="City"><Select className="min-h-11" value={city} onChange={e=>setCity(e.target.value)}><option value="All">All</option>{cities.map(c=><option key={c}>{c}</option>)}</Select></Field>
      </div>
    </div>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {!media&&<p className="text-xs text-fg-3">Photos and showcase files are hidden: set CREATOR_MEDIA_BASE_URL on the server to the talent site&apos;s public media address.</p>}
    {shown.length?<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map(c=><button key={c.id} type="button" onClick={()=>setOpen(c.id)} className="flex gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:bg-surface-2 focus-visible:outline-2">
        <Avatar c={c} size={56}/>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2"><span className="truncate font-medium">{c.displayName||c.name}</span><Badge tone={tone[c.status]}>{STATUS_LABEL[c.status]}</Badge></span>
          <span className="block truncate text-xs text-fg-3">{c.handles.instagram?`@${c.handles.instagram}`:c.handles.youtube?`YouTube: ${c.handles.youtube}`:TALENT_LABEL[c.type]}{c.city?` · ${c.city}`:""}</span>
          <span className="mt-1.5 block truncate text-xs text-fg-2">{[c.genre,...c.otherGenres].slice(0,3).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-fg-3"><span>{c.followers.best?`${count(c.followers.best)} followers`:"Followers not given"}</span><span>{lowestRate(c)?`From ${rupees(lowestRate(c))}`:c.barter?"Barter":"Rates not given"}</span>{c.rosterId&&<span className="text-success">On roster</span>}</span>
        </span>
      </button>)}
    </div>:<EmptyState title={list.length?"No creators match these filters":"The talent pool is empty"} description={list.length?"Clear a filter or search for something else.":"Import the creators CSV from the talent sign-up site to fill it."}/>}
    {current&&<CreatorDetail c={current} writable={writable} onClose={()=>setOpen(null)} onChange={change=>update(current.id,change)}/>}
  </div>;
}

function Avatar({c,size}:{c:Creator;size:number}){
  const [broken,setBroken]=useState(false);
  return c.photo&&!broken?<img src={c.photo} alt="" width={size} height={size} loading="lazy" onError={()=>setBroken(true)} className="shrink-0 rounded-lg object-cover" style={{width:size,height:size}}/>
    :<span className="grid shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-semibold text-fg-2" style={{width:size,height:size}}>{initials(c.displayName||c.name)}</span>;
}

function CreatorDetail({c,writable,onClose,onChange}:{c:Creator;writable:boolean;onClose:()=>void;onChange:(change:Partial<Creator>)=>void}){
  const [busy,setBusy]=useState(""),[notes,setNotes]=useState(c.notes),[quality,setQuality]=useState(c.quality?String(c.quality):"");
  const run=async(key:string,body:object,done:()=>void,message:string)=>{setBusy(key);try{await post(body);done();toast(message);}catch(e){toast("Could not save",e instanceof Error?e.message:undefined,"warning");}finally{setBusy("");}};
  const setStatus=(s:CreatorStatus)=>run(s,{action:"status",id:c.id,status:s},()=>onChange({status:s}),`${c.displayName||c.name}: ${STATUS_LABEL[s]}`);
  // The roster lives in the CRM record, so it is reloaded after the server adds the creator.
  const addToRoster=()=>run("roster",{action:"roster",id:c.id,operationId:crypto.randomUUID()},()=>{onChange({rosterId:"added",status:c.status==="pending"?"approved":c.status});void refreshCRMChanges();},"Added to roster · find them in Creator database");
  const rates=([["Reel",c.rates.reel],["Story",c.rates.story],["Static post",c.rates.post],["YouTube integration",c.rates.youtube],["UGC video",c.rates.video]] as const).filter(([,v])=>v!==null);
  const socials=([["Instagram",c.handles.instagram&&`https://www.instagram.com/${c.handles.instagram}/`,c.handles.instagram&&`@${c.handles.instagram}`],["YouTube",c.handles.youtube&&`https://www.youtube.com/${c.handles.youtube.startsWith("@")?c.handles.youtube:`@${c.handles.youtube}`}`,c.handles.youtube],["X",c.handles.x&&`https://x.com/${c.handles.x.replace(/^@/,"")}`,c.handles.x],["TikTok",c.handles.tiktok&&`https://www.tiktok.com/@${c.handles.tiktok.replace(/^@/,"")}`,c.handles.tiktok],["LinkedIn",c.handles.linkedin,"Profile"],["Portfolio",c.handles.portfolio,"Open"]] as const).filter(([,url])=>!!url) as unknown as [string,string,string][];

  return <Modal open size="xl" title={c.displayName||c.name} subtitle={`${TALENT_LABEL[c.type]} · applied ${fmtDate(c.createdAt)}${c.displayName&&c.displayName!==c.name?` · ${c.name}`:""}`} onClose={onClose}
    footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{writable&&(c.rosterId?<Button disabled>On roster</Button>:<Button variant="primary" icon={<UserPlus className="size-4"/>} loading={busy==="roster"} disabled={!!busy} onClick={()=>void addToRoster()}>Add to roster</Button>)}</>}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Avatar c={c} size={96}/>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={tone[c.status]}>{STATUS_LABEL[c.status]}</Badge>{c.verified&&<Badge tone="info">Verified</Badge>}{c.exclusive&&<Badge>Managed exclusively</Badge>}{c.rosterId&&<Badge tone="success">On roster</Badge>}</div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            <a className="flex items-center gap-1 hover:text-fg" href={`mailto:${c.email}`}><Mail className="size-3.5"/>{c.email}</a>
            {c.phone&&<a className="flex items-center gap-1 hover:text-fg" href={`tel:${c.phone}`}><Phone className="size-3.5"/>{c.phone}</a>}
            {(c.city||c.state)&&<span className="flex items-center gap-1"><MapPin className="size-3.5"/>{[c.city,c.state,c.country].filter(Boolean).join(", ")}</span>}
          </p>
          {c.bio&&<p className="whitespace-pre-wrap text-sm text-fg-2">{c.bio}</p>}
        </div>
      </div>
      {writable&&<div className="flex flex-wrap gap-2">{CREATOR_STATUSES.filter(s=>s!==c.status).map(s=><Button key={s} size="sm" loading={busy===s} disabled={!!busy} onClick={()=>void setStatus(s)}>{s==="pending"?"Move back to pending":s==="approved"?"Approve":s==="featured"?"Feature":s==="rejected"?"Reject":"Archive"}</Button>)}</div>}

      <Section title="Profiles & reach">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {socials.map(([label,url,text])=><Item key={label} label={label}><a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-text underline">{text}<ExternalLink className="size-3"/></a></Item>)}
          <Item label="Instagram followers">{count(c.followers.instagram)}</Item><Item label="YouTube subscribers">{count(c.followers.youtube)}</Item><Item label="X followers">{count(c.followers.x)}</Item>
          <Item label="Average reel views">{count(c.avgReelViews)}</Item><Item label="Engagement rate">{c.engagement===null?"—":`${c.engagement}%`}</Item>
        </dl>
        <p className="mt-2 text-xs text-fg-3">Figures are what the creator entered on the sign-up form{c.verified?" and were verified by your team":" and have not been verified"}.</p>
      </Section>
      <Section title="Content & audience">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Item label="Genres">{[c.genre,...c.otherGenres].join(", ")}</Item><Item label="Formats">{c.formats.join(", ")||"—"}</Item><Item label="Languages">{c.languages.join(", ")||"—"}</Item>
          <Item label="Audience age">{c.audience.ageBand??"—"}</Item><Item label="Audience female">{c.audience.femalePct===null?"—":`${c.audience.femalePct}%`}</Item><Item label="Top cities">{c.audience.topCities.join(", ")||"—"}</Item>
        </dl>
      </Section>
      <Section title="Rates">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">{rates.map(([label,v])=><Item key={label} label={label}>{rupees(v)}</Item>)}<Item label="Barter">{c.barter?"Open to barter":"No"}</Item><Item label="Turnaround">{c.turnaroundDays?`${c.turnaroundDays} days`:"—"}</Item></dl>
        {!rates.length&&<p className="mt-2 text-sm text-fg-3">No rates given.</p>}
      </Section>
      {(c.pastBrands.length>0||c.workLinks.length>0)&&<Section title="Past work">
        {c.pastBrands.length>0&&<div className="flex flex-wrap gap-1.5">{c.pastBrands.map(b=><Badge key={b}>{b}</Badge>)}</div>}
        {c.workLinks.length>0&&<ul className="mt-2 space-y-1 text-sm">{c.workLinks.map(u=><li key={u}><a className="break-all text-accent-text underline" href={u} target="_blank" rel="noreferrer">{u}</a></li>)}</ul>}
      </Section>}
      {c.showcase.length>0&&<Section title={`Showcase (${c.showcase.length})`}>
        <div className="grid gap-3 sm:grid-cols-3">{c.showcase.map(m=>m.kind==="image"?<a key={m.url} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-lg object-cover"/></a>
          :m.kind==="video"?<video key={m.url} src={m.url} controls preload="metadata" className="aspect-[4/5] w-full rounded-lg bg-black object-contain"/>
          :<a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="flex aspect-[4/5] items-center justify-center gap-1 rounded-lg border border-border text-sm text-accent-text"><PlayCircle className="size-4"/>Open file</a>)}</div>
      </Section>}
      {!c.photo&&!c.showcase.length&&<p className="flex items-center gap-1.5 text-xs text-fg-3"><Camera className="size-3.5"/>No photo or showcase files were uploaded.</p>}
      <Section title="Internal review">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <Field label="Notes (team only)"><Textarea rows={3} value={notes} maxLength={4000} disabled={!writable} onChange={e=>setNotes(e.target.value)}/></Field>
          <Field label="Quality (1–5)"><Select className="min-h-11" value={quality} disabled={!writable} onChange={e=>setQuality(e.target.value)}><option value="">Not rated</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>
        {writable&&<Button className="mt-2" size="sm" loading={busy==="review"} disabled={!!busy||(notes===c.notes&&quality===(c.quality?String(c.quality):""))} onClick={()=>void run("review",{action:"review",id:c.id,notes,quality:quality?Number(quality):null},()=>onChange({notes,quality:quality?Number(quality):null}),"Review saved")}>Save review</Button>}
      </Section>
    </div>
  </Modal>;
}
const Section=({title,children}:{title:string;children:React.ReactNode})=><section className="border-t border-border pt-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</section>;
const Item=({label,children}:{label:string;children:React.ReactNode})=><div><dt className="text-xs text-fg-3">{label}</dt><dd className="mt-0.5 text-sm text-fg-2">{children}</dd></div>;
