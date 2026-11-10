"use client";

import {useEffect,useState} from "react";
import {ShieldCheck} from "lucide-react";
import {Button,Card,CardHeader,Field,Input} from "@/components/ui";

export default function StaffJoin(){
  const [invite,setInvite]=useState<{workspace:string;token:string}>();
  const [password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[email,setEmail]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    const fragment=new URLSearchParams(window.location.hash.slice(1));
    const workspace=fragment.get("workspace"),token=fragment.get("token");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
    if(workspace&&token)setInvite({workspace,token});
    else setError("Open the complete invitation link from your workspace owner.");
  },[]);
  async function accept(){
    if(!invite)return;
    if(password!==confirmation){setError("The passwords do not match.");return;}
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/staff/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...invite,password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      history.replaceState(null,"","/staff/join");
      setInvite(undefined);setPassword("");setConfirmation("");setEmail(data.email);
    }catch(error){setError(error instanceof Error?error.message:"The invitation could not be accepted.");}
    finally{setBusy(false);}
  }
  return <main className="grid min-h-dvh place-items-center p-4">
    <Card className="w-full max-w-lg">
      <CardHeader title="Join your Adbibe workspace" subtitle="Set a password for your individual staff sign-in." action={<ShieldCheck className="size-5 text-accent-text"/>}/>
      <div className="space-y-4 px-4 pb-4">
        {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
        {invite&&<form className="space-y-4" onSubmit={event=>{event.preventDefault();void accept();}}>
          <Field label="Choose a password" hint="Use at least 12 characters."><Input type="password" autoComplete="new-password" className="min-h-11" required minLength={12} maxLength={128} value={password} onChange={event=>setPassword(event.target.value)}/></Field>
          <Field label="Confirm password"><Input type="password" autoComplete="new-password" className="min-h-11" required minLength={12} maxLength={128} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></Field>
          <Button type="submit" className="min-h-11" variant="primary" loading={busy} disabled={busy}>Accept invitation</Button>
        </form>}
        {email&&<><p role="status" className="break-words text-sm">Your staff login is ready. Sign in as {email}.</p><Button href="/login?next=/staff" className="min-h-11" variant="primary">Continue to sign in</Button></>}
      </div>
    </Card>
  </main>;
}
