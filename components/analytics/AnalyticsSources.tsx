"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { useCRM } from "@/lib/store";
import { downloadFile } from "@/lib/utils";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { baseMetrics, detailKeys, providers } from "@/lib/domain/analyticsEngine";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";

const template = ["date", ...detailKeys, ...baseMetrics.filter(key => key !== "deals"), "reach"].join(",") + "\n";

export function AnalyticsSources({ writable, showCrm, onOpen }: { writable: boolean; showCrm: boolean; onOpen: (id: string) => void }) {
  const clients = useCRM(s => s.clients);
  const feeds = useCRM(s => s.analyticsFeeds);
  const campaigns = useCRM(s => s.campaigns);
  const seoProjects = useCRM(s => s.seoProjects);
  const [connector, setConnector] = useState(false);
  const [method, setMethod] = useState<"import" | "sync">("import");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analytics", { signal: controller.signal, cache: "no-store" })
      .then(res => res.ok ? res.json() : null)
      .then(result => setConnector(result?.connectorReady === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  const savedClients = new Map(clients.map(client => [client.id, client.company]));
  const paid = new Set(campaigns.flatMap(campaign => (campaign.performanceRows ?? []).map(row => row.platform)));
  const hasGsc = seoProjects.some(project => project.workspace?.gsc?.daily.length);
  const hasSeoImport = seoProjects.some(project => project.workspace?.traffic.length);
  const send = async (body: object, success: (data: { rows?: number; id?: string }) => void) => {
    await flushCRMChanges();
    const response = await fetch("/api/analytics", {
      method: "POST", signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, operationId: crypto.randomUUID() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save analytics.");
    await refreshCRMChanges();
    success(data);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const feed = Object.fromEntries(["clientId", "platform", "account", "report"].map(key => [key, String(form.get(key) ?? "")]));
    try {
      const file = form.get("csv");
      if (method === "import" && (!(file instanceof File) || !file.size || file.size > 600000)) throw new Error("Choose a CSV file of up to 600 KB.");
      const fields = method === "import"
        ? { currency: form.get("currency"), csv: await (file as File).text() }
        : { start: form.get("start"), end: form.get("end") };
      await send({ action: method, feed, ...fields }, result => setMessage("Saved " + result.rows + " measured rows. Open the feed below to explore it."));
    } catch (error) { setError((error as Error).message); } finally { setPending(false); }
  };
  const removeFeed = async (id: string, updatedAt: string) => {
    setPending(true); setError(""); setMessage("");
    try {
      await send({ action: "remove", id, updatedAt }, () => { setRemove(""); setMessage("Source report removed."); });
    } catch (error) { setError((error as Error).message); } finally { setPending(false); }
  };
  return <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader title="Source coverage" subtitle="Coverage reflects records available in this account. Live sync requires a configured connector and authorized source accounts." />
      <ul className="grid gap-px overflow-hidden rounded-b-xl border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
        {[...providers, ...(showCrm ? ["CRM"] : [])].map(platform => {
          const saved = feeds.filter(feed => feed.platform === platform && savedClients.has(feed.clientId));
          const states = [
            platform === "CRM" && "Built in",
            paid.has(platform) && "Performance rows",
            platform === "Search Console" && hasGsc && "Search Console snapshot",
            platform === "Search Console" && hasSeoImport && "SEO traffic import",
            saved.some(feed => feed.method === "Live sync") && "Synced report",
            saved.some(feed => feed.method === "CSV import") && "Imported report",
          ].filter(Boolean);
          return <li key={platform} className="bg-surface px-4 py-3">
            <p className="font-medium">{platform}</p>
            <p className="text-sm text-fg-2">{states.join(" · ") || "No reports saved"}</p>
          </li>;
        })}
      </ul>
    </Card>
    {writable && <Card>
      <CardHeader title="Add a source report" subtitle="Use a normalized CSV or sync a mapped report from an authorized account." />
      {clients.length ? <form className="space-y-4 p-4" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ingest method"><Select className="min-h-11" value={method} onChange={event => setMethod(event.target.value === "sync" ? "sync" : "import")}>
            <option value="import">CSV import</option><option value="sync" disabled={!connector}>Live sync {connector ? "" : "(setup required)"}</option>
          </Select></Field>
          <Field label="Source platform"><Select className="min-h-11" name="platform">{providers.map(item => <option key={item}>{item}</option>)}</Select></Field>
          <Field label="Report client"><Select className="min-h-11" name="clientId" required defaultValue=""><option value="" disabled>Select a client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.company}</option>)}</Select></Field>
          <Field label="Source account or property"><Input className="min-h-11" name="account" maxLength={180} required /></Field>
          <Field label="Report name"><Input className="min-h-11" name="report" maxLength={180} required /></Field>
          {method === "import" ? <>
            <Field label="Currency code" hint="Use the report currency, such as INR or USD."><Input className="min-h-11" name="currency" required pattern="[A-Z]{3}" maxLength={3} /></Field>
            <Field label="CSV file" className="sm:col-span-2"><Input className="min-h-11 pt-2" type="file" name="csv" accept=".csv,text/csv" required /></Field>
          </> : <>
            <Field label="Sync from"><Input className="min-h-11" name="start" type="date" required /></Field>
            <Field label="Sync to"><Input className="min-h-11" name="end" type="date" required /></Field>
          </>}
        </div>
        <p className="text-sm text-fg-2">Use one row per date and dimension combination. Reusing the same client, source, account and report name replaces all existing rows for the dates provided. Leave unreported metrics and unused dimensions blank.</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="primary" type="submit" disabled={pending} loading={pending}>{method === "import" ? "Import CSV report" : "Sync live report"}</Button>
          {method === "import" && <Button className="min-h-11" type="button" icon={<Download size={16} />} onClick={() => downloadFile("analytics-template.csv", template, "text/csv")}>Download CSV template</Button>}
        </div>
      </form> : <p className="p-4 text-sm text-fg-2">Create a client in Client Management before adding source reports.</p>}
    </Card>}
    {error && <p role="alert" className="rounded-lg border border-danger/40 bg-surface p-3 text-sm text-danger">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">{message}</p>}
    <Card>
      <CardHeader title="Saved source reports" subtitle="Each report keeps its source, currency and last import or sync date." />
      {feeds.length ? <ul className="divide-y divide-border">
        {feeds.map(feed => <li key={feed.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="break-words font-medium">{feed.report}</p>
            <p className="break-words text-sm text-fg-2">{feed.platform} · {savedClients.get(feed.clientId) ?? "Removed client"} · {feed.account} · {feed.method}</p>
            <p className="text-xs text-fg-2">{feed.rows.length.toLocaleString()} rows · {feed.currency} · Updated {feed.updatedAt.slice(0, 10)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedClients.has(feed.clientId) && <Button className="min-h-11" onClick={() => onOpen(feed.id)}>Explore report</Button>}
            {writable && (remove === feed.id ? <>
              <Button className="min-h-11" onClick={() => setRemove("")}>Keep report</Button>
              <Button className="min-h-11" variant="danger" disabled={pending} onClick={() => void removeFeed(feed.id, feed.updatedAt)}>Confirm remove</Button>
            </> : <Button className="min-h-11" variant="ghost" onClick={() => setRemove(feed.id)}>Remove report</Button>)}
          </div>
        </li>)}
      </ul> : <p className="p-4 text-sm text-fg-2">Source reports you import or sync will appear here.</p>}
    </Card>
  </div>;
}
