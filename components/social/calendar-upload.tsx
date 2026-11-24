"use client";
import {useMemo,useState} from "react";
import Papa from "papaparse";
import {readSheet} from "read-excel-file/browser";
import {FileSpreadsheet,Upload} from "lucide-react";
import {flushCRMChanges} from "@/lib/crmSync";
import {calendarRows,POST_TYPES,NETWORKS} from "@/lib/domain/socialPublishing";
import type {Client} from "@/lib/types";
import {Badge,Button,Field,Modal,Select} from "@/components/ui";
import {downloadFile} from "@/lib/utils";

const TEMPLATE=[
  ["Date","Time","Networks","Post type","Title","Text","Hashtags","Media","Subreddit","Pillar","Campaign"],
  ["2026-12-01","10:00","LinkedIn, X, Threads, Facebook","Text only","Why we test every batch","Every batch we ship is tested twice. Here is what we check and why it matters.","#quality #behindthescenes","","","Education","December"],
  ["2026-12-02","18:30","Instagram, Facebook, LinkedIn","Text + images","Winter skincare routine","Five steps for dry winter skin. Save this for later.","#skincare #winter","https://example.com/slide-1.jpg | https://example.com/slide-2.jpg","","Education","December"],
  ["2026-12-03","12:00","Instagram, Threads, X","Image only","Product flat lay","","","https://example.com/flatlay.jpg","","Product","December"],
  ["2026-12-04","19:00","YouTube, Instagram, Facebook","Text + video","How it is made","From raw material to your door in 60 seconds.","#madeinindia","https://example.com/how-its-made.mp4","","Brand story","December"],
  ["2026-12-05","09:00","Reddit","Text only","We are a small skincare brand from Pune: ask us anything","We started in 2021 with one face wash. Ask us about ingredients, pricing or running a D2C brand.","","","IndianSkincareAddicts","Community","December"],
];

/** Upload a whole month (or more) of posts from Excel or CSV, check every row against the network rules, then import. */
export function CalendarUpload({clients,defaultClient,onDone}:{clients:Client[];defaultClient:string;onDone:(message:string)=>void}){
  const [open,setOpen]=useState(false),[clientId,setClientId]=useState(defaultClient),[rows,setRows]=useState<string[][]|null>(null),[file,setFile]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const result=useMemo(()=>rows?calendarRows(rows):null,[rows]);
  const ready=result?.posts.filter(p=>!p.issues.length).length??0,flagged=(result?.posts.length??0)-ready;
  const close=()=>{if(busy)return;setOpen(false);setRows(null);setFile("");setError("");};

  const read=async(f:File)=>{
    setError("");setRows(null);
    try{
      if(f.size>3_000_000)throw new Error("Choose a file under 3 MB, or split the calendar by month.");
      let data:string[][];
      if(/\.xlsx$/i.test(f.name)){
        const sheet=await readSheet(f);
        data=sheet.map(r=>r.map(c=>c==null?"":c instanceof Date?`${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,"0")}-${String(c.getDate()).padStart(2,"0")}`:String(c)));
      }else if(/\.xls$/i.test(f.name))throw new Error("Save the old .xls file as .xlsx or CSV first.");
      else{const parsed=Papa.parse<string[]>((await f.text()).replace(/^﻿/,""),{skipEmptyLines:true});if(parsed.errors.length)throw new Error(`The CSV could not be read: ${parsed.errors[0].message}`);data=parsed.data;}
      setRows(data);setFile(f.name);
    }catch(e){setError(e instanceof Error?e.message:"The file could not be read.");}
  };
  const upload=async(skipIssues:boolean)=>{
    if(!rows)return;setBusy(true);setError("");
    try{
      await flushCRMChanges();
      const r=await fetch("/api/social/studio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:crypto.randomUUID(),action:"calendar",data:{clientId,csv:Papa.unparse(rows),skipIssues}}),signal:AbortSignal.timeout(60000)});
      const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error??"Upload failed. Try again.");
      onDone(`${body.created} posts added to the calendar as drafts${body.needFixing?`, ${body.needFixing} need fixing before they can be scheduled`:""}${body.skipped?`, ${body.skipped} skipped`:""}.`);
      setOpen(false);setRows(null);setFile("");
    }catch(e){setError(e instanceof Error?e.message:"Upload failed.");}finally{setBusy(false);}
  };

  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Button className="min-h-11" icon={<Upload className="size-4"/>} disabled={!clients.length} onClick={()=>{setClientId(defaultClient||clients[0]?.id||"");setOpen(true);}}>Upload content calendar</Button>
      <Button className="min-h-11" variant="ghost" icon={<FileSpreadsheet className="size-4"/>} onClick={()=>downloadFile("content-calendar-template.csv",Papa.unparse(TEMPLATE),"text/csv")}>Download template</Button>
    </div>
    {open&&<Modal open size="xl" title="Upload content calendar" subtitle="Excel (.xlsx) or CSV. Each row is one post; list several networks in one row to post it to each. Posts come in as drafts on their dates, then go through AI review and approval as usual."
      onClose={close} footer={<><Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
        {result&&flagged>0&&ready>0&&<Button disabled={busy} onClick={()=>void upload(true)}>Import only the {ready} ready</Button>}
        <Button variant="primary" loading={busy} disabled={!result?.posts.length} onClick={()=>void upload(false)}>{result?.posts.length?`Import ${result.posts.length} posts`:"Import"}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client"><Select className="min-h-11" value={clientId} onChange={e=>setClientId(e.target.value)}>{clients.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
          <Field label="Calendar file"><label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 text-sm hover:border-accent">{file||"Choose .xlsx or .csv"}<input type="file" accept=".xlsx,.csv,text/csv" className="sr-only" onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void read(f);}}/></label></Field>
        </div>
        <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Columns the file can have</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-2">
            <li><strong>Networks</strong> (required): {NETWORKS.join(", ")}. Separate several with commas.</li>
            <li><strong>Post type</strong> (required): {POST_TYPES.join(", ")}.</li>
            <li><strong>Date</strong> and <strong>Time</strong>: 2026-12-05 or 05/12/2026, and 18:30 or 6:30 pm (India time). Blank date: the post waits unplanned.</li>
            <li><strong>Text</strong>, <strong>Title</strong>, <strong>Hashtags</strong>, <strong>Pillar</strong>, <strong>Campaign</strong>.</li>
            <li><strong>Media</strong>: public https links to the image or video files, separated by | . YouTube and Reddit also need a Title; Reddit needs a <strong>Subreddit</strong>.</li>
          </ul></details>
        {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
        {result&&<>
          <p className="text-sm">{result.posts.length} posts found · <span className="text-success">{ready} ready</span>{flagged>0&&<> · <span className="text-warning">{flagged} need fixing</span> (they can still be imported as drafts)</>}</p>
          {result.errors.length>0&&<ul className="list-disc space-y-0.5 pl-5 text-xs text-danger">{result.errors.slice(0,10).map(e=><li key={e}>{e}</li>)}{result.errors.length>10&&<li>…and {result.errors.length-10} more</li>}</ul>}
          {result.posts.length>0&&<div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-surface"><tr className="border-b border-border text-left text-xs text-fg-3"><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">Planned</th><th className="px-3 py-2 font-medium">Network</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Title</th><th className="px-3 py-2 font-medium">Check</th></tr></thead>
              <tbody>{result.posts.map((p,i)=><tr key={i} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2 text-fg-3">{p.row}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.plannedAt?new Date(p.plannedAt).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):<span className="text-fg-3">Not planned</span>}</td>
                <td className="px-3 py-2">{p.platform}{p.subreddit?<span className="block text-xs text-fg-3">r/{p.subreddit}</span>:null}</td>
                <td className="whitespace-nowrap px-3 py-2">{p.postType}{p.mediaUrls.length>0&&<span className="block text-xs text-fg-3">{p.mediaUrls.length} file{p.mediaUrls.length>1?"s":""}</span>}</td>
                <td className="max-w-56 px-3 py-2"><span className="line-clamp-2">{p.title}</span></td>
                <td className="px-3 py-2">{p.issues.length?<ul className="space-y-0.5 text-xs text-warning">{p.issues.map(x=><li key={x}>{x}</li>)}</ul>:<Badge tone="success">Ready</Badge>}</td>
              </tr>)}</tbody></table>
          </div>}
        </>}
      </div>
    </Modal>}
  </>;
}
