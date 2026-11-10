"use client";

import {useEffect,useState} from "react";
import {Database,LockKeyhole} from "lucide-react";
import {Badge,Button,Card,CardHeader,Field,Input,Select,Textarea} from "@/components/ui";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";

const labels={media:"Media connector token",searchConsole:"Google Search Console service account"} as const;
type Slot=keyof typeof labels;
type Entry={slot:Slot;updatedAt:string};
type Vault={configured:boolean;entries:Entry[]};
type Preview={
  createdAt:string;counts:{label:string;added:number;updated:number;removed:number}[];
  unshared:number;disabledLogins:number;pausedWorkflows:number;
  ticket:{revision:number;expiresAt:number;operation:string;mac:string};
};

async function securityRequest<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(path,body===undefined?{cache:"no-store"}:{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??"The request could not be completed.");
  return result;
}

export function CredentialVault(){
  const [vault,setVault]=useState<Vault>(),[slot,setSlot]=useState<Slot>("media");
  const [secret,setSecret]=useState(""),[remove,setRemove]=useState<Slot>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const path="/api/workspace/vault";

  useEffect(()=>{
    let active=true;
    void securityRequest<Vault>(path).then(value=>{if(active)setVault(value);},error=>{if(active)setError(error.message);});
    return()=>{active=false;};
  },[]);

  async function run(action:"save"|"remove",target:Slot){
    setBusy(true);setError("");setNotice("");
    try{
      await flushCRMChanges();
      await securityRequest(path,{action,slot:target,...(action==="save"?{secret}:{})});
      setSecret("");setRemove(undefined);
      setVault(await securityRequest<Vault>(path));
      setNotice(action==="save"?"Credential saved.":"Credential removed.");
      await refreshCRMChanges();
    }catch(error){setError(error instanceof Error?error.message:"Could not update the vault.");}
    finally{setBusy(false);}
  }

  return <Card>
    <CardHeader title="Credential vault" subtitle="Store connector credentials for this organization. Saved values are never displayed." action={<LockKeyhole className="size-5 text-accent-text"/>}/>
    <div className="space-y-3 px-4 pb-4">
      {vault&&!vault.configured&&<p className="text-sm text-fg-2">Set <code>WORKSPACE_VAULT_KEY</code> on the server to save encrypted credentials.</p>}
      <ul className="divide-y divide-border">
        {(Object.keys(labels) as Slot[]).map(id=>{
          const entry=vault?.entries.find(item=>item.slot===id);
          return <li key={id} className="flex flex-wrap items-center gap-2 py-3">
            <span className="min-w-0 flex-1 text-sm font-medium">{labels[id]}</span>
            {vault&&<Badge tone={entry?"success":"neutral"}>{entry?"Stored":"Empty"}</Badge>}
            {entry&&(remove===id?<div className="flex flex-wrap gap-2">
              <Button className="min-h-11" variant="danger" disabled={busy} onClick={()=>void run("remove",id)}>Confirm removal</Button>
              <Button className="min-h-11" disabled={busy} onClick={()=>setRemove(undefined)}>Cancel</Button>
            </div>:<Button className="min-h-11" disabled={busy} onClick={()=>setRemove(id)}>Remove</Button>)}
          </li>;
        })}
      </ul>
      {vault?.configured&&<form className="space-y-3 border-t border-border pt-3" onSubmit={event=>{event.preventDefault();void run("save",slot);}}>
        <Field label="Connector"><Select className="min-h-11" value={slot} disabled={busy} onChange={event=>{setSlot(event.target.value as Slot);setSecret("");}}>
          <option value="media">{labels.media}</option><option value="searchConsole">{labels.searchConsole}</option>
        </Select></Field>
        {slot==="media"?<Field label="Bearer token" hint="Used with the server-configured media connector endpoint.">
          <Input className="min-h-11" type="password" autoComplete="new-password" required maxLength={12000} value={secret} disabled={busy} onChange={event=>setSecret(event.target.value)}/>
        </Field>:<Field label="Service account JSON" hint="Paste the service account JSON for an account that can read your Search Console property.">
          <Textarea rows={3} autoComplete="off" spellCheck={false} required maxLength={12000} value={secret} disabled={busy} onChange={event=>setSecret(event.target.value)}/>
        </Field>}
        <Button type="submit" variant="primary" className="min-h-11" disabled={busy||!secret.trim()}>{vault.entries.some(item=>item.slot===slot)?"Replace credential":"Save credential"}</Button>
      </form>}
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
      {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
    </div>
  </Card>;
}

export function WorkspaceBackup(){
  const [file,setFile]=useState<File>(),[preview,setPreview]=useState<Preview>(),[confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const path="/api/workspace/backup";

  async function run(action:"download"|"preview"|"restore"){
    setBusy(true);setError("");setNotice("");
    try{
      await flushCRMChanges();
      if(action==="download"){
        const response=await fetch(path,{cache:"no-store"});
        if(!response.ok)throw new Error((await response.json()).error);
        const url=URL.createObjectURL(await response.blob());
        const link=document.createElement("a");
        link.href=url;link.download="adbibe-workspace-backup.json";link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        return;
      }
      if(!file||file.size>8_009_000)throw new Error("Choose a JSON backup under 8 MB.");
      const backup=JSON.parse(await file.text());
      if(action==="preview"){
        setPreview(undefined);setConfirmation("");
        setPreview(await securityRequest<Preview>(path,{action,backup}));
      }else{
        if(!preview)return;
        await securityRequest(path,{action,backup,confirmation,ticket:preview.ticket});
        setPreview(undefined);setConfirmation("");setNotice("Workspace records restored.");
        try{await refreshCRMChanges();}catch{setError("Restore succeeded. Reload the page to see the restored records.");}
      }
    }catch(error){setError(error instanceof SyntaxError?"The selected file is not valid JSON.":error instanceof Error?error.message:"Backup request failed.");}
    finally{setBusy(false);}
  }

  return <Card>
    <CardHeader title="Backup and restore" subtitle="Export a signed workspace snapshot and preview changes before restoring." action={<Database className="size-5 text-accent-text"/>}/>
    <div className="space-y-4 px-4 pb-4 text-sm text-fg-2">
      <p>Restore covers core CRM records and analytics data. Staff access, credentials, approvals, delivery history, uploaded files and published reports are managed separately. Keep a current export before restoring an older snapshot.</p>
      <Button className="min-h-11" disabled={busy} onClick={()=>void run("download")}>Download workspace backup</Button>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <Field label="Workspace backup file" className="min-w-0 flex-1">
          <Input type="file" accept=".json,application/json" className="min-h-11 min-w-0" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]);setPreview(undefined);setConfirmation("");setNotice("");setError("");}}/>
        </Field>
        <Button className="min-h-11" disabled={busy||!file} onClick={()=>void run("preview")}>Preview restore</Button>
      </div>
      {preview&&<section aria-label="Restore preview" className="space-y-3 rounded-lg border border-border p-3">
        <p className="font-medium text-fg">Backup from {new Date(preview.createdAt).toLocaleString()}</p>
        {preview.counts.length?<><ul className="divide-y divide-border">
          {preview.counts.map(row=><li key={row.label} className="flex flex-wrap justify-between gap-x-4 py-2">
            <span className="font-medium">{row.label}</span><span className="tabular-nums">{row.added} added · {row.updated} updated · {row.removed} removed</span>
          </li>)}
        </ul>
        {(preview.unshared>0||preview.disabledLogins>0||preview.pausedWorkflows>0)&&<ul className="list-disc space-y-1 pl-5">
          {preview.unshared>0&&<li>{preview.unshared} client portal shares will be removed.</li>}
          {preview.disabledLogins>0&&<li>{preview.disabledLogins} client portal logins will be disabled.</li>}
          {preview.pausedWorkflows>0&&<li>{preview.pausedWorkflows} automations will be paused for review.</li>}
        </ul>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();void run("restore");}}>
          <Field label="Type RESTORE to confirm" className="min-w-0 flex-1">
            <Input className="min-h-11" value={confirmation} disabled={busy} onChange={event=>setConfirmation(event.target.value)} autoComplete="off"/>
          </Field>
          <Button type="submit" variant="danger" className="min-h-11" disabled={busy||confirmation!=="RESTORE"}>Apply restore</Button>
          <Button className="min-h-11" disabled={busy} onClick={()=>{setPreview(undefined);setConfirmation("");}}>Cancel</Button>
        </form></>:<p role="status">There are no changes to restore.</p>}
      </section>}
      {busy&&<p role="status">Working…</p>}
      {error&&<p role="alert" className="text-danger">{error}</p>}
      {notice&&<p role="status" className="text-success">{notice}</p>}
    </div>
  </Card>;
}
