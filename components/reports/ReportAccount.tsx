"use client";

import { useEffect, useState } from "react";
import { Cloud, Link2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";

export function ReportAccount({ onLinked }: { onLinked: () => void }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/reports/account", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not check existing uploads.");
      if (live) setCount(result.legacyCount);
    }).catch((err) => { if (live) setError(err instanceof Error ? err.message : "Could not check existing uploads."); });
    return () => { live = false; };
  }, []);
  async function link() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/reports/account", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not link reports.");
      setCount(0); setNotice(`${result.linked} report${result.linked === 1 ? "" : "s"} linked to your account.`); onLinked();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not link reports."); }
    finally { setBusy(false); }
  }
  return <section className="no-print -mt-1 space-y-2">
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3"><Cloud className="size-3.5 shrink-0" aria-hidden="true" /><span>Saved to your account <span className="break-all font-medium text-fg-2">{user?.email}</span> · sign in with it on any laptop to see the same reports.</span></p>
    {count > 0 && <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/30 bg-accent-soft/40 p-3.5">
      <p className="max-w-2xl text-xs leading-5 text-fg-2">{count === 1000 ? "Existing" : count} older upload{count === 1 ? "" : "s"} still belong to this browser. Link {count === 1 ? "it" : "them"} to {user?.email} to see {count === 1 ? "it" : "them"} on your other laptop. Repeat in each browser you used before.</p>
      <Button loading={busy} onClick={link} icon={<Link2 className="size-3.5" aria-hidden="true" />}>Link {count === 1000 ? "existing" : count} report{count === 1 ? "" : "s"}</Button>
    </Card>}
    {notice && <p role="status" className="text-xs text-success">{notice}</p>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </section>;
}
