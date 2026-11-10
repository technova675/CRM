"use client";

import Link from "next/link";
import {useId,useMemo,useState,type ReactNode} from "react";
import {Area,CartesianGrid,ComposedChart,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {Activity,ArrowDownRight,ArrowRight,ArrowUpRight,CalendarDays,ChartNoAxesCombined,CircleDollarSign,ClipboardCheck,Layers3,Sparkles,Target,Users,Wallet} from "lucide-react";
import {Badge,Button,Card,EmptyState,Select} from "@/components/ui";
import {useCRM,useMe} from "@/lib/store";
import {can,type Module} from "@/lib/permissions";
import {AGENTS} from "@/lib/ai/agents";
import {AGENT_WORKSPACES} from "@/lib/ai/agentWorkspaces";
import {dashboardChange,dashboardDay,dashboardMetrics} from "@/lib/domain/dashboardOverview";
import type {AIActionKind} from "@/lib/types";
import {compact,compactMoney,money} from "@/lib/utils";

const dateLabel=(date:string)=>new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(date));
const number=(value:number)=>value.toLocaleString("en-IN");
const metrics={
  spend:{label:"Ad spend",color:"var(--chart-1)",format:money},
  revenue:{label:"Ad revenue",color:"var(--chart-3)",format:money},
  conversions:{label:"Conversions",color:"var(--chart-1)",format:number},
  leads:{label:"Ad leads",color:"var(--chart-2)",format:number},
  crmLeads:{label:"New CRM leads",color:"var(--chart-1)",format:number},
};
type Metric=keyof typeof metrics;
const priority={High:0,Medium:1,Low:2};
const approvalModules:Record<AIActionKind,Module>={
  Outreach:"outreach","Follow-ups":"outreach","Campaign changes":"campaigns","Campaign recommendations":"performance",
  "Client communication":"clients",Reports:"reports","Payment reminders":"payments","Creative generation":"creative",
  "Social publishing":"social","Video exports":"video","Strategy documents":"strategy",Proposals:"proposals",
  "Task creation":"tasks","SEO changes":"seo","Influencer outreach":"influencers",
};

function MetricCard({label,value,note,change,icon,tone}:{label:string;value:string;note:string;change?:number|null;icon:ReactNode;tone:string}){
  const Direction=(change??0)<0?ArrowDownRight:ArrowUpRight;
  return <Card className="min-w-0 rounded-2xl p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-medium text-fg-2">{label}</p>
      <span className={"grid size-9 shrink-0 place-items-center rounded-xl "+tone}>{icon}</span>
    </div>
    <p className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
      {change!=null&&<span className="inline-flex items-center gap-1 font-medium text-fg-2 tabular-nums">
        {change!==0&&<Direction className="size-3.5" aria-hidden="true"/>}{change>0?"+":""}{change.toFixed(1)}%
      </span>}{note}
    </div>
  </Card>;
}

function Trend({data,keys}:{data:ReturnType<typeof dashboardMetrics>["chart"];keys:Metric[]}){
  const fill=useId();
  const hasData=data.some(row=>keys.some(key=>row[key]!==null));
  const currency=keys[0]==="spend";
  const rangeLabel=(row:typeof data[number])=>row.date===row.end?dateLabel(row.date):dateLabel(row.date)+" to "+dateLabel(row.end);
  if(!hasData)return <div className="grid min-h-60 place-items-center">
    <EmptyState icon={<Activity className="size-5"/>} title="No measured values in this window" description="Choose another metric or add dated performance data."/>
  </div>;
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-fg-2">
      {keys.map((key,index)=><span key={key} className="inline-flex items-center gap-2">
        <span className={"w-5 border-t-2 "+(index?"border-dashed":"")} style={{borderColor:metrics[key].color}}/>{metrics[key].label}
      </span>)}
    </div>
    <div className="h-60 min-w-0 sm:h-72" role="group" aria-label="Performance trend chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart accessibilityLayer data={data} margin={{top:10,right:8,left:0,bottom:4}}>
          <defs><linearGradient id={fill} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metrics[keys[0]].color} stopOpacity=".24"/><stop offset="100%" stopColor={metrics[keys[0]].color} stopOpacity="0"/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4"/>
          <XAxis dataKey="date" tickFormatter={dateLabel} tick={{fontSize:11,fill:"var(--fg-3)"}} minTickGap={28} tickLine={false} axisLine={false}/>
          <YAxis width={52} tickFormatter={currency?compactMoney:compact} tick={{fontSize:11,fill:"var(--fg-3)"}} tickLine={false} axisLine={false} allowDecimals={currency}/>
          <Tooltip cursor={{stroke:"var(--border-strong)"}} content={({active,payload})=>{
            const row=payload?.[0]?.payload as typeof data[number]|undefined;
            if(!active||!row)return null;
            return <div className="rounded-xl border border-border bg-surface p-3 text-xs shadow-pop"><p className="mb-2 font-semibold">{rangeLabel(row)}</p>
              {keys.map(key=><p key={key} className="flex justify-between gap-4 text-fg-2"><span>{metrics[key].label}</span><strong>{row[key]===null?"Unavailable":metrics[key].format(row[key])}</strong></p>)}
            </div>;
          }}/>
          <Area type="linear" dataKey={keys[0]} stroke={metrics[keys[0]].color} strokeWidth={2.5} fill={"url(#"+fill+")"} isAnimationActive={false} dot={data.filter(row=>row[keys[0]]!==null).length<=7}/>
          {keys[1]&&<Line type="linear" dataKey={keys[1]} stroke={metrics[keys[1]].color} strokeWidth={2} strokeDasharray="5 4" dot={data.filter(row=>row[keys[1]]!==null).length<=7} isAnimationActive={false}/>}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <details className="mt-3 border-t border-border text-xs">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-accent-text">View chart data</summary>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-left"><thead><tr className="text-fg-3"><th className="p-2">Period</th>{keys.map(key=><th key={key} className="p-2 text-right">{metrics[key].label}</th>)}</tr></thead>
          <tbody>{data.map(row=><tr key={row.date} className="border-t border-border"><td className="p-2">{rangeLabel(row)}</td>{keys.map(key=><td key={key} className="p-2 text-right tabular-nums">{row[key]===null?"—":metrics[key].format(row[key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </>;
}

export function DashboardOverview({days,onDaysChange}:{days:number;onDaysChange:(value:number)=>void}){
  const me=useMe();
  const campaigns=useCRM(state=>state.campaigns),leads=useCRM(state=>state.leads),clients=useCRM(state=>state.clients);
  const tasks=useCRM(state=>state.tasks),recommendations=useCRM(state=>state.recommendations),approvals=useCRM(state=>state.approvals);
  const aiTasks=useCRM(state=>state.aiTasks);
  const [mode,setMode]=useState<"finance"|"outcomes">("finance");
  const [now]=useState(()=>new Date());
  const today=dashboardDay(now);
  const showMedia=can(me.role,"campaigns")||can(me.role,"performance");
  const showLeads=can(me.role,"leads");
  const data=useMemo(()=>dashboardMetrics(showMedia?campaigns:[],showLeads?leads:[],days,today),[campaigns,leads,days,today,showMedia,showLeads]);
  const media=showMedia&&(!!data.latest||!showLeads);
  const compare=data.campaignDays===days&&data.previousDays===days;
  const change=(value:number|null,previous:number|null)=>compare?dashboardChange(value,previous):null;
  const value=(amount:number|null,format:(n:number)=>string)=>amount===null?"—":format(amount);
  const keys:Metric[]=media?(mode==="finance"?["spend","revenue"]:["leads","conversions"]):showLeads?["crmLeads"]:[];
  const open= recommendations.filter(rec=>rec.status==="New"&&can(me.role,AGENT_WORKSPACES[rec.agent]?.module??"performance"))
    .sort((a,b)=>priority[a.priority]-priority[b.priority]||b.createdAt.localeCompare(a.createdAt));
  const pending=approvals.filter(item=>item.status==="pending"&&can(me.role,approvalModules[item.kind])).length;
  const running=aiTasks.filter(task=>["running","queued"].includes(task.status)&&can(me.role,AGENT_WORKSPACES[task.agent]?.module??"command")).length;
  const openTasks=can(me.role,"tasks")?tasks.filter(task=>task.status!=="Done"&&(me.role==="admin"||task.assigneeId===me.id)).length:null;
  const maxSpend=data.spendByPlatform[0]?.spend??1;
  const windowLabel=dateLabel(data.range.start)+" – "+dateLabel(data.range.end);
  const chartVisible=keys.length>0;
  const dayLabel=new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",timeZone:"Asia/Kolkata"}).format(now);
  const note=compare?"vs previous "+days+" days":data.campaignDays?data.campaignDays+" of "+days+" days recorded":"No measurements";
  const top=open[0];
  const workspace=top?AGENT_WORKSPACES[top.agent]:undefined;
  const insightHref=top&&workspace?workspace.href:can(me.role,"analytics")?"/analytics":undefined;

  return <div className="min-w-0 space-y-4 sm:space-y-5">
    <header className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[#191542] px-5 py-6 text-white sm:px-7 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_95%_5%,#5539a3_0%,transparent_60%),radial-gradient(ellipse_at_65%_100%,#242961_0%,transparent_52%)]"/>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-violet-100"><CalendarDays className="size-4"/>{dayLabel}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-violet-100">Welcome, {me.name.split(" ")[0]}. See how your agency is performing and what needs attention.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-violet-100">Date range
            <Select aria-label="Date range" value={days} onChange={e=>onDaysChange(Number(e.target.value))} className="min-h-11 border-white/25! bg-[#2e235b]! text-white!">
              <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </Select>
          </label>
          {can(me.role,"leads","write")&&<Link href="/leads?new=1" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#231843] hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Add lead <ArrowRight className="size-4"/></Link>}
        </div>
      </div>
    </header>
    <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
      {media?<>
        <MetricCard label="Ad spend" value={value(data.current.spend,compactMoney)} note={note} change={change(data.current.spend,data.previous.spend)} tone="bg-accent-soft text-accent-text" icon={<Wallet className="size-4"/>}/>
        <MetricCard label="Ad revenue" value={value(data.current.revenue,compactMoney)} note={note} change={change(data.current.revenue,data.previous.revenue)} tone="bg-success-soft text-success" icon={<CircleDollarSign className="size-4"/>}/>
        <MetricCard label="Conversions" value={value(data.current.conversions,number)} note={note} change={change(data.current.conversions,data.previous.conversions)} tone="bg-info-soft text-info" icon={<Target className="size-4"/>}/>
        <MetricCard label="Return on ad spend" value={value(data.current.roas,n=>n.toFixed(2)+"×")} note={note} change={change(data.current.roas,data.previous.roas)} tone="bg-warning-soft text-warning" icon={<ChartNoAxesCombined className="size-4"/>}/>
      </>:<>
        {showLeads&&<MetricCard label="New CRM leads" value={number(data.crmLeads)} note="vs previous period" change={dashboardChange(data.crmLeads,data.previousCrmLeads)} tone="bg-accent-soft text-accent-text" icon={<Users className="size-4"/>}/>}
        {can(me.role,"clients")&&<MetricCard label="Clients" value={number(clients.length)} note="In your workspace" tone="bg-info-soft text-info" icon={<Layers3 className="size-4"/>}/>}
        {openTasks!==null&&<MetricCard label="Open tasks" value={number(openTasks)} note={me.role==="admin"?"Across the workspace":"Assigned to you"} tone="bg-warning-soft text-warning" icon={<ClipboardCheck className="size-4"/>}/>}
        <MetricCard label="Open insights" value={number(open.length)} note="Recommendations to review" tone="bg-accent-soft text-accent-text" icon={<Sparkles className="size-4"/>}/>
      </>}
    </div>
    <div className={"grid min-w-0 items-start gap-4 "+(chartVisible?"xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]":"")}>
      {chartVisible&&<Card className="min-w-0 rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold tracking-tight">{media?"Performance trend":"Lead activity"}</h2>
            <p className="mt-1 text-xs text-fg-3">{windowLabel} · {media?data.latest?"Dated campaign records":"Awaiting campaign data":"CRM lead creation dates"}{days>30?" · Weekly buckets":""}</p>
          </div>
          {media&&<Select aria-label="Chart metric" value={mode} onChange={e=>setMode(e.target.value as typeof mode)} className="min-h-11">
            <option value="finance">Spend and revenue</option><option value="outcomes">Leads and conversions</option>
          </Select>}
        </div>
        <Trend data={data.chart} keys={keys}/>
      </Card>}
      <Card className="min-w-0 rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"><Sparkles className="size-5"/></span>
          <div><h2 className="text-lg font-semibold tracking-tight">AI insights</h2><p className="mt-0.5 text-xs text-fg-3">Saved recommendations from your specialists</p></div>
        </div>
        {top?<div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface-2/55 p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={top.priority==="High"?"warning":"info"}>{top.priority} priority</Badge><span className="text-xs text-fg-3">{AGENTS[top.agent]?.name}</span></div>
            <h3 className="break-words font-semibold">{top.title}</h3>
            <p className="mt-2 break-words text-sm leading-5 text-fg-2">{top.finding}</p>
            {top.why&&<p className="mt-2 break-words text-xs leading-5 text-fg-3"><strong>Possible explanation</strong> {top.why}</p>}
            <p className="mt-2 break-words text-sm leading-5"><strong>Next step</strong> {top.recommendation}</p>
            {top.test&&<p className="mt-2 break-words text-xs leading-5 text-fg-2"><strong>Suggested test</strong> {top.test}</p>}
            {!!top.evidence?.length&&<details className="mt-2 border-t border-border">
              <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-accent-text">View supporting evidence</summary>
              <ul className="space-y-2 text-xs text-fg-2">{top.evidence.slice(0,6).map((item,index)=><li key={index} className="break-words"><strong>{item.label}</strong> {item.value}<span className="block text-fg-3">{item.source}</span></li>)}</ul>
            </details>}
          </div>
          {open.length>1&&<p className="text-xs text-fg-3">{open.length-1} more open {open.length===2?"recommendation":"recommendations"}</p>}
        </div>:<EmptyState title="No open recommendations" description="Run an analysis in a specialist workspace to see its saved findings here."/>}
        <div className="mt-3 flex flex-wrap gap-2">
          {insightHref&&<Button href={insightHref} className="min-h-11" icon={<ArrowRight className="size-4"/>}>{top?"Review recommendation":"Open Analytics"}</Button>}
          {can(me.role,"command")&&<Button href="/command" className="min-h-11" icon={<Sparkles className="size-4"/>}>Ask AI</Button>}
        </div>
      </Card>
    </div>
    {(data.spendByPlatform.length>0||can(me.role,"automations")||can(me.role,"command"))&&<div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {data.spendByPlatform.length>0&&<Card className="min-w-0 rounded-2xl p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">Spend by platform</h2><p className="mt-1 text-xs text-fg-3">Top recorded platforms · {windowLabel}</p>
        <ul className="mt-4 space-y-3">{data.spendByPlatform.slice(0,5).map((item,index)=><li key={item.name}>
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span className="break-words">{item.name}</span><strong className="tabular-nums">{compactMoney(item.spend)}</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full rounded-full" style={{width:(item.spend/maxSpend*100)+"%",background:"var(--chart-"+(index+1)+")"}}/></div>
        </li>)}</ul>
      </Card>}
      {(can(me.role,"automations")||can(me.role,"command"))&&<Card className="min-w-0 rounded-2xl p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">Work in progress</h2><p className="mt-1 text-xs text-fg-3">Review requests and active agent jobs</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {can(me.role,"automations")&&<Link href="/approvals" className="rounded-xl border border-border p-3 hover:bg-surface-2"><span className="block text-xl font-semibold tabular-nums">{pending}</span><span className="text-sm text-fg-2">Pending CRM approvals</span></Link>}
          {can(me.role,"command")&&<Link href="/command?tab=activity" className="rounded-xl border border-border p-3 hover:bg-surface-2"><span className="block text-xl font-semibold tabular-nums">{running}</span><span className="text-sm text-fg-2">Active AI jobs</span></Link>}
        </div>
      </Card>}
    </div>}
  </div>;
}
