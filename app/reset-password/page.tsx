"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, CheckCircle2 } from "lucide-react";
import { Button, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update-password", password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update the password.");
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Please retry."); }
    finally { setBusy(false); }
  }

  return <main className="flex min-h-dvh items-center justify-center px-6 py-12"><div className="w-full max-w-sm">
    <div className="mb-10 flex items-center gap-2 text-lg font-semibold"><BarChart3 className="text-accent-text" size={24} aria-hidden="true" />Adbibe OS</div>
    {done ? <>
      <h1 className="text-3xl font-semibold tracking-tight">Password updated</h1>
      <div role="status" className="my-6 flex gap-2 rounded-xl border border-success/30 bg-success-soft p-4 text-sm leading-6"><CheckCircle2 size={18} className="mt-1 shrink-0 text-success" aria-hidden="true" />Your new password is saved. You&apos;re signed in.</div>
      <Button variant="primary" className="h-11 w-full" onClick={() => router.replace("/dashboard")}>Go to my workspace</Button>
    </> : <>
      <h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-8 mt-3 text-sm leading-6 text-fg-2">Use at least 8 characters. You&apos;ll use it to sign in from now on.</p>
      {error && <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm leading-6">{error}</p>}
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5"><label htmlFor="new-password" className="text-xs font-medium text-fg-2">New password</label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full" disabled={busy} /></div>
        <div className="space-y-1.5"><label htmlFor="confirm-password" className="text-xs font-medium text-fg-2">Confirm new password</label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 w-full" disabled={busy} /></div>
        <Button type="submit" variant="primary" className="h-11 w-full" loading={busy}>Save new password</Button>
      </form>
    </>}
  </div></main>;
}
