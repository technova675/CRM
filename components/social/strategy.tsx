"use client";
import {useState,type ReactNode} from "react";
import {socialPlatforms} from "@/lib/domain/socialWorkspace";
import {SOCIAL_GOALS} from "@/lib/domain/socialStudio";
import {Badge,Button,Card,Field,Input,Select,Textarea} from "@/components/ui";
import type {useStudio} from "./useStudio";

type Studio=ReturnType<typeof useStudio>;
const nextMonth=()=>{const d=new Date();d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,7);};

/** AI social strategy: positioning, personas, pillars, platform plans, KPIs and a weekly calendar that becomes posts. */
export function StrategyTab({clientId,studio,writable,onIdeas,listening}:{clientId:string;studio:Studio;writable:boolean;onIdeas:()=>void;listening:ReactNode}){
  const {data,act,busy}=studio;
  const [form,setForm]=useState({goal:SOCIAL_GOALS[1] as typeof SOCIAL_GOALS[number],platforms:["Instagram"] as string[],month:nextMonth(),postsPerWeek:4,notes:""});
  const [selected,setSelected]=useState(""),[adding,setAdding]=useState(-1);
  const addIdeas=async(planId:string,week:number)=>{setAdding(week);const r=await act<{created:number}>("plan-to-ideas",{planId,week});setAdding(-1);if(r){studio.setNotice(week?`${r.created} ideas from week ${week} added. Open each one and press Write with AI.`:`${r.created} post ideas added. Open each one and press Write with AI.`);onIdeas();}};
  const plan=data?.plans.find(p=>p.id===selected)??data?.plans[0];
  const toggle=(p:string)=>setForm(f=>({...f,platforms:f.platforms.includes(p)?f.platforms.filter(x=>x!==p):[...f.platforms,p]}));
  if(!data)return <p className="text-sm text-fg-2">Loading strategy…</p>;
  return <div className="space-y-5">
    {writable&&<Card className="space-y-4 p-5"><div><h2 className="font-semibold">Build a social media strategy</h2><p className="mt-1 text-sm text-fg-2">Uses the client profile, AI knowledge base, brand voice, account audits and past results. Targets are proposals for you to agree with the client.</p></div>
      <div className="grid gap-3 md:grid-cols-3"><Field label="Main goal"><Select className="min-h-11" value={form.goal} onChange={e=>setForm({...form,goal:e.target.value as typeof form.goal})}>{SOCIAL_GOALS.map(g=><option key={g}>{g}</option>)}</Select></Field>
        <Field label="Month"><Input className="min-h-11" type="month" value={form.month} onChange={e=>setForm({...form,month:e.target.value})}/></Field>
        <Field label="Posts per week (all platforms)"><Input className="min-h-11" type="number" min={1} max={21} value={form.postsPerWeek} onChange={e=>setForm({...form,postsPerWeek:Number(e.target.value)})}/></Field></div>
      <fieldset><legend className="mb-2 text-sm font-medium">Platforms</legend><div className="flex flex-wrap gap-2">{socialPlatforms.map(p=><label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm"><input type="checkbox" checked={form.platforms.includes(p)} onChange={()=>toggle(p)}/>{p}</label>)}</div></fieldset>
      <Field label="Notes (optional)" hint="Launches, offers, festivals, things to avoid"><Textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
      <Button className="min-h-11" variant="primary" loading={busy==="plan"} disabled={!!busy||!form.platforms.length||!data.ai||form.postsPerWeek<1||form.postsPerWeek>21} onClick={async()=>{const r=await act<{planId:string}>("plan",{clientId,...form},"Strategy ready. It is shown below.");if(r)setSelected(r.planId);}}>Generate strategy</Button>
      {busy==="plan"&&<p className="text-xs text-fg-2">This takes up to a minute.</p>}
    </Card>}
    {plan?<article className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{plan.input.month} strategy · {plan.input.goal}</h2><p className="text-xs text-fg-2">{plan.input.platforms.join(", ")} · {plan.input.postsPerWeek} posts/week · {new Date(plan.at).toLocaleString("en-IN")} · {plan.source} · AI draft for review</p></div>
        {data.plans.length>1&&<Select className="min-h-11 w-auto" aria-label="Earlier strategies" value={plan.id} onChange={e=>setSelected(e.target.value)}>{data.plans.map(p=><option key={p.id} value={p.id}>{p.input.month} · {p.input.goal} · {new Date(p.at).toLocaleDateString("en-IN")}</option>)}</Select>}</div>
      {!!plan.claimWarnings?.length&&<p role="note" className="rounded-lg border border-warning/40 p-3 text-sm text-warning">Check before sharing: {plan.claimWarnings.join(", ")} {plan.claimWarnings.length>1?"are":"is"} not in the client&apos;s profile or knowledge base. Remove {plan.claimWarnings.length>1?"them":"it"} unless the client confirms.</p>}
      <div className="grid gap-4 md:grid-cols-2"><Card className="p-4"><h3 className="font-semibold">Brand positioning</h3><p className="mt-2 text-sm leading-6">{plan.output.positioning}</p></Card><Card className="p-4"><h3 className="font-semibold">Target audience</h3><p className="mt-2 text-sm leading-6">{plan.output.audience}</p></Card></div>
      <Card className="p-4"><h3 className="font-semibold">Objectives and KPIs</h3><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-fg-2"><tr><th className="py-2 pr-3">Objective</th><th className="py-2 pr-3">KPI</th><th className="py-2">Proposed target</th></tr></thead><tbody>{plan.output.objectives.map((o,i)=><tr key={i} className="border-t border-border"><td className="py-2 pr-3">{o.objective}</td><td className="py-2 pr-3">{o.kpi}</td><td className="py-2">{o.target}</td></tr>)}</tbody></table></div></Card>
      <div><h3 className="mb-2 font-semibold">Audience personas</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{plan.output.personas.map(p=><Card key={p.name} className="p-4 text-sm"><h4 className="font-semibold">{p.name}</h4><p className="mt-1 leading-6 text-fg-2">{p.description}</p>{([["Goals",p.goals],["Pain points",p.painPoints],["Likes to see",p.contentPreferences]] as const).map(([t,l])=>l.length>0&&<p key={t} className="mt-2"><span className="font-medium">{t}:</span> {l.join("; ")}</p>)}</Card>)}</div></div>
      <div><h3 className="mb-2 font-semibold">Content pillars</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{plan.output.pillars.map(p=><Card key={p.name} className="p-4 text-sm"><div className="flex items-center justify-between gap-2"><h4 className="font-semibold">{p.name}</h4><Badge tone="accent">{p.share}%</Badge></div><p className="mt-1 leading-6 text-fg-2">{p.purpose}</p><ul className="mt-2 list-disc pl-5">{p.examples.map((x,i)=><li key={i}>{x}</li>)}</ul></Card>)}</div></div>
      <div><h3 className="mb-2 font-semibold">Platform plans</h3><div className="grid gap-3 md:grid-cols-2">{plan.output.platforms.map(p=><Card key={p.platform} className="p-4 text-sm"><h4 className="font-semibold">{p.platform}</h4><p className="mt-1 leading-6">{p.role}</p><p className="mt-2"><span className="font-medium">Cadence:</span> {p.cadence}</p><p><span className="font-medium">Formats:</span> {p.formats.join(", ")}</p><p><span className="font-medium">Tone:</span> {p.tone}</p></Card>)}</div></div>
      <Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Weekly content plan</h3>{writable&&<Button className="min-h-11" variant="primary" loading={adding===0} disabled={!!busy} onClick={()=>addIdeas(plan.id,0)}>Add whole month as post ideas</Button>}</div>
        <div className="mt-3 space-y-4">{plan.output.weeks.map(w=><section key={w.week}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Week {w.week}: {w.theme}</h4>{writable&&<Button className="min-h-11" size="xs" loading={adding===w.week} disabled={!!busy} onClick={()=>addIdeas(plan.id,w.week)}>Add week {w.week} as ideas</Button>}</div>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">{w.posts.map((x,i)=><li key={i} className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-fg-2">{x.day} · {x.platform} · {x.format} · {x.pillar}</p><p className="mt-1">{x.idea}</p></li>)}</ul></section>)}</div></Card>
      {plan.output.campaigns.length>0&&<Card className="p-4"><h3 className="font-semibold">Campaign ideas</h3><ul className="mt-2 space-y-2 text-sm">{plan.output.campaigns.map((c,i)=><li key={i}><span className="font-medium">{c.name}</span> ({c.goal}): {c.idea}</li>)}</ul></Card>}
      {plan.output.growthTactics.length>0&&<Card className="p-4"><h3 className="font-semibold">Growth tactics</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{plan.output.growthTactics.map((x,i)=><li key={i}>{x}</li>)}</ul></Card>}
    </article>:<Card className="p-6 text-sm text-fg-2">No strategy yet. {writable?"Fill in the form above and press Generate strategy.":"Ask your team to create one."}</Card>}
    <div className="border-t border-border pt-5">{listening}</div>
  </div>;
}
