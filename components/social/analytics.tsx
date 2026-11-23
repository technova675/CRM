"use client";
import {useMemo,useState} from "react";
import type {SocialPost} from "@/lib/types";
import {socialPlatforms} from "@/lib/domain/socialWorkspace";
import {analyticsSummary,postResults,type PostResult} from "@/lib/domain/socialStudio";
import {Badge,Button,Card,Field,Select} from "@/components/ui";
import type {useStudio} from "./useStudio";

type Studio=ReturnType<typeof useStudio>;
const pct=(n:number|null)=>n===null?"–":`${n.toFixed(2)}%`;
const int=(n:number|null)=>n===null?"–":Math.round(n).toLocaleString("en-IN");

/** Results from platform exports and recorded posts, with deterministic comparisons and AI optimisation advice. */
export function AnalyticsTab({clientId,posts,studio,writable}:{clientId:string;posts:SocialPost[];studio:Studio;writable:boolean}){
  const {data,act,busy}=studio,[platform,setPlatform]=useState<typeof socialPlatforms[number]>("Instagram"),[filter,setFilter]=useState("All"),[clearing,setClearing]=useState(false);
  const all=useMemo(()=>data?postResults(data.metrics,posts,clientId):[],[data,posts,clientId]);
  const results=filter==="All"?all:all.filter(r=>r.platform===filter);
  const s=useMemo(()=>analyticsSummary(results),[results]);
  const rec=data?.recommendations[0];
  if(!data)return <p className="text-sm text-fg-2">Loading analytics…</p>;
  const table=(rows:PostResult[])=><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-fg-2"><tr><th className="py-2 pr-3">Post</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3 text-right">Reach</th><th className="py-2 pr-3 text-right">Engagements</th><th className="py-2 text-right">Eng. rate</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id} className="border-t border-border"><td className="max-w-xs py-2 pr-3">{r.permalink?<a className="text-accent-text underline" href={r.permalink} target="_blank" rel="noreferrer">{r.title}</a>:r.title}<p className="text-xs text-fg-3">{r.platform} · {r.source}</p></td><td className="py-2 pr-3">{r.type}</td><td className="py-2 pr-3 whitespace-nowrap">{new Date(r.postedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</td><td className="py-2 pr-3 text-right tabular-nums">{int(r.reach??r.views)}</td><td className="py-2 pr-3 text-right tabular-nums">{int(r.engagements)}</td><td className="py-2 text-right tabular-nums">{pct(r.rate)}</td></tr>)}</tbody></table></div>;
  const groups=(title:string,rows:typeof s.byFormat)=><Card className="p-4"><h3 className="font-semibold">{title}</h3>{rows.length?<ul className="mt-2 space-y-2 text-sm">{rows.map(g=><li key={g.name} className="flex items-center justify-between gap-3"><span>{g.name} <span className="text-xs text-fg-3">({g.posts} post{g.posts>1?"s":""})</span></span><span className="tabular-nums">{pct(g.avgRate)}</span></li>)}</ul>:<p className="mt-2 text-sm text-fg-2">No data.</p>}{rows.some(g=>g.posts<10)&&<p className="mt-2 text-xs text-fg-3">Groups under 10 posts are directional only.</p>}</Card>;
  return <div className="space-y-5">
    {writable&&<Card className="space-y-3 p-5"><h2 className="font-semibold">Import results</h2>
      <p className="text-sm text-fg-2">Export post insights as CSV from Meta Business Suite (Insights → Content → Export), Instagram Professional Dashboard, or LinkedIn page analytics, then upload it here. Importing the same posts again updates their numbers.</p>
      <div className="flex flex-wrap items-end gap-3"><Field label="Platform of this file"><Select className="min-h-11" value={platform} onChange={e=>setPlatform(e.target.value as typeof platform)}>{socialPlatforms.map(p=><option key={p}>{p}</option>)}</Select></Field>
        <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-dashed border-border px-4 text-sm hover:border-accent">{busy==="import-metrics"?"Importing…":"Choose CSV export"}<input type="file" accept=".csv,text/csv" className="sr-only" disabled={!!busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;if(file.size>2_000_000){studio.setError("Choose a file under 2 MB.");return;}
          const r=await act<{imported:number;skipped:number;ignored:string[]}>("import-metrics",{clientId,platform,csv:await file.text()});if(r)studio.setNotice(`${r.imported} posts imported${r.skipped?`, ${r.skipped} rows skipped (no readable date)`:""}.${r.ignored.length?` Columns not used: ${r.ignored.slice(0,6).join(", ")}${r.ignored.length>6?"…":""}.`:""}`);}}/></label>
        {data.metrics.some(m=>m.platform===platform)&&(clearing?<Button className="min-h-11" variant="danger" disabled={!!busy} onClick={async()=>{await act("clear-metrics",{clientId,platform},`${platform} results removed.`);setClearing(false);}}>Confirm remove {platform} results</Button>:<Button className="min-h-11" onClick={()=>setClearing(true)}>Remove {platform} results</Button>)}</div>
    </Card>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Performance</h2><Select className="min-h-11 w-auto" aria-label="Platform filter" value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{socialPlatforms.map(p=><option key={p}>{p}</option>)}</Select></div>
    {!results.length?<Card className="p-6 text-sm text-fg-2">No results yet. Import a CSV export above, or record numbers inside a published post.</Card>:<>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">{[["Posts measured",String(s.posts)],["Avg engagement rate",pct(s.avgRate)],["Total engagements",int(s.totalEngagements)],["Total reach",int(s.totalReach)],["Posts per week",s.postsPerWeek===null?"–":s.postsPerWeek.toFixed(1)]].map(([k,v])=><Card key={k} className="p-4"><dt className="text-xs text-fg-2">{k}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{v}</dd></Card>)}</dl>
      <p className="text-xs text-fg-3">Engagement rate = (likes + comments + shares + saves) ÷ reach, using views or impressions when reach is missing. Total reach adds each post&apos;s reach, so people who saw several posts are counted more than once.</p>
      <div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><h3 className="font-semibold">Best performing</h3>{table(s.best)}</Card><Card className="p-4"><h3 className="font-semibold">Lowest performing</h3>{s.worst.length?table(s.worst):<p className="mt-2 text-sm text-fg-2">Needs more than 5 measured posts.</p>}</Card></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{groups("By format",s.byFormat)}{groups("By platform",s.byPlatform)}{groups("By day",s.byDay)}{groups("By time of day",s.byTime)}</div>
      <details className="rounded-lg border border-border p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">All measured posts ({results.length})</summary>{table(results)}</details>
    </>}
    <Card className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">AI recommendations</h2><p className="mt-1 text-sm text-fg-2">What to keep, fix and try next month, based only on the measured results above.</p></div>
      {writable&&<Button className="min-h-11" variant="primary" loading={busy==="recommend"} disabled={!!busy||all.length<3||!data.ai} onClick={()=>act("recommend",{clientId},"Recommendations ready.")}>{rec?"Refresh recommendations":"Get recommendations"}</Button>}</div>
      {all.length<3&&<p className="text-sm text-fg-2">Needs results for at least 3 posts.</p>}
      {rec&&<div className="space-y-3"><p className="text-xs text-fg-2">{new Date(rec.at).toLocaleString("en-IN")} · {rec.source} · AI opinion; small samples are directional</p><p className="text-sm leading-6">{rec.output.summary}</p>
        <div className="grid gap-3 md:grid-cols-2">{([["What works",rec.output.whatWorks],["Underperforming",rec.output.underperforming],["Improve hooks, captions and hashtags",rec.output.improvements],["Posting times",rec.output.postingTimes],["Formats",rec.output.formats],["Frequency",rec.output.frequency],["Next month",rec.output.nextMonth]] as const).map(([t,items])=>items.length>0&&<div key={t} className="rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">{t}</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">{items.map((x,i)=><li key={i}>{x.replace(/^\s*>\s*/,"")}</li>)}</ul></div>)}</div>
        <div><h3 className="text-sm font-semibold">Action plan</h3><ul className="mt-1 space-y-2 text-sm">{rec.output.actionPlan.map((a,i)=><li key={i}><Badge tone={a.priority==="High"?"danger":a.priority==="Medium"?"warning":"neutral"}>{a.priority}</Badge> {a.action} <span className="text-fg-2">— {a.why}</span></li>)}</ul></div></div>}
    </Card>
  </div>;
}
