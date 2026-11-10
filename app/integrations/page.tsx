"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ExternalLink, History, Plug, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, PageHeader, Select, Stat, Tabs } from "@/components/ui";
import { ArchitecturePanel } from "@/components/integrations/ArchitecturePanel";
import { ApiKeysCard } from "@/components/integrations/ApiKeysCard";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { MEDIA_PLATFORMS } from "@/lib/domain/performance";
import type { IntegrationRun, SyncPlatform } from "@/lib/domain/integrationRuns";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { fmtDateTime } from "@/lib/utils";

type Connection = {platform:SyncPlatform;connected:boolean;accountLabel:string;lastSyncAt?:string;connectUrl?:string};
type Status = {configured:boolean;connections:Connection[]};
type Tab = "connectors" | "history" | "api" | "architecture";

async function readJson(response:Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The integration service is unavailable.");
  return result;
}

function IntegrationsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const campaigns = useCRM(state=>state.campaigns);
  const catalog = useCRM(state=>state.integrations);
  const writable = me.role !== "client" && can(me.role,"integrations","write");
  const [status,setStatus] = useState<Status>();
  const [statusError,setStatusError] = useState("");
  const [runs,setRuns] = useState<IntegrationRun[]>([]);
  const [historyError,setHistoryError] = useState("");
  const [checking,setChecking] = useState(false);
  const [campaignId,setCampaignId] = useState("");
  const [platform,setPlatform] = useState<SyncPlatform>("Meta Ads");
  const [days,setDays] = useState("30");
  const [pending,setPending] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const raw = params.get("tab");
  const tab:Tab = raw==="history" || raw==="api" || raw==="architecture" ? raw : "connectors";

  const refresh = useCallback(async(signal?:AbortSignal)=>{
    setChecking(true);
    const [connectionResult,runResult] = await Promise.allSettled([
      fetch("/api/media/platforms",{cache:"no-store",signal}).then(readJson),
      fetch("/api/media/sync",{cache:"no-store",signal}).then(readJson),
    ]);
    if(signal?.aborted)return;
    if(connectionResult.status==="fulfilled"){setStatus(connectionResult.value);setStatusError("");}
    else{setStatus(undefined);setStatusError("Could not verify platform connections.");}
    if(runResult.status==="fulfilled"){setRuns(runResult.value.runs);setHistoryError("");}
    else setHistoryError("Could not load sync history.");
    setChecking(false);
  },[]);
  useEffect(()=>{
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
    void refresh(controller.signal);
    const refreshOnFocus = ()=>void refresh(controller.signal);
    window.addEventListener("focus",refreshOnFocus);
    return ()=>{controller.abort();window.removeEventListener("focus",refreshOnFocus);};
  },[refresh]);

  async function sync(retryId?:string) {
    if(pending)return;
    setPending(retryId ?? "new");
    setMessage("");
    setError("");
    try {
      await flushCRMChanges();
      const response = await fetch("/api/media/sync",{
        method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(90000),
        body:JSON.stringify({operationId:crypto.randomUUID(),...(retryId?{retryId}:{platform,campaignId,days:Number(days)})}),
      });
      const result = await readJson(response);
      setMessage(result.synced+" rows synced.");
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Sync failed.");
    } finally {
      await refresh();
      await refreshCRMChanges().catch(()=>{});
      setPending("");
    }
  }

  const connected = status?.connections.filter(connection=>connection.connected) ?? [];
  const ordered = [...runs].sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  return (
    <div>
      <PageHeader title="Integrations" description="Authorize supported platforms, verify their status, and review or retry campaign syncs." actions={<Button className="min-h-11" loading={checking} onClick={()=>void refresh()} icon={<RefreshCw className="size-4"/>}>Refresh status</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Connected platforms" value={status ? new Set(connected.map(item=>item.platform)).size : "—"} icon={<Plug className="size-4"/>} />
        <Stat label="Successful syncs" value={runs.filter(run=>run.status==="Succeeded").length} tone="success" />
        <Stat label="Failed attempts" value={runs.filter(run=>run.status==="Failed").length} tone="danger" />
      </div>
      <div className="mb-4"><Tabs value={tab} onChange={value=>router.replace(value==="connectors"?"/integrations":"/integrations?tab="+value,{scroll:false})} tabs={[
        {value:"connectors",label:"Connectors"},{value:"history",label:"Sync history",count:runs.length},
        {value:"api",label:"API keys"},{value:"architecture",label:"Architecture"},
      ]}/></div>
      {message&&<p role="status" className="mb-3 text-sm text-success">{message}</p>}
      {error&&<p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      {tab==="connectors"&&<div className="space-y-4">
        {statusError&&<p role="alert" className="text-sm text-danger">{statusError}</p>}
        {status&&!status.configured&&<Card className="p-4 text-sm text-fg-2">Set <code>MEDIA_CONNECTOR_URL</code> and <code>MEDIA_CONNECTOR_TOKEN</code> on the CRM server to enable live platform authorization. You can import metrics from CSV in Performance Marketing.</Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MEDIA_PLATFORMS.map(name=>{
            const connections = status?.connections.filter(item=>item.platform===name) ?? [];
            const active = connections.filter(item=>item.connected);
            const authorize = connections.find(item=>item.connectUrl)?.connectUrl;
            const lastSync = ordered.find(run=>run.platform===name&&run.status==="Succeeded")?.finishedAt;
            const verified = active.map(item=>item.lastSyncAt).filter((at):at is string=>!!at).sort().at(-1);
            const last = [lastSync,verified].filter((at):at is string=>!!at).sort().at(-1);
            return <Card key={name} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{name}</h2><Badge tone={active.length?"success":"neutral"}>{!status?"Unverified":active.length?"Connected":status.configured?"Not authorized":"Setup required"}</Badge></div>
              {active.length>0&&<p className="break-words text-sm text-fg-2">{active.map(item=>item.accountLabel).join(" · ")}</p>}
              <p className="text-xs text-fg-3">Last successful sync {last?fmtDateTime(last):"—"}</p>
              {authorize&&writable&&<Button href={authorize} external className="min-h-11" icon={<ExternalLink className="size-4"/>}>{active.length?"Authorize another account":"Connect platform"}</Button>}
            </Card>;
          })}
        </div>
        {writable&&<Card>
          <CardHeader title="Sync campaign metrics" subtitle="Choose a connected platform and a campaign with a platform account ID." />
          <form className="grid items-end gap-3 p-4 pt-0 md:grid-cols-[1fr_1fr_7rem_auto]" onSubmit={event=>{event.preventDefault();void sync();}}>
            <Field label="Platform"><Select value={platform} onChange={event=>setPlatform(event.target.value as SyncPlatform)}>{MEDIA_PLATFORMS.map(name=><option key={name}>{name}</option>)}</Select></Field>
            <Field label="Campaign"><Select value={campaignId} onChange={event=>setCampaignId(event.target.value)}><option value="">Select a campaign</option>{campaigns.filter(campaign=>campaign.adAccountId).map(campaign=><option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></Field>
            <Field label="Window"><Select value={days} onChange={event=>setDays(event.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="60">60 days</option></Select></Field>
            <Button type="submit" className="min-h-11" variant="primary" loading={pending==="new"} disabled={!campaignId||!connected.some(item=>item.platform===platform)||!!pending}>Sync now</Button>
          </form>
        </Card>}
        <Card>
          <CardHeader title="Other integrations" subtitle="The catalog lists platforms that are managed elsewhere or still require an adapter."/>
          <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.filter(item=>!MEDIA_PLATFORMS.some(name=>name===item.name)&&item.key!=="dv360").map(item=><li key={item.key} className="rounded-lg border border-border p-2 text-sm">{item.name}{item.key==="gsc"&&<Button size="sm" href="/seo" className="ml-2">Open SEO</Button>}</li>)}
          </ul>
        </Card>
      </div>}
      {tab==="history"&&<Card>
        <CardHeader title="Sync history" subtitle="Each attempt keeps its campaign, date window and outcome. Retries use the same date window." />
        {historyError&&<p role="alert" className="px-4 pb-3 text-sm text-danger">{historyError}</p>}
        {!runs.length&&!historyError&&<EmptyState icon={<History className="size-5"/>} title="No sync attempts yet" description="Run a campaign sync to see its result here."/>}
        <ul className="divide-y divide-border">
          {ordered.map(run=><li key={run.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{run.platform} · {run.campaignName}</p>
              <p className="text-xs text-fg-3">{run.start} to {run.end} · Started {fmtDateTime(run.startedAt)}{run.retryOf?" · Retry":""}</p>
              {run.error&&<p className="mt-1 text-sm text-danger">{run.error}</p>}
              {run.rows!==undefined&&<p className="mt-1 text-xs text-fg-3">{run.rows} rows received</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={run.status==="Failed"?"danger":run.status==="Succeeded"?"success":"info"}>{run.status}</Badge>
              {writable&&run.status==="Failed"&&!ordered.some(item=>item.retryOf===run.id&&item.status==="Succeeded")&&<Button size="sm" className="min-h-11" disabled={!!pending} loading={pending===run.id} onClick={()=>void sync(run.id)}>Retry sync</Button>}
            </div>
          </li>)}
        </ul>
      </Card>}
      {tab==="api"&&<ApiKeysCard writable={writable}/>}
      {tab==="architecture"&&<ArchitecturePanel/>}
    </div>
  );
}

export default function IntegrationsPage(){return <Suspense><IntegrationsInner/></Suspense>;}
