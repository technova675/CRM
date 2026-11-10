"use client";

import { useMemo, useState } from "react";
import { Database, Download } from "lucide-react";
import Papa from "papaparse";
import { useCRM } from "@/lib/store";
import { downloadFile } from "@/lib/utils";
import { campaignFacts, crmFacts, dimensions, metrics, metricValue, type Dimension, type Fact, type Metric } from "@/lib/domain/analyticsEngine";
import { Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";

const keys = Object.keys(metrics) as Metric[];
const label = (key: string) => key === "landingPage" ? "Landing page" : key[0].toUpperCase() + key.slice(1);
const moneyMetrics = ["spend", "revenue", "cpc", "cpm", "cpl", "cpa"];
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
function display(value: number | null, metric: Metric, currency?: string) {
  if (value === null) return "—";
  if (currency && moneyMetrics.includes(metric)) return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  return number.format(value) + (metric === "ctr" || metric === "cvr" ? "%" : metric === "roas" ? "×" : "");
}
const adBreakdowns: Dimension[] = ["ad", "creative", "audience", "geography", "placement"];

export function UnifiedExplorer({ clientId, showCrm, initialFeed, onSources }: { clientId: string; showCrm: boolean; initialFeed: string; onSources?: () => void }) {
  const campaigns = useCRM(s => s.campaigns);
  const creatives = useCRM(s => s.creatives);
  const ads = useCRM(s => s.ads);
  const clients = useCRM(s => s.clients);
  const leads = useCRM(s => s.leads);
  const deals = useCRM(s => s.deals);
  const projects = useCRM(s => s.seoProjects);
  const feeds = useCRM(s => s.analyticsFeeds);
  const [source, setSource] = useState(initialFeed);
  const [dimension, setDimension] = useState<Dimension>("platform");
  const [pickedMetric, setMetric] = useState<Metric | "">("");
  const [dates, setDates] = useState({ start: "", end: "" });
  const [page, setPage] = useState(1);
  const scoped = (id: string) => clientId === "All" || clientId === id;
  const names = useMemo(() => new Map(clients.map(client => [client.id, client.company])), [clients]);
  const activeFeed = feeds.find(feed => feed.id === source && names.has(feed.clientId) && scoped(feed.clientId));
  const gsc = projects.find(project => "gsc:" + project.id === source && scoped(project.clientId))?.workspace?.gsc;
  const seo = projects.find(project => "seo:" + project.id === source && scoped(project.clientId))?.workspace;
  const selectedProject = projects.find(project => ["gsc:" + project.id, "seo:" + project.id].includes(source) && scoped(project.clientId));
  const compare = source === "compare" && showCrm;
  const active = activeFeed || selectedProject || showCrm && source === "crm" || compare ? source : "paid";
  const byAd = active === "paid" && adBreakdowns.includes(dimension);

  const facts = useMemo((): Fact[] => {
    if (compare) {
      const paid = campaignFacts(campaigns, ads, creatives, false).map(row => ({ ...row, feed: "Performance workspace" }));
      const crm = crmFacts(leads, deals).map(row => ({ ...row, feed: "CRM records" }));
      const imports = feeds.filter(feed => names.has(feed.clientId)).flatMap(feed => feed.rows.map(row => ({
        ...row, clientId: feed.clientId, platform: feed.platform, currency: feed.currency, origin: feed.method,
        feedId: feed.id, feed: [names.get(feed.clientId), feed.account, feed.report, feed.method].join(" · "),
      })));
      const search = projects.flatMap(project => {
        const w = project.workspace;
        const make = (records: NonNullable<typeof w>["traffic"], origin: string) => records.map(row => ({
          ...row, clientId: project.clientId, platform: "Search Console", origin, feedId: project.id + ":" + origin, feed: [names.get(project.clientId), project.domain, origin].join(" · "),
        }));
        return [...make(w?.gsc?.daily ?? [], "Search Console sync"), ...make(w?.traffic ?? [], "SEO traffic import")];
      });
      return [...paid, ...crm, ...imports, ...search];
    }
    if (activeFeed) return activeFeed.rows.map(row => ({ ...row, clientId: activeFeed.clientId, platform: activeFeed.platform, currency: activeFeed.currency, origin: activeFeed.method }));
    if (selectedProject) return (gsc?.daily ?? seo?.traffic ?? []).map(row => ({ ...row, clientId: selectedProject.clientId, platform: "Search Console", origin: gsc ? "Search Console sync" : "SEO traffic import" }));
    if (active === "crm") return crmFacts(leads, deals);
    return campaignFacts(campaigns, ads, creatives, byAd);
  }, [active, activeFeed, ads, byAd, campaigns, compare, creatives, deals, feeds, gsc, leads, names, projects, selectedProject, seo]);
  const scopedFacts = useMemo(() => facts.filter(row => clientId === "All" || row.clientId === clientId), [facts, clientId]);
  const filtered = useMemo(() => scopedFacts.filter(row => (!dates.start || row.date >= dates.start) && (!dates.end || row.date <= dates.end)), [scopedFacts, dates]);
  const coverage = useMemo(() => Object.fromEntries(keys.map(key => [key, metricValue(filtered, key)])) as Record<Metric, ReturnType<typeof metricValue>>, [filtered]);
  const available = keys.filter(key => coverage[key].measured);
  const metric = pickedMetric && available.includes(pickedMetric) ? pickedMetric : available[0] ?? (pickedMetric || "spend");
  const currency = activeFeed?.currency ?? (active === "paid" ? "INR" : undefined);
  const origin = [...new Set(filtered.map(row => row.origin))].join(" · ");
  const rows = (() => {
    const grouped = new Map<string, { name: string; currency?: string; facts: Fact[] }>();
    for (const fact of filtered) {
      const name = compare ? fact.platform + " · " + fact.feed : dimension === "client" ? names.get(fact.clientId) ?? "Unassigned client" : fact[dimension] ?? "Not reported";
      const identity = compare ? [name, fact.feedId, fact.currency] : [name, dimension === "client" ? fact.clientId : fact.dimensionIds?.[dimension]];
      const key = JSON.stringify(identity);
      const bucket = grouped.get(key) ?? { name, currency: fact.currency, facts: [] };
      bucket.facts.push(fact);
      grouped.set(key, bucket);
    }
    return [...grouped].map(([key, { name, currency, facts }]) => ({ key, name, currency, count: facts.length, ...metricValue(facts, metric) }))
      .sort((a, b) => (dimension === "date" || compare && moneyMetrics.includes(metric)) ? a.name.localeCompare(b.name) : (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name));
  })();
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const ranked = dimension === "date" ? rows.filter(row => row.value !== null).slice(-14) : rows.filter(row => row.value !== null).slice(0, 8);
  const peak = Math.max(1, ...ranked.map(row => row.value ?? 0));
  const exportRows = () => downloadFile("analytics-breakdown.csv", Papa.unparse(rows.map(row => ({
    [compare ? "feed" : dimension]: row.name, metric: metrics[metric], value: row.value, currency: moneyMetrics.includes(metric) ? row.currency ?? "" : "",
    measured_rows: row.measured, source_rows: row.count,
  })), { escapeFormulae: true }), "text/csv");
  const invalidDates = !!dates.start && !!dates.end && dates.start > dates.end;

  return <div className="min-w-0 space-y-4">
    <Card>
      <CardHeader title="Explore measured performance" subtitle="Choose a feed, then break down the same metrics by any reported dimension." />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Data feed"><Select className="min-h-11 w-full" value={active} onChange={event => { setSource(event.target.value); setMetric(""); setPage(1); }}>
          {showCrm && <option value="compare">Compare data feeds</option>}
          <option value="paid">Performance workspace · paid media</option>
          {showCrm && <option value="crm">CRM · leads and deals created</option>}
          {projects.filter(project => scoped(project.clientId)).map(project => <optgroup key={project.id} label={project.domain}>
            {!!project.workspace?.gsc?.daily.length && <option value={"gsc:" + project.id}>Search Console sync · {project.domain}</option>}
            {!!project.workspace?.traffic?.length && <option value={"seo:" + project.id}>SEO traffic import · {project.domain}</option>}
          </optgroup>)}
          {feeds.filter(feed => names.has(feed.clientId) && scoped(feed.clientId)).map(feed => <option key={feed.id} value={feed.id}>{feed.platform} · {feed.report} · {names.get(feed.clientId)} · {feed.account}</option>)}
        </Select></Field>
        <Field label="Break down by"><Select className="min-h-11 w-full" value={compare ? "platform" : dimension} disabled={compare} onChange={event => { setDimension(event.target.value as Dimension); setPage(1); }}>
          {dimensions.map(key => <option key={key} value={key}>{label(key)}</option>)}
        </Select></Field>
        <Field label="Metric"><Select className="min-h-11 w-full" value={metric} onChange={event => { setMetric(event.target.value as Metric); setPage(1); }}>
          {(available.length ? available : [metric]).map(key => <option key={key} value={key}>{metrics[key]}</option>)}
        </Select></Field>
        <Field label="From date"><Input className="min-h-11 w-full min-w-0" type="date" value={dates.start} onChange={event => { setDates({ ...dates, start: event.target.value }); setPage(1); }} /></Field>
        <Field label="To date"><Input className="min-h-11 w-full min-w-0" type="date" value={dates.end} onChange={event => { setDates({ ...dates, end: event.target.value }); setPage(1); }} /></Field>
      </div>
      {invalidDates && <p role="alert" className="px-4 pb-4 text-sm text-danger">From date must be on or before To date.</p>}
      {compare && <p className="px-4 pb-4 text-sm text-fg-2">Each feed is shown separately. Attribution and currencies can differ across feeds.</p>}
      {byAd && <p className="px-4 pb-4 text-sm text-fg-2">This breakdown uses dated ad rows. Campaign totals are excluded.</p>}
    </Card>
    {rows.length === 0 && !invalidDates && <Card className="p-6">
      <Database className="mb-3 size-5 text-accent-text" aria-hidden="true" />
      <h2 className="font-semibold">No measured rows for this view</h2>
      <p className="my-2 text-sm text-fg-2">Choose another feed or date range, or add a source report.</p>
      {onSources && <Button className="min-h-11" onClick={onSources}>View sources</Button>}
    </Card>}
    {!!rows.length && <>
      {!compare && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[metric, ...available.filter(key => key !== metric)].slice(0, 4).map(key => <Card key={key} className="p-4">
          <p className="text-sm text-fg-2">{metrics[key]}</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{display(coverage[key].value, key, currency)}</p>
          <p className="mt-1 text-xs text-fg-2">{coverage[key].measured.toLocaleString()} of {filtered.length.toLocaleString()} rows measured</p>
        </Card>)}
      </div>}
      {!compare && <Card>
        <CardHeader title={metrics[metric] + " by " + dimension} subtitle={origin + (dimension === "date" ? " · Latest 14 measured dates" : " · Top 8 measured groups")} />
        {!!ranked.length && <ul className="space-y-3 px-4 pb-5" aria-label={metrics[metric] + " chart"}>
          {ranked.map(row => <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-sm">
            <span className="break-words">{row.name}</span><span className="tabular-nums">{display(row.value, metric, row.currency)}</span>
            <div aria-hidden="true" className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: (row.value ?? 0) / peak * 100 + "%" }} /></div>
          </li>)}
        </ul>}
      </Card>}
      <Card>
        <CardHeader title={compare ? "Feed comparison" : "Breakdown table"} subtitle={rows.length.toLocaleString() + " groups · Missing measurements shown as —"} />
        <div className="px-4 pb-3"><Button className="min-h-11" variant="secondary" icon={<Download size={16} />} onClick={exportRows}>Export breakdown CSV</Button></div>
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-y border-border text-fg-2"><tr><th scope="col" className="w-1/2 p-3">{compare ? "Data feed" : label(dimension)}</th><th scope="col" className="p-3">{metrics[metric]}</th><th scope="col" className="p-3">Coverage</th></tr></thead>
          <tbody>{rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(row => <tr key={row.key} className="border-b border-border">
            <th scope="row" className="break-words p-3 font-medium">{row.name}</th><td className="break-words p-3 tabular-nums">{display(row.value, metric, row.currency)}</td><td className="p-3 text-fg-2 tabular-nums">{row.measured}/{row.count}</td>
          </tr>)}</tbody>
        </table>
        {pages > 1 && <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <Button className="min-h-11" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
          <span>Page {currentPage} of {pages}</span>
          <Button className="min-h-11" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
        </div>}
      </Card>
    </>}
  </div>;
}
