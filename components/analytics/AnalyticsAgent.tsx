"use client";

import { useState, type FormEvent } from "react";
import { ClipboardList, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { useCRM } from "@/lib/store";
import { metrics, type Metric } from "@/lib/domain/analyticsEngine";
import { investigationSources, type AnalyticsNarrative, type Brief, type Evidence, type InvestigationInput } from "@/lib/domain/analyticsInvestigation";

type Result = { brief: NonNullable<Brief>; narrative?: AnalyticsNarrative; provider?: string; note?: string };
const money = new Set(["spend", "revenue", "cpc", "cpm", "cpl", "cpa"]);
function format(value: number | null | undefined, metric?: Metric, currency?: string) {
  if (value == null) return "—";
  if (currency && metric && money.has(metric)) return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  const suffix = metric === "ctr" || metric === "cvr" ? "%" : metric === "roas" ? "×" : "";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value) + suffix;
}
const delta = (value: number) => (value > 0 ? "+" : "") + format(value) + "%";

export function AnalyticsAgent({ clientId, initialFeed, writable, onSources }: { clientId: string; initialFeed?: string; writable: boolean; onSources: () => void }) {
  const clients = useCRM(s => s.clients);
  const campaigns = useCRM(s => s.campaigns);
  const seoProjects = useCRM(s => s.seoProjects);
  const analyticsFeeds = useCRM(s => s.analyticsFeeds);
  const aiEnabled = useCRM(s => s.aiEnabled);
  const options = investigationSources({ clients, campaigns, seoProjects, analyticsFeeds }, clientId);
  const [picked, setPicked] = useState(initialFeed ?? "");
  const source = options.find(option => option.id === picked)?.id ?? options[0]?.id ?? "";
  const [metric, setMetric] = useState<Metric>("cpa");
  const [days, setDays] = useState<InvestigationInput["days"]>(7);
  const [end, setEnd] = useState("");
  const [pending, setPending] = useState<"evidence" | "ai" | "">("");
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const clear = () => { setResult(undefined); setError(""); };
  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const explain = writable && aiEnabled === true && submitter?.value === "ai";
    setPending(explain ? "ai" : "evidence");
    setError("");
    try {
      const input: InvestigationInput = { source, clientId, metric, days, end, explain };
      const response = await fetch("/api/analytics/investigate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(85000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not complete the investigation.");
      setResult(data as Result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not complete the investigation.");
    } finally { setPending(""); }
  };
  return <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader title="Investigate a metric" subtitle="Compare two equal, consecutive date windows from one measured feed." />
      <form className="space-y-4 p-4" onSubmit={run}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Investigation feed"><Select className="min-h-11" value={source} disabled={!!pending} onChange={event => { setPicked(event.target.value); clear(); }}>
            {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Select></Field>
          <Field label="Metric to investigate"><Select className="min-h-11" value={metric} disabled={!!pending} onChange={event => { setMetric(event.target.value as Metric); clear(); }}>
            {Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select></Field>
          <Field label="Days per window"><Select className="min-h-11" value={days} disabled={!!pending} onChange={event => { setDays(Number(event.target.value) as InvestigationInput["days"]); clear(); }}>
            {[1, 7, 14, 30].map(day => <option key={day} value={day}>{day} {day === 1 ? "day" : "days"}</option>)}
          </Select></Field>
          <Field label="Current window end" hint="Defaults to the last date in the selected feed."><Input type="date" className="min-h-11 min-w-0" value={end} disabled={!!pending} onChange={event => { setEnd(event.target.value); clear(); }} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {writable && aiEnabled && <Button type="submit" value="ai" variant="primary" className="min-h-11" disabled={!source || !!pending} loading={pending === "ai"} icon={<Sparkles size={16} />}>Run AI investigation</Button>}
          <Button type="submit" value="evidence" className="min-h-11" disabled={!source || !!pending} loading={pending === "evidence"} icon={<ClipboardList size={16} />}>Review measured evidence</Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onSources}>Data sources</Button>
        </div>
        {writable && aiEnabled === false && <p className="text-sm text-fg-2">The AI provider is unavailable. You can still review measured evidence.</p>}
        {!!pending && <p role="status" className="text-sm text-fg-2">{pending === "ai" ? "Checking evidence and preparing hypotheses…" : "Checking the selected feed…"}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
    {result && <InvestigationResult result={result} />}
  </div>;
}

function EvidenceItem({ item, currency }: { item: Evidence; currency?: string }) {
  return <li id={"analytics-" + item.id} className="scroll-mt-16 space-y-1.5 break-words px-4 py-3">
    <div className="flex flex-wrap items-center gap-2"><Badge tone="neutral">{item.id}</Badge><span className="text-xs text-fg-2">{item.topic}</span><span className="text-sm font-medium">{item.label}</span></div>
    {item.detail && <p className="text-sm text-fg-2">{item.detail}</p>}
    {item.current && item.previous && <>
      <p className="text-sm tabular-nums">Previous {format(item.previous.value, item.metric, currency)} → Current {format(item.current.value, item.metric, currency)}{item.delta != null && " (" + delta(item.delta) + ")"}</p>
      <p className="text-xs text-fg-2">{item.previous.measured}/{item.previous.rows} rows and {item.previous.measuredDays} measured dates → {item.current.measured}/{item.current.rows} rows and {item.current.measuredDays} measured dates{item.grain && " · " + item.grain}</p>
    </>}
  </li>;
}

const citations = (ids: string[]) => <span className="ml-1 inline-flex flex-wrap gap-2">
  {[...new Set(ids)].map(id => <a key={id} className="inline-flex min-h-8 items-center text-xs text-accent-text underline" href={"#analytics-" + id} aria-label={"Evidence " + id}>{id}</a>)}
</span>;

function InvestigationResult({ result }: { result: Result }) {
  const { brief, narrative, provider, note } = result;
  if ("reason" in brief) return <Card className="p-4"><p role="status">{brief.reason}</p></Card>;
  const primary = brief.primary;
  return <div className="space-y-4" aria-label="Investigation results">
    <Card>
      <CardHeader title="What happened?" subtitle={brief.source.label} action={<Badge tone={brief.comparable ? "success" : "warning"}>{brief.comparable ? "Measured comparison" : "Incomplete coverage"}</Badge>} />
      <div className="space-y-2 p-4">
        <p className="text-sm text-fg-2">Previous {brief.previous.start} to {brief.previous.end} · Current {brief.current.start} to {brief.current.end}</p>
        {brief.comparable && primary ? <>
          <p className="text-xl font-semibold tabular-nums">{primary.label} {primary.delta == null ? "had no percentage baseline" : primary.delta === 0 ? "was unchanged" : (primary.delta > 0 ? "increased " : "decreased ") + format(Math.abs(primary.delta)) + "%"}</p>
          <p className="text-sm tabular-nums text-fg-2">{format(primary.previous?.value, primary.metric, brief.currency)} → {format(primary.current?.value, primary.metric, brief.currency)} {citations([primary.id])}</p>
        </> : <p className="text-sm text-fg-2">There is too little comparable data for this metric. Try a shorter window, choose another metric, or import the missing dates.</p>}
        {note && <p className="text-sm text-fg-2" role="status">{note}</p>}
      </div>
    </Card>
    {narrative && <>
      <Card>
        <CardHeader title="Why might it have happened?" subtitle={"AI hypotheses · " + provider} />
        <ul className="divide-y divide-border">
          {narrative.hypotheses.map((item, index) => <li key={index} className="space-y-1 break-words p-4 text-sm">
            <p>{item.hypothesis} {citations(item.evidenceIds)}</p><p className="text-fg-2"><strong>How to verify</strong> {item.verification}</p>
          </li>)}
        </ul>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="What should we do next?" subtitle="Prioritized recommendations for review" />
          <ul className="divide-y divide-border">
            {narrative.actions.map((item, index) => <li key={index} className="space-y-2 break-words p-4 text-sm">
              <Badge tone={item.priority === "High" ? "danger" : item.priority === "Medium" ? "warning" : "neutral"}>{item.priority} priority</Badge>
              <p>{item.recommendation} {citations(item.evidenceIds)}</p>
            </li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="What should we test?" subtitle="Proposed experiments and decision rules" />
          <ul className="divide-y divide-border">
            {narrative.tests.map((item, index) => <li key={index} className="space-y-1 break-words p-4 text-sm">
              <p className="font-medium">{item.hypothesis} {citations(item.evidenceIds)}</p>
              <p>{item.setup}</p><p className="text-fg-2"><strong>Success metric</strong> {item.metric}</p><p className="text-fg-2"><strong>Decision rule</strong> {item.decisionRule}</p>
            </li>)}
          </ul>
        </Card>
      </div>
    </>}
    <Card>
      <CardHeader title="Evidence" subtitle="Values and coverage calculated from the selected feed." />
      {brief.evidence.length ? <ul className="divide-y divide-border">{brief.evidence.map(item => <EvidenceItem key={item.id} item={item} currency={brief.currency} />)}</ul>
        : <p className="p-4 text-sm text-fg-2">No measured values in these windows.</p>}
    </Card>
    {!!brief.gaps.length && <Card>
      <CardHeader title="Evidence gaps" />
      <ul className="list-disc space-y-1 px-8 pb-4 text-sm text-fg-2">{brief.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>
    </Card>}
  </div>;
}
