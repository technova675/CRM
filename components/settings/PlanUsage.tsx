"use client";

import {useCallback,useEffect,useState} from "react";
import {Building2,Layers} from "lucide-react";
import {Badge,Button,Card,CardHeader,Field,Input,Progress} from "@/components/ui";
import {PLANS,type Plan,type UsageKey} from "@/lib/types";
import {PLAN_LIMITS} from "@/lib/domain/tenant";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";

type Summary={id:string;name:string;billingEmail:string;plan:Plan;limits:Record<UsageKey,number>;usage:Record<UsageKey,number>;period:string};
const descriptions:Record<UsageKey,{label:string;scope:string;unit?:string}>={
  aiCredits:{label:"AI credits",scope:"Provider jobs reserved this month"},
  videoMinutes:{label:"Video draft minutes",scope:"Timeline generation and revision this month",unit:"min"},
  leads:{label:"Leads",scope:"Saved CRM records"},
  clients:{label:"Clients",scope:"Saved client records"},
  campaigns:{label:"Campaigns",scope:"Saved campaign records"},
  reports:{label:"Saved reports",scope:"Generated client report records"},
  storageGb:{label:"Document storage",scope:"Saved files and all their versions",unit:"GB"},
  teamMembers:{label:"Team seats",scope:"Active and invited staff profiles"},
};
const format=(value:number,unit?:string)=>{
  if(value<0)return "Unlimited";
  const text=value>0&&value<0.01?"<0.01":value.toLocaleString("en-IN",{maximumFractionDigits:2});
  return text+(unit?" "+unit:"");
};

export function PlanUsage({admin}:{admin:boolean}){
  const [summary,setSummary]=useState<Summary>();
  const [name,setName]=useState(""),[billingEmail,setBillingEmail]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch("/api/tenant",{cache:"no-store",signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Could not load workspace usage.");
    setSummary(data);
    setName(data.name);
    setBillingEmail(data.billingEmail);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
    void load(controller.signal).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
    return()=>controller.abort();
  },[load]);
  async function save(){
    setBusy(true);setError("");setNotice("");
    try{
      await flushCRMChanges();
      const response=await fetch("/api/tenant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"profile",name,billingEmail})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      await refreshCRMChanges();
      await load();
      setNotice("Organization profile saved.");
    }catch(error){setError(error instanceof Error?error.message:"Profile could not be saved.");}
    finally{setBusy(false);}
  }
  if(!summary)return <Card className="p-4"><p role={error?"alert":"status"}>{error||"Loading organization and plan…"}</p></Card>;

  return <div className="space-y-4">
    <Card>
      <CardHeader title="Organization profile" subtitle="Details saved to this signed-in workspace." action={<Building2 className="size-5 text-accent-text"/>}/>
      <form className="space-y-4 px-4 pb-4" onSubmit={event=>{event.preventDefault();void save();}}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organization name"><Input className="min-h-11" value={name} maxLength={100} required disabled={!admin||busy} onChange={event=>setName(event.target.value)}/></Field>
          <Field label="Billing contact email"><Input className="min-h-11" type="email" value={billingEmail} maxLength={254} required disabled={!admin||busy} onChange={event=>setBillingEmail(event.target.value)}/></Field>
        </div>
        <p className="break-all text-xs text-fg-3">Workspace ID {summary.id}</p>
        {admin&&<Button type="submit" variant="primary" className="min-h-11" loading={busy} disabled={busy||name===summary.name&&billingEmail===summary.billingEmail}>Save profile</Button>}
        {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
        {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
      </form>
    </Card>
    <Card>
      <CardHeader title="Usage and limits" subtitle={"Active plan "+summary.plan+" · Monthly meters use UTC · Period "+summary.period} action={<Badge tone="accent">{summary.plan}</Badge>}/>
      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(descriptions) as UsageKey[]).map(key=>{
          const item=descriptions[key],used=summary.usage[key],limit=summary.limits[key];
          return <section key={key} className="min-w-0 rounded-xl border border-border p-3">
            <h3 className="text-sm font-medium">{item.label}</h3>
            <p className="mt-2 text-xl font-semibold tabular-nums">{format(used,item.unit)}</p>
            <p className="mt-1 text-xs text-fg-3">{format(limit,item.unit)} limit</p>
            {limit>0&&<Progress className="my-2" value={Math.min(100,used/limit*100)} tone={used>=limit?"warning":"accent"}/>}
            <p className="mt-1 text-xs text-fg-3">{item.scope}</p>
          </section>;
        })}
      </div>
    </Card>
    <Card>
      <CardHeader title="Plan catalog" subtitle="Plans are assigned by the platform operator. Subscription checkout is a separate step." action={<Layers className="size-5 text-accent-text"/>}/>
      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">{PLANS.map(plan=><section key={plan} className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-1"><h3 className="font-semibold">{plan}</h3>{plan===summary.plan&&<Badge tone="success">Active</Badge>}</div>
        <dl className="mt-3 space-y-1.5 text-xs">{(Object.keys(descriptions) as UsageKey[]).map(key=><div key={key} className="flex justify-between gap-2"><dt className="text-fg-3">{descriptions[key].label}</dt><dd className="text-right tabular-nums">{format(PLAN_LIMITS[plan][key],descriptions[key].unit)}</dd></div>)}</dl>
      </section>)}</div>
    </Card>
  </div>;
}
