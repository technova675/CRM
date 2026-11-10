"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button, Card, Field, Input } from "@/components/ui";
import { notifyAuthChange } from "@/components/auth/notify";

export default function PortalLogin() {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function signIn(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values=new FormData(event.currentTarget);
    setBusy(true);setError("");
    try {
      const res=await fetch("/api/portal/session",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"signin",email:values.get("email"),password:values.get("password")}),signal:AbortSignal.timeout(25000)});
      if(!res.ok) throw new Error((await res.json()).error??"Sign-in failed.");
      notifyAuthChange();
      window.location.replace("/portal");
    } catch(e) {setError((e as Error).message);setBusy(false);}
  }
  return <main className="grid min-h-dvh place-items-center bg-bg px-5 py-10">
    <Card className="w-full max-w-md p-6 sm:p-8">
      <div className="mb-5 grid size-11 place-items-center rounded-lg bg-accent-soft text-accent-text"><LockKeyhole size={20} aria-hidden="true"/></div>
      <p className="mb-1 text-sm font-medium text-accent-text">Adbibe</p>
      <h1 className="text-2xl font-semibold">Client portal sign-in</h1>
      <p className="mb-6 mt-2 text-sm text-fg-2">Use the client login provided by your account team.</p>
      <form onSubmit={signIn} className="space-y-4">
        <Field label="Email address"><Input name="email" className="min-h-11" type="email" autoComplete="username" required/></Field>
        <Field label="Password"><Input name="password" className="min-h-11" type="password" autoComplete="current-password" required/></Field>
        {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="min-h-11 w-full" variant="primary" loading={busy} disabled={busy}>Sign in to client portal</Button>
      </form>
      <Button href="/login" variant="ghost" className="mt-3 min-h-11">Agency sign-in</Button>
    </Card>
  </main>;
}
