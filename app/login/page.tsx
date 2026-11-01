"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { safeReturnPath } from "@/lib/auth/redirect";
import { notifyAuthChange } from "@/components/auth/notify";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: mode, email: email.trim(), password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sign in.");
      setPassword("");
      if (result.confirmationRequired) { setNotice("Check your email to confirm your account, then return here to sign in."); setMode("signin"); return; }
      await refresh();
      notifyAuthChange();
      const requested = new URLSearchParams(window.location.search).get("next");
      router.replace(safeReturnPath(requested)); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Please retry."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-dvh lg:grid-cols-2">
    <section className="relative hidden flex-col justify-between overflow-hidden lg:flex bg-[#151e38] px-8 py-10 text-white sm:px-14 lg:p-16">
      <div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-xl bg-white/10"><BarChart3 size={22} aria-hidden="true" /></span>Adbibe OS</div>
      <div className="my-12 max-w-lg lg:my-24"><p className="mb-5 text-xs font-semibold tracking-[.2em] text-indigo-200">ONE ACCOUNT. EVERY DEVICE.</p><h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Your reports.<br /><span className="text-indigo-200">Wherever you work.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-slate-300">Sign in with the same email on both laptops to access your saved reports. Your account keeps your library together.</p><div className="mt-8 flex items-center gap-2 text-xs text-slate-300"><LockKeyhole size={15} aria-hidden="true" /> Protected by Supabase Authentication</div></div>
      <p className="text-xs text-slate-300">Existing uploads can be linked from the browser that uploaded them.</p>
    </section>
    <section className="flex min-h-dvh items-center justify-center px-6 py-12 sm:px-12"><div className="w-full max-w-sm"><div className="mb-10 flex items-center gap-2 text-lg font-semibold lg:hidden"><BarChart3 className="text-accent-text" size={24} aria-hidden="true" />Adbibe OS</div>
      <p className="mb-2 text-xs font-semibold tracking-widest text-accent-text">WELCOME TO YOUR WORKSPACE</p>
      <h2 className="text-3xl font-semibold tracking-tight">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
      <p className="mb-8 mt-3 text-sm leading-6 text-fg-2">{mode === "signin" ? "Use your Supabase account email and password." : "Use an email you can verify. You’ll use this account on both laptops."}</p>
      {notice && <div role="status" className="mb-5 flex gap-2 rounded-xl border border-success/30 bg-success-soft p-4 text-sm leading-6"><CheckCircle2 size={18} className="mt-1 shrink-0 text-success" aria-hidden="true" />{notice}</div>}
      {error && <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm leading-6">{error}</p>}
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5"><label htmlFor="auth-email" className="text-xs font-medium text-fg-2">Email address</label><div className="relative"><Mail size={16} className="pointer-events-none absolute left-3 top-3 text-fg-2" aria-hidden="true" /><Input id="auth-email" aria-label="Email address" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full pl-10" disabled={busy} /></div></div>
        <div className="space-y-1.5"><label htmlFor="auth-password" className="text-xs font-medium text-fg-2">Password</label><div className="relative"><Input id="auth-password" aria-label="Password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full pr-12" disabled={busy} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 grid size-11 place-items-center text-fg-2">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{mode === "signup" && <p className="text-xs text-fg-2">At least 8 characters. Keep your password private.</p>}</div>
        <Button type="submit" variant="primary" className="h-11 w-full" loading={busy}>{mode === "signin" ? "Sign in" : "Create account"}<ArrowRight size={16} aria-hidden="true" /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-2">{mode === "signin" ? "New here?" : "Already have an account?"} <button disabled={busy} className="min-h-11 font-medium text-accent-text hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
    </div></section>
  </main>;
}
