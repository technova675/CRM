"use client";

import { useNow } from "@/components/useNow";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { flushCRMChanges, refreshCRMChanges } from "@/lib/crmSync";
import { useCRM } from "@/lib/store";
import { investigationSources } from "@/lib/domain/analyticsInvestigation";
import { cadence, reportSections, scheduledPeriod, reportWindow, type ClientReport, type ClientReportSchedule } from "@/lib/domain/clientReporting";

type Report = ClientReport & {email:{to:string[];subject:string;body:string}};
type State = {reports:Report[];schedules:ClientReportSchedule[];delivery:boolean;worker:boolean;writable:boolean};
const endpoint = "/api/reports/client";
const reportTime = (date: string) => new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(date)) + " IST";

export function ClientReporting() {
  const now = useNow();  const clients = useCRM(s=>s.clients);
  const campaigns = useCRM(s=>s.campaigns);
  const seoProjects = useCRM(s=>s.seoProjects);
  const analyticsFeeds = useCRM(s=>s.analyticsFeeds);
  const [state,setState] = useState<State>();
  const [client,setClient] = useState("");
  const [feed,setFeed] = useState("");
  const [frequency,setFrequency] = useState<"Weekly"|"Monthly">("Weekly");
  const [date,setDate] = useState("");
  const [mode,setMode] = useState<"draft"|"schedule">("draft");
  const [selected,setSelected] = useState("");
  const [pending,setPending] = useState("");
  const [confirm,setConfirm] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const active = clients.find(c=>c.id===client) ?? clients[0];
  const sources = active ? investigationSources({clients,campaigns,seoProjects,analyticsFeeds},active.id) : [];
  const source = sources.some(item=>item.id===feed) ? feed : sources[0]?.id ?? "";
  const report = state?.reports.find(r=>r.id===selected) ?? state?.reports[0];
  const refresh = useCallback(async () => {
    const res = await fetch(endpoint,{cache:"no-store",signal:AbortSignal.timeout(25000)});
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Could not load reports.");
    setState(result);
  },[]);
  useEffect(() => {
    let live=true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after an async fetch, not synchronously in the effect
    void refresh().catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[refresh]);

  const perform = async (body: Record<string,unknown>, success: string) => {
    setPending(String(body.action)); setError(""); setNotice("");
    try {
      await flushCRMChanges();
      const res = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),signal:AbortSignal.timeout(95000)});
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "The report could not be updated.");
      if (result.id) setSelected(result.id);
      setConfirm("");
      await refreshCRMChanges();
      await refresh();
      setNotice(body.action==="runDue"&&!result.id ? "No draft was generated. Check the schedule's next run and any data issues below." : success);
    } catch(e) {setError((e as Error).message);}
    finally {setPending("");}
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active) return;
    const form = new FormData(event.currentTarget);
    const config = {clientId:active.id,source,frequency,recipients:form.getAll("recipient").map(String)};
    if (mode==="schedule") {
      const due = new Date(String(form.get("due")) + ":00+05:30");
      if (!Number.isFinite(+due) || !config.recipients.length) {setError("Choose an IST delivery time and at least one saved contact.");return;}
      void perform({action:"schedule",id:crypto.randomUUID(),config,due:due.toISOString()},"Delivery schedule saved. Each report will need approval.");
    } else {
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
      void perform({action:"generate",id:crypto.randomUUID(),selection:{...config,date:date||scheduledPeriod(new Date().toISOString(),frequency)},ai:submitter?.value==="ai"},"Draft saved. Review the report before approving it.");
    }
  };
  const preview = reportWindow(date||scheduledPeriod(new Date().toISOString(),frequency),frequency);

  const download = async (id:string, format:string) => {
    setError("");
    try {
      const res=await fetch(endpoint+"?id="+encodeURIComponent(id)+"&format="+format,{signal:AbortSignal.timeout(25000)});
      if (!res.ok) throw new Error((await res.json()).error ?? "Export failed.");
      const url=URL.createObjectURL(await res.blob()),link=document.createElement("a");
      link.href=url;link.download=(res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "report."+format);
      link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) {setError((e as Error).message);}
  };

  return <div className="min-w-0 space-y-4">
    <PageHeader title="AI Client Reporting" icon={<FileText className="size-5 text-accent-text" />} description="Create weekly and monthly client reports from measured Analytics Engine feeds."
      actions={<Button className="min-h-11" href="/reports">Uploaded reports</Button>} />
    {!active && <Card className="space-y-3 p-4"><p>Create a client before generating a report.</p><Button href="/clients">Open Client Management</Button></Card>}
    {active && state?.writable && <Card>
      <CardHeader title={mode==="draft"?"Create a client report":"Schedule client reporting"} subtitle="Choose one feed, the reporting period and the client contacts." />
      <form className="space-y-4 p-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Report client"><Select className="min-h-11" value={active.id} onChange={e=>{setClient(e.target.value);setFeed("");}}>
            {clients.map(item=><option key={item.id} value={item.id}>{item.company}</option>)}
          </Select></Field>
          <Field label="Analytics feed"><Select className="min-h-11" value={source} onChange={e=>setFeed(e.target.value)}>
            {sources.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </Select></Field>
          <Field label="Frequency"><Select className="min-h-11" value={frequency} onChange={e=>setFrequency(e.target.value as typeof frequency)}>
            {cadence.map(item=><option key={item}>{item}</option>)}
          </Select></Field>
          {mode==="draft"?<Field label="Date in reporting period" hint="Defaults to the last completed period."><Input className="min-h-11" type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
            :<Field label="First delivery time (IST)" hint="Uses the prior completed week or month."><Input className="min-h-11" name="due" type="datetime-local" required /></Field>}
        </div>
        {mode==="draft" && <p className="text-sm text-fg-2">Reporting period {preview.start} to {preview.end}</p>}
        <fieldset key={active.id} className="space-y-2">
          <legend className="text-sm font-medium">PDF recipients</legend>
          <div className="flex flex-wrap gap-2">
            {[...new Set(active.contacts.map(c=>c.email?.trim().toLowerCase()).filter(Boolean))].map(email=>
              <label key={email} className="flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-border px-3 text-sm">
                <input type="checkbox" name="recipient" value={email} /><span className="break-all">{email}</span>
              </label>)}
          </div>
          {!active.contacts.some(c=>c.email) && <p className="text-sm text-fg-2">Add an email to the client&apos;s contacts to enable delivery.</p>}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          {mode==="draft" ? <>
            <Button className="min-h-11" type="submit" value="ai" variant="primary" icon={<Sparkles size={16}/>} disabled={!source||!!pending}>Generate AI draft</Button>
            <Button className="min-h-11" type="submit" value="measured" disabled={!source||!!pending}>Generate measured draft</Button>
            <Button className="min-h-11" type="button" onClick={()=>setMode("schedule")}>Set up scheduled delivery</Button>
          </> : <>
            <Button className="min-h-11" type="submit" variant="primary" disabled={!source||!!pending}>Save schedule</Button>
            <Button className="min-h-11" type="button" onClick={()=>setMode("draft")}>Back to draft</Button>
          </>}
        </div>
      </form>
    </Card>}
    {pending && <p role="status" className="text-sm text-fg-2">{pending==="generate"?"Preparing your report…":"Updating reports…"}</p>}
    {error && <p role="alert" className="rounded-lg border border-border bg-surface p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm">{notice}</p>}
    <Card>
      <CardHeader title="Report library" subtitle="Review saved report snapshots, export them and approve PDFs for delivery." />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2"><Badge tone={state?.delivery?"success":"neutral"}>{state?.delivery?"Email adapter configured":"Email delivery setup required"}</Badge>
          <Badge tone={state?.worker?"success":"neutral"}>{state?.worker?"Scheduling worker configured":"Background scheduling setup required"}</Badge></div>
        {state?.reports.length ? <Field label="Saved report"><Select className="min-h-11" value={report?.id} onChange={e=>{setSelected(e.target.value);setConfirm("");}}>
          {state.reports.map(r=><option key={r.id} value={r.id}>{r.facts.company} · {r.frequency} · {r.facts.window.end} · {r.status}</option>)}
        </Select></Field> : <p className="text-sm text-fg-2">{state?"No generated reports yet.":"Loading report library…"}</p>}
        {report && <>
          <div className="flex flex-wrap gap-2">
            {(["pdf","pptx","xlsx"] as const).map((format,i)=><Button key={format} className="min-h-11" onClick={()=>void download(report.id,format)}>Export {["PDF","PowerPoint","Excel"][i]}</Button>)}
            {state?.writable && report.status==="Draft" && <Button className="min-h-11" variant="primary" disabled={!!pending} onClick={()=>setConfirm("approve")}>Review approval</Button>}
            {state?.writable && report.status==="Draft" && <Button className="min-h-11" variant="ghost" disabled={!!pending} onClick={()=>setConfirm("delete")}>Remove draft</Button>}
            {state?.writable && report.status==="Approved" && <>
              <Button className="min-h-11" disabled={!!pending} onClick={()=>void perform({action:"revoke",id:report.id},"Approval revoked.")}>Revoke approval</Button>
              <Button className="min-h-11" variant="primary" disabled={!!pending||!state.delivery||!report.recipients.length||!!report.due&&Date.parse(report.due)>now} onClick={()=>setConfirm("send")}>Send approved PDF</Button>
            </>}
          </div>
          {confirm && <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p className="font-semibold">{confirm==="approve"?"Approve this report and its recipient list":confirm==="send"?"Send this approved report now":"Remove this draft?"}</p>
            {confirm!=="delete" && <>
              <p className="break-words">To {report.email.to.join(", ")||"No recipients selected"}</p>
              <p>Subject {report.email.subject}</p>
              <p className="whitespace-pre-line">{report.email.body}</p>
              {report.due && <p>Scheduled for {reportTime(report.due)}. Approval allows the worker to send this PDF when due.</p>}
            </>}
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={!!pending} variant={confirm==="delete"?"danger":"primary"} onClick={()=>void perform({action:confirm,id:report.id},confirm==="approve"?"Report approved.":confirm==="send"?"Delivery attempted. Check the report status.":"Draft removed.")}>Confirm {confirm}</Button>
              <Button className="min-h-11" onClick={()=>setConfirm("")}>Cancel</Button>
            </div>
          </div>}
          {report.due && <p className="text-sm text-fg-2">Scheduled delivery {reportTime(report.due)}</p>}
          {report.receipt && <p className="break-all text-sm text-fg-2">Accepted by provider · {report.receipt}</p>}
          {report.status==="Delivery unknown" && <p role="status" className="text-sm text-fg-2">Check the email provider for acceptance. This delivery is locked against retry.</p>}
        </>}
      </div>
    </Card>
    {!!state?.schedules.length && <Card>
      <CardHeader title="Delivery schedules" subtitle="The worker prepares each completed period for review. An approved PDF can send at its scheduled time." />
      <div className="space-y-3 p-4">
        {state.writable && <Button className="min-h-11" disabled={!!pending} onClick={()=>void perform({action:"runDue"},"Due draft generated for review.")}>Check for due drafts</Button>}
        <ul className="divide-y divide-border">
          {state.schedules.map(s=><li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div className="min-w-0 break-words"><p className="font-medium">{clients.find(c=>c.id===s.config.clientId)?.company??"Removed client"} · {s.config.frequency} · {s.enabled?"Enabled":"Paused"}</p>
              <p className="text-fg-2">Next {reportTime(s.due)} · {s.config.recipients.join(", ")}</p>
              {s.error&&<p className="text-danger">{s.error}</p>}</div>
            {state.writable&&<Button className="min-h-11" disabled={!!pending} onClick={()=>void perform({action:"toggle",id:s.id,enabled:!s.enabled},s.enabled?"Schedule paused.":"Schedule resumed.")}>{s.enabled?"Pause":"Resume"}</Button>}
          </li>)}
        </ul>
      </div>
    </Card>}
    {report && <div className="space-y-3">
      <Card className="p-4">
        <h2 className="break-words text-lg font-semibold">{report.facts.company} · {report.frequency} report</h2>
        <p className="text-sm text-fg-2">{report.facts.window.start} to {report.facts.window.end} · {report.status}</p>
        {report.model&&<p className="text-xs text-fg-2">Draft narrative generated by {report.model}</p>}
      </Card>
      {reportSections(report).map(section=><Card key={section.title}>
        <CardHeader title={section.title}/>
        <div className="overflow-x-auto px-4 pb-4">
          {["Goals","Metrics","Campaign performance","Creative performance","What changed"].includes(section.title)&&section.rows[0].length>1 ?
            <table className="w-full text-left text-sm"><thead><tr>{section.rows[0].map((cell,i)=><th scope="col" className="border-b border-border p-2" key={i}>{cell}</th>)}</tr></thead>
              <tbody>{section.rows.slice(1).map((row,i)=><tr key={i}>{row.length===1?<td colSpan={section.rows[0].length} className="p-2 text-fg-2">{row[0]}</td>:row.map((cell,j)=><td className="min-w-20 border-b border-border p-2" key={j}>{cell}</td>)}</tr>)}</tbody></table>
            :<ul className="space-y-2 text-sm text-fg-2">{section.rows.map((row,i)=><li className="break-words" key={i}>{row.join(" · ")}</li>)}</ul>}
        </div>
      </Card>)}
    </div>}
  </div>;
}
