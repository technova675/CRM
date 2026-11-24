"use client";
import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,PlugZap,TriangleAlert} from "lucide-react";
import type {SocialPlatform} from "@/lib/types";
import {Badge,Button,Card} from "@/components/ui";
import {toast} from "@/components/shell/toast";
import {fmtDate} from "@/lib/utils";
import {PLATFORMS,PlatformLogo} from "./shared";

type Provider="meta"|"threads"|"linkedin"|"x"|"reddit"|"youtube";
const PROVIDER_OF:Record<SocialPlatform,Provider>={Facebook:"meta",Instagram:"meta",Threads:"threads",LinkedIn:"linkedin",X:"x",Reddit:"reddit",YouTube:"youtube"};
type Connection={platform:SocialPlatform;accountName:string;connectedAt:string;expiresAt?:string;lastError?:string};
type Status={connections:Connection[];pendingPages:{id:string;name:string;instagram?:string}[]|null;providers:Record<Provider,{ready:boolean;missing:string[];name:string}>;media:{ready:boolean;missing:string[]}};

const NOTICES:Record<string,[string,string?]>={connected:["Account connected","Approved posts for this network can now be published from the CRM."],"choose-page":["Choose the Facebook Page","This Facebook login manages several Pages. Pick the client's Page below."],
  denied:["Connection cancelled","Nothing was connected."],invalid:["The sign-in link expired","Start the connection again from this page."],failed:["The network did not connect"],"not-configured":["This network is not set up yet","Its app keys are missing on the server."],"no-access":["Social edit access is required"]};

/** Shows a toast for the ?social= result the sign-in flow returns with, then cleans the address bar. */
export function useConnectionNotice(onResult:()=>void){
  useEffect(()=>{
    const q=new URLSearchParams(window.location.search),status=q.get("social");if(!status)return;
    const [title,body]=NOTICES[status]??["Connection finished"];
    toast(title,status==="failed"?q.get("reason")??"Try again, or check the network's app settings.":body,["connected","choose-page"].includes(status)?"success":"warning");
    q.delete("social");q.delete("network");q.delete("reason");q.delete("client");
    window.history.replaceState(null,"",`${window.location.pathname}${q.size?`?${q}`:""}`);onResult();
  },[onResult]);
}

/** One client's publishing connections: official sign-in per network, no passwords or cookies. */
export function PublishingConnections({clientId,clientName,writable}:{clientId:string;clientName:string;writable:boolean}){
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const load=useCallback(async()=>{
    if(!clientId)return;
    try{const r=await fetch(`/api/social/connections?clientId=${encodeURIComponent(clientId)}`,{cache:"no-store"});const data=await r.json();if(!r.ok)throw new Error(data.error??"Could not load connections.");setStatus(data);setError("");}
    catch(e){setError(e instanceof Error?e.message:"Could not load connections.");}
  },[clientId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after the fetch resolves
  useEffect(()=>{void load();},[load]);
  useConnectionNotice(load);
  const post=async(key:string,body:object,done:string)=>{setBusy(key);try{const r=await fetch("/api/social/connections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error??"That did not work.");toast(done);await load();}catch(e){toast("Could not update",e instanceof Error?e.message:undefined,"warning");}finally{setBusy("");}};

  return <Card className="space-y-4 p-5">
    <div><h2 className="font-semibold">Publishing connections · {clientName}</h2>
      <p className="mt-1 text-sm text-fg-2">Connect the client&apos;s accounts once with each network&apos;s official sign-in. Approved posts then publish from the CRM, now or at their planned time. Passwords are never asked for or stored.</p></div>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {status?.pendingPages&&<div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
      <p className="text-sm font-medium">Choose which Facebook Page belongs to {clientName}</p>
      <div className="flex flex-wrap gap-2">{status.pendingPages.map(p=><Button key={p.id} size="sm" loading={busy===p.id} disabled={!!busy||!writable} onClick={()=>void post(p.id,{action:"choose-page",clientId,pageId:p.id},"Facebook Page connected")}>{p.name}{p.instagram?` · Instagram ${p.instagram==="linked"?"linked":`@${p.instagram}`}`:" · no Instagram"}</Button>)}</div>
    </div>}
    {!status&&!error&&<p className="text-sm text-fg-3">Checking connections…</p>}
    {status&&<ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{PLATFORMS.map(n=>{
      const c=status.connections.find(x=>x.platform===n),provider=PROVIDER_OF[n],setup=status.providers[provider];
      const href=`/api/social/connect/${provider}?clientId=${encodeURIComponent(clientId)}`;
      return <li key={n} className="flex min-h-16 items-center gap-3 rounded-lg border border-border p-3">
        <PlatformLogo platform={n} size={28}/>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">{n}{c&&!c.lastError&&<CheckCircle2 className="size-3.5 text-success" aria-label="Connected"/>}</p>
          <p className="truncate text-xs text-fg-3">{c?`${c.accountName} · since ${fmtDate(c.connectedAt)}`:setup.ready?"Not connected":"Not set up on the server yet"}</p>
          {c?.lastError&&<p className="mt-0.5 flex items-center gap-1 text-xs text-warning"><TriangleAlert className="size-3"/>{c.lastError}</p>}
        </div>
        {writable&&(c?<div className="flex flex-col gap-1">
            {c.lastError&&setup.ready&&<Button size="xs" href={href}>Reconnect</Button>}
            <Button size="xs" variant="ghost" loading={busy===n} disabled={!!busy} onClick={()=>void post(n,{action:"disconnect",clientId,platform:n},`${n} disconnected`)}>Disconnect</Button>
          </div>
          :setup.ready?<Button size="sm" icon={<PlugZap className="size-3.5"/>} href={href}>Connect</Button>
          :<span title={`Missing on the server: ${setup.missing.join(", ")}`}><Badge>Coming soon</Badge></span>)}
      </li>;})}</ul>}
    {status&&<p className="text-xs text-fg-3">Facebook and Instagram connect together through one Meta sign-in: Instagram must be a Business or Creator account linked to the client&apos;s Facebook Page. {status.media.ready?"Media uploads go to your media storage.":"Media upload is not set up yet; paste public file links in posts for now."}</p>}
  </Card>;
}
