"use client";

import { useNow } from "@/components/useNow";
import {useCallback,useEffect,useState} from "react";
import {Copy,UserPlus} from "lucide-react";
import {Badge,Button,Card,CardHeader,Field,Input,Select} from "@/components/ui";
import {STAFF_ROLES} from "@/lib/domain/staffRoles";
import {ROLE_LABEL} from "@/lib/permissions";
import {flushCRMChanges,refreshCRMChanges} from "@/lib/crmSync";
import type {Role} from "@/lib/types";

type Member={id:string;name:string;email:string;role:Role;status:string;expiresAt?:string};
export function StaffAccess(){
  const now=useNow();  const [members,setMembers]=useState<Member[]>([]);
  const [name,setName]=useState(""),[email,setEmail]=useState(""),[role,setRole]=useState<(typeof STAFF_ROLES)[number]>("sales");
  const [link,setLink]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const response=await fetch("/api/staff/manage",{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error);
    setMembers(data.members);
  },[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
  useEffect(()=>{void load().catch(error=>setError(error.message));},[load]);
  async function run(action:unknown){
    setBusy(true);setError("");setNotice("");setLink("");
    try{
      await flushCRMChanges();
      const response=await fetch("/api/staff/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      if(data.path)setLink(new URL(data.path,window.location.origin).href);
      await refreshCRMChanges();
      await load();
      setNotice(data.path?"Invitation ready to share.":"Staff access updated.");
    }catch(error){setError(error instanceof Error?error.message:"Staff access could not be updated.");}
    finally{setBusy(false);}
  }
  return <div className="space-y-4">
    <Card>
      <CardHeader title="Invite a teammate" subtitle="Create a single-use invitation that expires in 48 hours. Share it privately with the intended teammate."/>
      <form className="grid items-end gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={event=>{event.preventDefault();void run({action:"invite",name,email,role});}}>
        <Field label="Teammate name"><Input className="min-h-11" value={name} maxLength={100} required onChange={event=>setName(event.target.value)}/></Field>
        <Field label="Work email"><Input className="min-h-11" type="email" value={email} maxLength={254} required onChange={event=>setEmail(event.target.value)}/></Field>
        <Field label="Staff role"><Select className="min-h-11" value={role} onChange={event=>setRole(event.target.value as typeof role)}>{STAFF_ROLES.map(item=><option key={item} value={item}>{ROLE_LABEL[item]}</option>)}</Select></Field>
        <Button type="submit" variant="primary" className="min-h-11" loading={busy} disabled={busy} icon={<UserPlus className="size-4"/>}>Create invitation</Button>
      </form>
      {link&&<div className="mx-4 mb-4 space-y-2 rounded-xl border border-border bg-surface-2 p-3">
        <Field label="Private invitation link"><Input className="min-h-11" value={link} readOnly onFocus={event=>event.target.select()}/></Field>
        <Button className="min-h-11" icon={<Copy className="size-4"/>} onClick={()=>void navigator.clipboard.writeText(link).then(()=>setNotice("Invitation link copied.")).catch(()=>setNotice("Select and copy the invitation link."))}>Copy invitation</Button>
      </div>}
    </Card>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
    <Card>
      <CardHeader title="Staff sign-ins" subtitle="Role changes and access revocation take effect on the next staff request."/>
      {!members.length&&<p className="px-4 pb-4 text-sm text-fg-3">No invitations or linked staff logins yet.</p>}
      <ul className="divide-y divide-border">
        {members.map(member=><li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><p className="font-medium">{member.name}</p><p className="break-all text-xs text-fg-3">{member.email}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={member.status==="active"?"success":"neutral"}>{member.status==="active"?"Active":member.status==="disabled"?"Access revoked":member.expiresAt&&Date.parse(member.expiresAt)<now?"Invite expired":"Invited"}</Badge>
            <Select aria-label={"Role for "+member.name} className="min-h-11" value={member.role} disabled={busy} onChange={event=>void run({action:"role",id:member.id,role:event.target.value})}>{STAFF_ROLES.map(role=><option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</Select>
            <Button className="min-h-11" disabled={busy} onClick={()=>void run({action:member.status==="disabled"?"restore":"revoke",id:member.id})}>{member.status==="disabled"?"Restore access":member.status==="invited"?"Cancel invitation":"Revoke access"}</Button>
          </div>
        </li>)}
      </ul>
    </Card>
  </div>;
}
