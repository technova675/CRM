"use client";
import {useCallback,useEffect,useState} from "react";
import Image from "next/image";
import {ExternalLink,Link2Off,MapPin,Users,Video} from "lucide-react";
import type {CalendarEvent,PublicCalendarLink} from "@/lib/domain/calendar";
import {PROVIDER_NAMES} from "@/lib/domain/calendar";
import {Badge,Button,Card,Field,Input,Modal} from "@/components/ui";
import {toast} from "@/components/shell/toast";
import {fmtDate,fmtTime} from "@/lib/utils";

/** Each provider's own logo, as published on its official site (see public/integrations). */
export function ProviderLogo({provider,size=18}:{provider:"google"|"calendly"|"calcom";size?:number}){
  if(provider==="calcom")return <span className="inline-flex shrink-0" style={{width:size,height:size}}>
    <Image src="/integrations/calcom-black.png" alt="" width={size} height={size} className="rounded-[22%] dark:hidden"/>
    <Image src="/integrations/calcom-white.png" alt="" width={size} height={size} className="hidden rounded-[22%] dark:block"/>
  </span>;
  return <Image src={provider==="google"?"/integrations/google-calendar.png":"/integrations/calendly.svg"} alt="" width={size} height={size} className="shrink-0" unoptimized={provider==="calendly"}/>;
}

type Status={link:PublicCalendarLink|null;providers:{google:boolean;calendly:boolean;calendlyOAuth?:boolean;calcom:boolean}};
const RANGE_KEY=(from:string,to:string)=>`${from}|${to}`;

/** The signed-in login's connection and the events of its calendar for one window. */
export function useExternalCalendar(from:string,to:string){
  const [status,setStatus]=useState<Status|null>(null),[events,setEvents]=useState<CalendarEvent[]>([]),[error,setError]=useState(""),[loaded,setLoaded]=useState("");
  const loadStatus=useCallback(async()=>{const r=await fetch("/api/calendar",{cache:"no-store"});if(r.ok)setStatus(await r.json());},[]);
  useEffect(()=>{let live=true;fetch("/api/calendar",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(s=>{if(live&&s)setStatus(s);});return()=>{live=false;};},[]);
  const connected=!!status?.link;
  useEffect(()=>{
    if(!connected)return;let live=true;const key=RANGE_KEY(from,to);
    fetch(`/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{cache:"no-store"}).then(async r=>{const body=await r.json();if(!live)return;
      if(!r.ok){setError(body.error??"The calendar could not be read.");setEvents([]);}else{setError("");setEvents(body.events);}setLoaded(key);}).catch(()=>{if(live){setError("The calendar could not be reached.");setLoaded(key);}});
    return()=>{live=false;};
  },[connected,from,to]);
  return {status,events:connected?events:[],error:connected?error:"",loading:connected&&loaded!==RANGE_KEY(from,to),reload:loadStatus,setStatus};
}

const NOTICES:Record<string,[string,string,"success"|"error"]>={
  connected:["Calendar connected","Your events now appear in Week and Month.","success"],
  "already-connected":["A calendar is already connected","Each login can connect one calendar. Disconnect it first.","error"],
  "google-denied":["Google access was not granted","Nothing was connected.","error"],
  "google-invalid":["The Google sign-in could not be verified","It may have expired or been opened in another browser. Try again.","error"],
  "google-failed":["Google Calendar could not be connected","Try again. If it keeps failing, check the Google setup.","error"],
  "google-not-configured":["Google Calendar is not set up on this server","An administrator needs to add the Google OAuth client.","error"],
  "calendly-denied":["Calendly access was not granted","Nothing was connected.","error"],
  "calendly-invalid":["The Calendly sign-in could not be verified","It may have expired or been opened in another browser. Try again.","error"],
  "calendly-failed":["Calendly could not be connected","Try again in a minute.","error"],
  "calendly-not-configured":["Calendly sign-in is not set up on this server","An administrator needs to add the Calendly OAuth app.","error"],
};
/** Shows the result of the Google round trip once, then cleans the address bar. */
export function useCalendarNotice(){
  useEffect(()=>{
    const p=new URLSearchParams(location.search),c=p.get("calendar");if(!c)return;
    const n=NOTICES[c];if(n)toast(n[0],n[1],n[2]);
    p.delete("calendar");history.replaceState(null,"",location.pathname+(p.size?`?${p}`:""));
  },[]);
}

const HELP={
  calendly:{title:"Connect Calendly",label:"Personal access token",steps:["Open Calendly and go to Integrations, then API and webhooks.","Choose Get a token now, name it Adbibe OS and copy it.","Paste it here. It is stored encrypted and only used to read your scheduled events."],href:"https://calendly.com/integrations/api_webhooks",placeholder:"eyJraWQiOi…"},
  calcom:{title:"Connect Cal.com",label:"API key",steps:["Open Cal.com Settings, then Developer, then API keys.","Create a key named Adbibe OS with no expiry, or the longest you allow, and copy it.","Paste it here. It is stored encrypted and only used to read your bookings."],href:"https://app.cal.com/settings/developer/api-keys",placeholder:"cal_live_…"},
} as const;

export function CalendarConnect({status,error,onChange,canConnect}:{status:Status|null;error:string;onChange:()=>void;canConnect:boolean}){
  const [modal,setModal]=useState<"calendly"|"calcom"|null>(null),[soon,setSoon]=useState(false),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[confirm,setConfirm]=useState(false);
  if(!status)return null;
  const link=status.link;
  const connect=async()=>{if(!modal)return;setBusy(true);setMsg("");
    const r=await fetch("/api/calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"connect",provider:modal,token})}),body=await r.json().catch(()=>({}));
    setBusy(false);if(!r.ok){setMsg(body.error??"Could not connect.");return;}
    toast("Calendar connected",`${HELP[modal].title.replace("Connect ","")} · ${body.link?.account??""}`);setModal(null);setToken("");onChange();};
  const disconnect=async()=>{setBusy(true);const r=await fetch("/api/calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"disconnect"})});setBusy(false);setConfirm(false);
    if(r.ok){toast("Calendar disconnected","Its events no longer appear here.");onChange();}else toast("Could not disconnect","Try again.","error");};
  return <>
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      {link?<div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2"><ProviderLogo provider={link.provider} size={22}/></span>
        <div className="min-w-0"><p className="text-[13px] font-semibold">{PROVIDER_NAMES[link.provider]} connected</p>
          <p className="truncate text-xs text-fg-3">{link.account}{link.lastSyncAt?` · synced ${fmtTime(link.lastSyncAt)}`:""}</p>
          {(error||link.lastError)&&<p className="mt-1 text-xs text-danger">{error||link.lastError}</p>}</div>
      </div>:<div><p className="text-[13px] font-semibold">Connect your calendar</p><p className="text-xs text-fg-3">See your Google Calendar, Calendly or Cal.com bookings next to CRM meetings. One calendar per login, read-only.</p></div>}
      {canConnect&&(link?(confirm?<div className="flex gap-2"><Button size="sm" variant="danger" loading={busy} onClick={disconnect}>Confirm disconnect</Button><Button size="sm" onClick={()=>setConfirm(false)}>Keep it</Button></div>
        :<Button size="sm" icon={<Link2Off className="size-3.5"/>} onClick={()=>setConfirm(true)}>Disconnect</Button>)
      :<div className="flex flex-wrap gap-2">
        {/* Google Calendar waits for Google's app verification; the server route stays in place for when it is approved. */}
        <Button size="sm" icon={<ProviderLogo provider="google"/>} onClick={()=>setSoon(true)}>Google Calendar</Button>
        {/* Sign in with Calendly when the OAuth app is configured; the token form remains only as a fallback for administrators. */}
        {status.providers.calendlyOAuth?<Button size="sm" icon={<ProviderLogo provider="calendly"/>} href="/api/calendar/calendly/start">Calendly</Button>
          :<Button size="sm" icon={<ProviderLogo provider="calendly"/>} disabled={!status.providers.calendly} onClick={()=>{setModal("calendly");setMsg("");setToken("");}}>Calendly</Button>}
        <Button size="sm" icon={<ProviderLogo provider="calcom"/>} disabled={!status.providers.calcom} onClick={()=>{setModal("calcom");setMsg("");setToken("");}}>Cal.com</Button>
      </div>)}
    </Card>
    {soon&&<Modal open onClose={()=>setSoon(false)} title={<span className="flex items-center gap-2"><ProviderLogo provider="google" size={22}/>Google Calendar is coming soon</span>} subtitle="We are completing Google's app review." footer={<><Button onClick={()=>setSoon(false)}>Close</Button>{status.providers.calcom&&<Button variant="primary" onClick={()=>{setSoon(false);setModal("calcom");setMsg("");setToken("");}}>Connect Cal.com instead</Button>}</>}>
      <p className="text-sm text-fg-2">Direct Google Calendar connection will be available once Google approves Adbibe OS. Until then, connect Calendly or Cal.com: both sync with your Google Calendar, so your Google bookings still appear here.</p>
    </Modal>}
    {modal&&<Modal open onClose={()=>!busy&&setModal(null)} title={<span className="flex items-center gap-2"><ProviderLogo provider={modal} size={22}/>{HELP[modal].title}</span>} subtitle="Read-only. You can disconnect at any time." footer={<><Button onClick={()=>setModal(null)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} disabled={busy||token.trim().length<20} onClick={connect}>Connect</Button></>}>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">{HELP[modal].steps.map(s=><li key={s}>{s}</li>)}</ol>
        <a className="inline-flex items-center gap-1 text-sm text-accent-text underline" href={HELP[modal].href} target="_blank" rel="noreferrer">Open {HELP[modal].title.replace("Connect ","")} settings <ExternalLink className="size-3.5"/></a>
        <Field label={HELP[modal].label}><Input type="password" autoComplete="off" spellCheck={false} value={token} placeholder={HELP[modal].placeholder} onChange={e=>setToken(e.target.value)}/></Field>
        {msg&&<p role="alert" className="text-sm text-danger">{msg}</p>}
      </div>
    </Modal>}
  </>;
}

export function ExternalEventModal({event,onClose,onTrack,canTrack}:{event:CalendarEvent|null;onClose:()=>void;onTrack:(e:CalendarEvent)=>void;canTrack:boolean}){
  if(!event)return null;
  const mins=Math.max(5,Math.round((Date.parse(event.end)-Date.parse(event.start))/60000));
  return <Modal open onClose={onClose} title={event.title} subtitle={`${PROVIDER_NAMES[event.provider]} · read-only`} footer={<>
    {event.htmlLink&&<Button href={event.htmlLink} external icon={<ExternalLink className="size-3.5"/>}>Open in {PROVIDER_NAMES[event.provider]}</Button>}
    {canTrack&&<Button variant="primary" onClick={()=>onTrack(event)}>Track in CRM meetings</Button>}</>}>
    <div className="space-y-3 text-sm">
      <p>{event.allDay?`${fmtDate(event.start)} · all day`:`${fmtDate(event.start)} · ${fmtTime(event.start)} – ${fmtTime(event.end)} (${mins} min)`}{event.status==="tentative"&&<Badge tone="warning" className="ml-2">Tentative</Badge>}</p>
      {event.location&&<p className="flex items-start gap-2 text-fg-2"><MapPin className="mt-0.5 size-4 shrink-0"/>{event.location}</p>}
      {event.joinUrl&&<p className="flex items-start gap-2"><Video className="mt-0.5 size-4 shrink-0"/><a className="break-all text-accent-text underline" href={event.joinUrl} target="_blank" rel="noreferrer">Join the call</a></p>}
      {event.attendees.length>0&&<p className="flex items-start gap-2 text-fg-2"><Users className="mt-0.5 size-4 shrink-0"/>{event.attendees.join(", ")}</p>}
      {event.provider==="calendly"&&<p className="text-xs text-fg-3">Invitee details stay in Calendly.</p>}
    </div>
  </Modal>;
}
