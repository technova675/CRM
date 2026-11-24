"use client";
import Image from "next/image";
import {useMemo,useState} from "react";
import {Trash2} from "lucide-react";
import {type Campaign,type MediaMetricRow} from "@/lib/types";
import {MEDIA_PLATFORMS} from "@/lib/domain/performance";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";
import {compactMoney,fmtDate} from "@/lib/utils";
import {Badge,Button,Field,Input,Modal,Select} from "@/components/ui";
import {toast} from "@/components/shell/toast";

const METRICS=[["spend","Spend (₹)"],["impressions","Impressions"],["reach","Reach"],["clicks","Clicks"],["leads","Leads"],["conversions","Conversions"],["revenue","Revenue (₹)"]] as const;
type MetricKey=typeof METRICS[number][0];
// Live sync is planned for these platforms; until then results are entered here.
const LIVE=[{name:"Meta Ads",logo:"/integrations/meta.svg"},{name:"Google Ads",logo:"/integrations/google-ads.png"}];

async function send(body:object){
  await flushCRMChanges();
  const r=await fetch("/api/media/metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationId:crypto.randomUUID(),...body}),signal:AbortSignal.timeout(30000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error??"Could not save. Try again.");
  await refreshCRMChanges();
}
const yesterday=()=>new Date(Date.now()-86400000).toISOString().slice(0,10);
const show=(v:number|null,money=false)=>v===null?"—":money?compactMoney(v):v.toLocaleString("en-IN");

/** Results data for one campaign: live platform sync (coming soon), entering a day by hand, and the recorded days. */
export function CampaignResults({campaign:c,writable}:{campaign:Campaign;writable:boolean}){
  const [entry,setEntry]=useState<MediaMetricRow|"new"|null>(null),[busy,setBusy]=useState("");
  const rows=useMemo(()=>[...(c.performanceRows??[])].sort((a,b)=>b.date.localeCompare(a.date)||a.platform.localeCompare(b.platform)),[c.performanceRows]);
  const remove=async(row:MediaMetricRow)=>{setBusy(row.id);try{await send({action:"delete",campaignId:c.id,rowId:row.id});toast("Entry removed",`${row.platform} · ${fmtDate(row.date)}`);}catch(e){toast("Could not remove",e instanceof Error?e.message:undefined,"warning");}finally{setBusy("");}};

  return <section className="border-t border-border pt-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Results data</h3><p className="mt-1 text-xs text-fg-3">Daily results saved to the database. Blank values are stored as not reported, never as zero.</p></div>
      {writable&&<Button variant="primary" onClick={()=>setEntry("new")}>Enter results</Button>}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {LIVE.map(p=><div key={p.name} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
        <span className="flex items-center gap-2.5 text-sm"><Image src={p.logo} alt="" width={22} height={22} className="size-[22px] object-contain" unoptimized={p.logo.endsWith(".svg")}/>{p.name} live sync</span>
        <Badge>Coming soon</Badge>
      </div>)}
    </div>
    {rows.length?<div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-fg-3"><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Platform</th>{METRICS.map(([k,l])=><th key={k} className="px-3 py-2 text-right font-medium">{l.replace(" (₹)","")}</th>)}<th className="px-3 py-2 font-medium">Source</th>{writable&&<th className="px-3 py-2"><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{rows.slice(0,60).map(r=><tr key={r.id} className="border-b border-border last:border-0">
          <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.date)}</td>
          <td className="px-3 py-2"><span className="block">{r.platform}</span>{r.adId&&<span className="block text-xs text-fg-3">{r.adName||`Ad ${r.adId}`}</span>}</td>
          {METRICS.map(([k])=><td key={k} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{show(r[k],k==="spend"||k==="revenue")}</td>)}
          <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-3">{r.source}</td>
          {writable&&<td className="whitespace-nowrap px-2 py-1 text-right">
            {r.source==="Manual entry"&&<Button size="xs" variant="ghost" onClick={()=>setEntry(r)}>Edit</Button>}
            <Button size="xs" variant="ghost" aria-label={`Remove ${r.platform} ${r.date}`} loading={busy===r.id} disabled={!!busy} onClick={()=>void remove(r)} icon={<Trash2 className="size-3.5"/>}/>
          </td>}
        </tr>)}</tbody>
      </table>
      {rows.length>60&&<p className="px-3 py-2 text-xs text-fg-3">Showing the latest 60 of {rows.length} days. The Performance page analyses all of them.</p>}
    </div>:<p className="mt-4 text-sm text-fg-3">No results recorded yet.{writable?" Use Enter results to add a day.":""}</p>}
    {entry&&<ResultsForm campaign={c} row={entry==="new"?undefined:entry} onClose={()=>setEntry(null)}/>}
  </section>;
}

function ResultsForm({campaign:c,row,onClose}:{campaign:Campaign;row?:MediaMetricRow;onClose:()=>void}){
  const guess=(MEDIA_PLATFORMS as readonly string[]).find(p=>p===c.platform||p===c.service)??MEDIA_PLATFORMS[0];
  const [date,setDate]=useState(row?.date??yesterday()),[platform,setPlatform]=useState<string>(row?.platform??guess),[adId,setAdId]=useState(row?.adId??""),[adName,setAdName]=useState(row?.adName??"");
  const [values,setValues]=useState<Record<MetricKey,string>>(()=>Object.fromEntries(METRICS.map(([k])=>[k,row&&row[k]!==null?String(row[k]):""])) as Record<MetricKey,string>);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const existing=!row&&(c.performanceRows??[]).some(r=>r.date===date&&r.platform===platform&&(r.adId??"")===adId.trim());

  const save=async()=>{
    setError("");
    const metrics:Record<string,number|null>={};
    for(const [k,label] of METRICS){
      const raw=values[k].replace(/[₹,\s]/g,"");
      if(raw===""){metrics[k]=null;continue;}
      const n=Number(raw);
      if(!Number.isFinite(n)||n<0)return setError(`${label.replace(" (₹)","")} must be a number of 0 or more, or left blank.`);
      metrics[k]=n;
    }
    if(Object.values(metrics).every(v=>v===null))return setError("Enter at least one number.");
    setBusy(true);
    try{
      // Changing the day, platform or ad of an existing entry saves a new row, so the old one is removed afterwards.
      await send({action:"save",campaignId:c.id,platform,date,...(adId.trim()?{adId:adId.trim()}:{}),...(adName.trim()?{adName:adName.trim()}:{}),...metrics});
      if(row&&(row.date!==date||row.platform!==platform||(row.adId??"")!==adId.trim()))await send({action:"delete",campaignId:c.id,rowId:row.id});
      toast(row?"Results updated":"Results saved",`${platform} · ${fmtDate(date)}`);
      onClose();
    }catch(e){setError(e instanceof Error?e.message:"Could not save. Try again.");}finally{setBusy(false);}
  };

  return <Modal open size="lg" title={row?"Edit results":"Enter results"} subtitle={`${c.name} · one day of results from the ad platform. Leave a box blank if the platform did not report it.`} onClose={()=>!busy&&onClose()}
    footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={()=>void save()}>{row?"Save changes":"Save results"}</Button></>}>
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={date} max={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)}/></Field>
        <Field label="Platform"><Select value={platform} onChange={e=>setPlatform(e.target.value)}>{MEDIA_PLATFORMS.map(p=><option key={p}>{p}</option>)}</Select></Field>
        <Field label="Ad ID (optional)" hint="Only for results of a single ad"><Input value={adId} maxLength={200} onChange={e=>setAdId(e.target.value)}/></Field>
        <Field label="Ad name (optional)"><Input value={adName} maxLength={500} disabled={!adId.trim()} onChange={e=>setAdName(e.target.value)}/></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {METRICS.map(([k,label])=><Field key={k} label={label}><Input inputMode="decimal" value={values[k]} placeholder="Not reported" onChange={e=>setValues(v=>({...v,[k]:e.target.value}))}/></Field>)}
      </div>
      {existing&&<p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">This day already has {adId.trim()?"results for this ad":"campaign results"} on {platform}. Saving replaces them.</p>}
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  </Modal>;
}
