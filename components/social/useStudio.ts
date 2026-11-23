"use client";
import {useCallback,useEffect,useState} from "react";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";
import {toast} from "@/components/shell/toast";
import type {SocialAccount,SocialPlan,MetricRow,SocialStudioState,SocialImage,SocialRecommendation,ClientSocialSettings} from "@/lib/domain/socialStudio";

export interface StudioData{accounts:SocialAccount[];plans:SocialPlan[];metrics:MetricRow[];threads:SocialStudioState["threads"];images:SocialImage[];recommendations:SocialRecommendation[];settings:ClientSocialSettings;ai:boolean;imageReady:boolean}
/** Actions that add or change posts, so the CRM copy in the browser must be refreshed afterwards. */
const CHANGES_POSTS=new Set(["plan-to-ideas","write-post","save-studio","duplicate","bulk","revision"]);

/** Loads one client's Social workspace data and runs actions against /api/social/studio. */
export function useStudio(clientId:string){
  const [loaded,setLoaded]=useState<{clientId:string;data:StudioData}|null>(null),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  // Results can appear far down a long page, so every message is also shown as a toast.
  const say=useCallback((message:string)=>{setNotice(message);if(message)toast(message);},[]);
  const fail=useCallback((message:string)=>{setError(message);if(message)toast("Not done",message,"error");},[]);
  const load=useCallback(async()=>{
    if(!clientId)return;
    try{const r=await fetch(`/api/social/studio?clientId=${encodeURIComponent(clientId)}`,{cache:"no-store"}),body=await r.json();if(!r.ok)throw new Error(body.error??"Could not load social data.");setLoaded({clientId,data:body});}
    catch(e){setError(e instanceof Error?e.message:"Could not load social data.");}
  },[clientId]);
  useEffect(()=>{
    if(!clientId)return;let live=true;
    fetch(`/api/social/studio?clientId=${encodeURIComponent(clientId)}`,{cache:"no-store"}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error??"Could not load social data.");if(live)setLoaded({clientId,data:body});})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:"Could not load social data.");});
    return ()=>{live=false;};
  },[clientId]);
  // Data from a previously selected client is never shown for the current one.
  const data=loaded?.clientId===clientId?loaded.data:null;
  const act=useCallback(async<T=Record<string,unknown>>(action:string,payload:unknown,success?:string):Promise<T|null>=>{
    setBusy(action);setError("");setNotice("");
    try{
      if(CHANGES_POSTS.has(action))await flushCRMChanges();
      const r=await fetch("/api/social/studio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationId:crypto.randomUUID(),action,data:payload})}),body=await r.json();
      if(!r.ok)throw new Error(body.error??"Request failed.");
      // The CRM refresh skips while a local save is in flight, so try once more shortly after.
      if(CHANGES_POSTS.has(action)){await refreshCRMChanges();setTimeout(()=>void refreshCRMChanges(),2500);}
      await load();if(success)say(success);return body as T;
    }catch(e){fail(e instanceof Error?e.message:"Request failed.");return null;}
    finally{setBusy("");}
  },[load,say,fail]);
  return {data,busy,error,notice,setError:fail,setNotice:say,act,reload:load};
}
