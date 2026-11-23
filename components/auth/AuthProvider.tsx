"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { CRMCloudProvider } from "@/components/sales/CRMCloudProvider";
import { flushCRMChanges } from "@/lib/crmSync";
import { notifyAuthChange } from "./notify";
import { Heartbeat } from "./Heartbeat";

type Account = { id: string; email: string; kind: "agency" | "staff" };
const AuthContext = createContext<{ user: Account | null; refresh: () => Promise<Account | null>; signOut: () => Promise<void> } | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const joinPage=path==="/staff/join";
  const staffPage=path==="/staff";
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) { setUser(null); setError(""); return null; }
    if (!response.ok) throw new Error(result.error ?? "Could not verify your session.");
    setUser(result.user);
    setError("");
    return result.user as Account;
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(refresh).catch((err) => { if (live) setError(err instanceof Error ? err.message : "Could not verify your session."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refresh]);
  useEffect(() => {
    const check = () => { void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not verify your session.")); };
    const changed = (event: StorageEvent) => { if (event.key === "adbibe-auth-event") check(); };
    window.addEventListener("focus", check);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener("focus", check); window.removeEventListener("storage", changed); };
  }, [refresh]);
  useEffect(() => {
    if (!loading && !user && !error && path !== "/login" && !joinPage) router.replace(`/login?next=${encodeURIComponent(path)}`);
    if(user?.kind==="staff"&&!staffPage&&!joinPage&&path!=="/login")router.replace("/staff");
  }, [loading, user, error, path, joinPage, staffPage, router]);
  const signOut = useCallback(async () => {
    await flushCRMChanges();
    const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signout" }) });
    if (!response.ok) throw new Error("Could not sign out. Please retry.");
    // Changes were saved to the account above, so the browser copies are no longer needed.
    // Removing them keeps the next person on a shared computer from reading this workspace.
    try { for (const key of Object.keys(localStorage)) if (key.startsWith("adbibe-") && user && key.endsWith(":" + user.id)) localStorage.removeItem(key); } catch { /* Storage can be blocked. */ }
    setUser(null);
    notifyAuthChange();
    // A full page load discards every in-memory store, so the next account starts clean.
    window.location.replace("/login");
  }, [user]);
  return <AuthContext.Provider value={{ user, refresh, signOut }}>
    {user && <Heartbeat path={path} />}
    {joinPage || path === "/login" || path === "/reset-password" ? children : error ? <div className="grid min-h-dvh place-items-center p-6"><div className="max-w-md space-y-4 rounded-2xl border border-border bg-surface p-8"><p role="alert">{error}</p><button className="rounded-lg bg-fg px-4 py-2 text-bg" onClick={() => window.location.reload()}>Retry connection</button></div></div> : loading || !user ? <div role="status" className="grid min-h-dvh place-items-center text-sm text-fg-2"><div className="flex items-center gap-2.5"><Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />Verifying your account…</div></div> : user.kind === "staff" ? (staffPage?children:null) : <CRMCloudProvider key={user.id} account={user}><AppShell>{children}</AppShell></CRMCloudProvider>}
  </AuthContext.Provider>;
}
