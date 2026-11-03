"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Cloud, Download, Loader2, RefreshCw } from "lucide-react";
import { useCRM, type CRMState } from "@/lib/store";
import type { CRMLibrary } from "@/lib/domain/crmLibrary";
import { Button } from "@/components/ui";
import { downloadFile } from "@/lib/utils";
import { registerCRMFlush,registerCRMRefresh } from "@/lib/crmSync";

const keys=["marketingAutomations","leads","deals","conversations","messages","activities","team","savedViews","outreach","clients","tasks","projects","knowledge","approvals","proposals","meetings","strategies","campaigns","invoices","ads","creatives","concepts","socialPosts","seoProjects","influencers","engagements","assets","reports","recommendations","reportSchedules"] as const;
const settingsKeys=["sequences","suppressions","outreachTemplates","onboardingTemplates","proposalPriceBook"] as const;
const snapshot=(state:CRMState):CRMLibrary=>({...Object.fromEntries(keys.map(key=>[key,state[key]])),...Object.fromEntries(settingsKeys.map(key=>[key,state.settings[key]])),customFields:state.settings.leadCustomFields}) as unknown as CRMLibrary;
async function request(init?:RequestInit){
  const response=await fetch("/api/crm/library",{cache:"no-store",...init,signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error([data.error??"Could not sync CRM",...(data.issues??[])].join(" · ")),{status:response.status});
  return data as {revision:number;data:CRMLibrary};
}

export function CRMCloudProvider({account,children}:{account:{id:string;email:string};children:ReactNode}){
  const [ready,setReady]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[attempt,setAttempt]=useState(0),[conflict,setConflict]=useState(false);
  const runtime=useRef<{revision:number;json:string;applying:boolean;dirty:boolean;conflict:boolean;timer?:ReturnType<typeof setTimeout>;pending?:Promise<void>;operation?:{id:string;json:string;revision:number}}|null>(null);
  const save=useCallback(async function saveChanges(){
    const rt=runtime.current;if(!rt||!rt.dirty)return;
    if(rt.pending){await rt.pending;return saveChanges();}
    if(rt.conflict)throw new Error("Export unsaved changes and reload the CRM before saving again.");
    const json=JSON.stringify(snapshot(useCRM.getState()));
    if(json===rt.json){rt.dirty=false;setDirty(false);return;}
    // Preserve the operation ID on uncertain network failures, even if more edits arrive.
    const operation=rt.operation??{id:crypto.randomUUID(),json,revision:rt.revision};rt.operation=operation;
    setSaving(true);setError("");
    rt.pending=(async()=>{
      try{
        const result=await request({method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({revision:operation.revision,operationId:operation.id,data:JSON.parse(operation.json)})});
        rt.revision=result.revision;rt.operation=undefined;
        if(result.data){
          if(JSON.stringify(snapshot(useCRM.getState()))!==operation.json){rt.conflict=true;setConflict(true);throw new Error("Onboarding was saved while you made additional edits. Export unsaved changes, then reload the latest CRM to keep both versions reviewable.");}
          rt.applying=true;useCRM.setState(state=>({...Object.fromEntries(keys.map(key=>[key,result.data[key]])),settings:{...state.settings,...Object.fromEntries(settingsKeys.map(key=>[key,result.data[key]])),leadCustomFields:result.data.customFields}}));rt.applying=false;
          rt.json=JSON.stringify(snapshot(useCRM.getState()));
        }else rt.json=operation.json;
        rt.dirty=JSON.stringify(snapshot(useCRM.getState()))!==rt.json;setDirty(rt.dirty);
      }catch(err){if((err as {status?:number}).status===409){rt.conflict=true;setConflict(true);}setError(err instanceof Error?err.message:"Could not sync CRM");throw err;}
      finally{rt.pending=undefined;setSaving(false);}
    })();
    await rt.pending;if(rt.dirty)await saveChanges();
  },[]);

  useEffect(()=>{
    let live=true;let unsubscribe:(()=>void)|undefined;
    const apply=(data:CRMLibrary)=>{
      const rt=runtime.current;if(rt)rt.applying=true;
      useCRM.setState(state=>({...Object.fromEntries(keys.map(key=>[key,data[key]])),currentUserId:account.id,settings:{...state.settings,...Object.fromEntries(settingsKeys.map(key=>[key,data[key]])),leadCustomFields:data.customFields}}));
      if(rt)rt.applying=false;
    };
    void(async()=>{
      try{
        await useCRM.persist.rehydrate();
        try{if(!localStorage.getItem("adbibe-creative-browser-backup-v1"))localStorage.setItem("adbibe-creative-browser-backup-v1",JSON.stringify({concepts:useCRM.getState().concepts,creatives:useCRM.getState().creatives}));}catch{}
        try{if(!localStorage.getItem("adbibe-client360-browser-backup-v1"))localStorage.setItem("adbibe-client360-browser-backup-v1",JSON.stringify(snapshot(useCRM.getState())));}catch{}
        try{if(!localStorage.getItem("adbibe-proposal-browser-backup-v1"))localStorage.setItem("adbibe-proposal-browser-backup-v1",JSON.stringify(snapshot(useCRM.getState())));}catch{}
        try{if(!localStorage.getItem("adbibe-pipeline-onboarding-browser-backup-v1"))localStorage.setItem("adbibe-pipeline-onboarding-browser-backup-v1",JSON.stringify(snapshot(useCRM.getState())));}catch{}
        // Preserve pre-cloud browser data for recovery; never silently attach it to an account.
        try{if(!localStorage.getItem("adbibe-crm-browser-backup-v1"))localStorage.setItem("adbibe-crm-browser-backup-v1",JSON.stringify(snapshot(useCRM.getState())));}catch{}
        const result=await request();if(!live)return;
        runtime.current={revision:result.revision,json:JSON.stringify(result.data),applying:false,dirty:false,conflict:false};
        apply(result.data);setReady(true);setError("");setDirty(false);setConflict(false);
        unsubscribe=useCRM.subscribe((state,previous)=>{
          const rt=runtime.current;if(!rt||rt.applying)return;
          if(keys.every(key=>state[key]===previous[key])&&settingsKeys.every(key=>state.settings[key]===previous.settings[key])&&state.settings.leadCustomFields===previous.settings.leadCustomFields)return;
          rt.dirty=true;setDirty(true);clearTimeout(rt.timer);rt.timer=setTimeout(()=>void save().catch(()=>{}),400);
        });
      }catch(err){if(live)setError(err instanceof Error?err.message:"Could not open CRM library");}
    })();
    const refresh=async()=>{
      const rt=runtime.current;if(!rt||rt.dirty||rt.pending||document.visibilityState==="hidden")return;
      try{const result=await request();if(!live||rt.dirty||rt.pending)return;if(result.revision!==rt.revision){apply(result.data);rt.revision=result.revision;rt.json=JSON.stringify(result.data);}setError("");}catch(err){if(live)setError(err instanceof Error?err.message:"Could not refresh CRM");}
    };
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(runtime.current?.dirty){event.preventDefault();event.returnValue="";}};
    const interval=setInterval(()=>void refresh(),15000);
    window.addEventListener("focus",refresh);window.addEventListener("beforeunload",beforeUnload);
    const clearFlush=registerCRMFlush(save);const clearRefresh=registerCRMRefresh(refresh);
    return()=>{live=false;unsubscribe?.();clearInterval(interval);if(runtime.current?.timer)clearTimeout(runtime.current.timer);window.removeEventListener("focus",refresh);window.removeEventListener("beforeunload",beforeUnload);clearFlush();clearRefresh();runtime.current=null;};
  },[account.id,attempt,save]);

  if(!ready)return <div className="grid min-h-dvh place-items-center p-6"><div className="max-w-lg space-y-4 text-center">{error?<><p role="alert">{error}</p><Button onClick={()=>{setError("");setAttempt(value=>value+1);}}>Retry CRM connection</Button></>:<p className="flex items-center gap-2 text-sm text-fg-2" role="status"><Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true"/>Opening your CRM library…</p>}</div></div>;
  return <>{children}<aside aria-label="CRM sync status" className="no-print fixed bottom-4 right-4 z-40 max-w-[min(440px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-3 shadow-pop"><div className="flex items-center gap-2 text-xs text-fg-2" role="status">{saving?<Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true"/>:<Cloud size={15} aria-hidden="true"/>}{saving?"Saving CRM changes…":error?"CRM sync needs attention":dirty?"CRM changes waiting to save":"CRM saved to your account"}</div>{error&&<div className="mt-2 space-y-2"><p role="alert" className="text-xs leading-6 text-danger">{error}</p><div className="flex flex-wrap gap-2"><Button size="xs" icon={<Download size={14}/>} onClick={()=>downloadFile("crm-unsaved-backup.json",JSON.stringify(snapshot(useCRM.getState()),null,2),"application/json")}>Export unsaved changes</Button>{conflict?<Button size="xs" onClick={()=>{if(confirm("Reload the cloud CRM? Export your unsaved changes first; they will be replaced.")) {setReady(false);setError("");setAttempt(value=>value+1);}}}>Reload latest CRM</Button>:<Button size="xs" icon={<RefreshCw size={14}/>} onClick={()=>void save().catch(()=>{})}>Retry save</Button>}</div></div>}</aside></>;
}
