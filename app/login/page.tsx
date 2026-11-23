"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { safeReturnPath } from "@/lib/auth/redirect";
import { notifyAuthChange } from "@/components/auth/notify";

type Mode = "signin" | "signup" | "reset";
const COPY: Record<Mode, { title: string; sub: string; submit: string }> = {
  signin: { title: "Sign in", sub: "Welcome back. Sign in with your work email.", submit: "Sign in" },
  signup: { title: "Create your account", sub: "Start your agency workspace. Use an email you can open, so you can confirm it.", submit: "Create account" },
  reset: { title: "Reset your password", sub: "Enter your account email and we'll send you a link to choose a new password.", submit: "Send reset link" },
};

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Messages for people arriving from an email link that did not work.
  const linkError = params.get("reset") === "expired" ? "That reset link has expired or was already used. Request a new one below." : params.get("confirmation") === "retry" ? "That confirmation link has expired or was already used. Sign in, or create the account again to get a new link." : "";
  const { user, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get("reset") === "expired" ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError);
  const [notice, setNotice] = useState("");

  // Someone already signed in has no reason to see this form.
  useEffect(() => {
    if (!user) return;
    router.replace(user.kind === "staff" ? "/staff" : safeReturnPath(new URLSearchParams(window.location.search).get("next")));
  }, [user, router]);

  const switchMode = (next: Mode) => { setMode(next); setError(""); setNotice(""); setPassword(""); };

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const body = mode === "reset" ? { action: "reset", email: email.trim() } : { action: mode, email: email.trim(), password };
      const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Something went wrong. Please try again.");
      if (mode === "reset") { setNotice(`If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox and spam folder.`); setMode("signin"); return; }
      setPassword("");
      if (result.confirmationRequired) { setNotice("Check your email to confirm your account, then come back here to sign in."); setMode("signin"); return; }
      const account = await refresh();
      notifyAuthChange();
      const requested = new URLSearchParams(window.location.search).get("next");
      router.replace(account?.kind === "staff" ? "/staff" : safeReturnPath(requested)); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Check your internet connection and retry."); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "google", next: new URLSearchParams(window.location.search).get("next") ?? undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Google sign-in could not start."); setBusy(false); }
  }
  const copy = COPY[mode];
  return <main className="grid min-h-dvh lg:grid-cols-2">
    <section className="relative hidden flex-col justify-between overflow-hidden lg:flex bg-[#151e38] px-8 py-10 text-white sm:px-14 lg:p-16">
      <div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-xl bg-white/10"><BarChart3 size={22} aria-hidden="true" /></span>Adbibe OS</div>
      <div className="my-12 max-w-lg lg:my-24"><p className="mb-5 text-xs font-semibold tracking-[.2em] text-indigo-200">FOR MARKETING AGENCIES</p><h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Leads to clients.<br /><span className="text-indigo-200">Campaigns to reports.</span></h1><p className="mt-6 max-w-md text-sm leading-7 text-slate-300">Your pipeline, clients, campaigns and client reports in one workspace, with AI that works from your real data. Everything is saved to your account, on every device.</p><div className="mt-8 flex items-center gap-2 text-xs text-slate-300"><LockKeyhole size={15} aria-hidden="true" /> Each workspace is private to its own team</div></div>
      <p className="text-xs text-slate-300">© Adbibe OS</p>
    </section>
    <section className="flex min-h-dvh items-center justify-center px-6 py-12 sm:px-12"><div className="w-full max-w-sm"><div className="mb-10 flex items-center gap-2 text-lg font-semibold lg:hidden"><BarChart3 className="text-accent-text" size={24} aria-hidden="true" />Adbibe OS</div>
      <h2 className="text-3xl font-semibold tracking-tight">{copy.title}</h2>
      <p className="mb-8 mt-3 text-sm leading-6 text-fg-2">{copy.sub}</p>
      {notice && <div role="status" className="mb-5 flex gap-2 rounded-xl border border-success/30 bg-success-soft p-4 text-sm leading-6"><CheckCircle2 size={18} className="mt-1 shrink-0 text-success" aria-hidden="true" />{notice}</div>}
      {error && <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm leading-6">{error}</p>}
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5"><label htmlFor="auth-email" className="text-xs font-medium text-fg-2">Email address</label><div className="relative"><Mail size={16} className="pointer-events-none absolute left-3 top-3 text-fg-2" aria-hidden="true" /><Input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full pl-10" disabled={busy} /></div></div>
        {mode !== "reset" && <div className="space-y-1.5"><div className="flex items-center justify-between"><label htmlFor="auth-password" className="text-xs font-medium text-fg-2">Password</label>{mode === "signin" && <button type="button" disabled={busy} onClick={() => switchMode("reset")} className="text-xs font-medium text-accent-text hover:underline">Forgot password?</button>}</div><div className="relative"><Input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full pr-12" disabled={busy} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 grid size-11 place-items-center text-fg-2">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{mode === "signup" && <p className="text-xs text-fg-2">At least 8 characters.</p>}</div>}
        <Button type="submit" variant="primary" className="h-11 w-full" loading={busy}>{copy.submit}<ArrowRight size={16} aria-hidden="true" /></Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-2">{mode === "signin" ? "New here?" : mode === "signup" ? "Already have an account?" : "Remembered it?"} <button disabled={busy} className="min-h-11 font-medium text-accent-text hover:underline" onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Back to sign in"}</button></p>
      {mode !== "reset" && process.env.NEXT_PUBLIC_GOOGLE_OAUTH === "true" && <Button className="mt-3 min-h-11 w-full" disabled={busy} onClick={() => void google()}>Continue with Google</Button>}
    </div></section>
  </main>;
}
