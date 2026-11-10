"use client";

import {useCallback,useEffect,useState} from "react";
import {KeyRound} from "lucide-react";
import {Badge,Button,Card,CardHeader,Field,Input} from "@/components/ui";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";

type Key={id:string;name:string;prefix:string;createdAt:string;revokedAt?:string};
export function ApiKeysCard({writable}:{writable:boolean}){
  const [keys,setKeys]=useState<Key[]>([]),[name,setName]=useState(""),[secret,setSecret]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    const response=await fetch("/api/workspace/keys",{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error);
    setKeys(data.keys);
  },[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
  useEffect(()=>{void load().catch(error=>setError(error.message));},[load]);
  async function run(action:unknown){
    setBusy(true);setError("");setNotice("");setSecret("");
    try{
      await flushCRMChanges();
      const response=await fetch("/api/workspace/keys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      if(data.secret){setSecret(data.secret);setName("");}
      await refreshCRMChanges();
      await load();
      setNotice(data.secret?"Key created. Copy it before leaving this page.":"API key revoked.");
    }catch(error){setError(error instanceof Error?error.message:"Could not update API keys.");}
    finally{setBusy(false);}
  }
  return <Card>
    <CardHeader title="Workspace API keys" subtitle="Read-only bearer keys for the workspace usage summary. A key is shown once and stored as a hash." action={<KeyRound className="size-5 text-accent-text"/>}/>
    <div className="space-y-3 px-4 pb-4">
      {writable&&<form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();void run({action:"create",name});}}>
        <Field label="Key name" className="min-w-0 flex-1"><Input className="min-h-11" value={name} required maxLength={100} onChange={event=>setName(event.target.value)}/></Field>
        <Button type="submit" className="min-h-11" loading={busy} disabled={busy}>Create read-only key</Button>
      </form>}
      {secret&&<Field label="Copy your API key"><Input className="min-h-11" value={secret} readOnly onFocus={event=>event.target.select()}/></Field>}
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
      {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
      <p className="text-xs text-fg-3">Use the Authorization bearer header with <code>GET /api/workspace/summary</code>.</p>
      <ul className="divide-y divide-border">
        {keys.map(key=><li key={key.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words font-medium">{key.name}</p><p className="text-xs text-fg-3">{key.prefix}</p></div>
          <Badge tone={key.revokedAt?"neutral":"success"}>{key.revokedAt?"Revoked":"Active"}</Badge>
          {writable&&!key.revokedAt&&<Button className="min-h-11" disabled={busy} onClick={()=>void run({action:"revoke",id:key.id})}>Revoke key</Button>}
        </li>)}
      </ul>
    </div>
  </Card>;
}
