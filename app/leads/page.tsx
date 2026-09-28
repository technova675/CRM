"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Filter, Globe, Briefcase as Linkedin, Plus, Send, Sparkles, Trash2, Upload, Users, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { LEAD_SOURCES, LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";
import { effectiveScore } from "@/lib/ai/scoring";
import { cn, compactMoney, downloadFile, fmtShort, relTime, toCSV } from "@/lib/utils";
import { AIBadge, Badge, Button, Card, Checkbox, EmptyState, Input, MemberAvatar, PageHeader, ScorePill, SearchInput, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { AddLeadModal, ImportModal, INDUSTRIES } from "@/components/sales/LeadForms";
import { applyLeadFilters, BulkTagControl, describeSegment, DuplicatesPanel, EMPTY_FILTERS, findDuplicateGroups, parseSegment, SavedViewsBar, SegmentBuilder, type LeadFilters } from "@/components/sales/LeadTools";

type SortKey = "name" | "company" | "score" | "createdAt" | "status";
const PAGE = 50;

function SortIcon({ sort, k }: { sort: { key: SortKey; dir: 1 | -1 }; k: SortKey }) {
  if (sort.key !== k) return null;
  return sort.dir === 1 ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" />;
}

function LeadsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const leads = useCRM((s) => s.leads);
  const team = useCRM((s) => s.team);
  const researchLead = useCRM((s) => s.researchLead);
  const setLeadStatus = useCRM((s) => s.setLeadStatus);
  const updateLead = useCRM((s) => s.updateLead);
  const deleteLeads = useCRM((s) => s.deleteLeads);
  const canWrite = can(me.role, "leads", "write");

  const [f, setF] = useState<LeadFilters>(() => ({ ...EMPTY_FILTERS, followups: params.get("followups") ? "due" : "" }));
  const setFilter = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const { q, status } = f;
  const [now] = useState(() => Date.now());
  const [showDups, setShowDups] = useState(false);
  const [segOpen, setSegOpen] = useState(false);
  const [customCol, setCustomCol] = useState("");
  const customDefs = useCRM((s) => s.settings.leadCustomFields);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "createdAt", dir: -1 });
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(() => params.get("new") === "1");
  const [importOpen, setImportOpen] = useState(() => params.get("import") === "1");

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: leads.length };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const allTags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))].sort(), [leads]);
  const dupCount = useMemo(() => findDuplicateGroups(leads).length, [leads]);
  const segment = parseSegment(f.segment);

  const filtered = useMemo(() => {
    const out = applyLeadFilters(leads, f, now);
    const val = (l: Lead): string | number =>
      sort.key === "score" ? effectiveScore(l) : sort.key === "status" ? LEAD_STATUSES.indexOf(l.status) : sort.key === "createdAt" ? l.createdAt : l[sort.key].toLowerCase();
    return out.sort((a, b) => (val(a) > val(b) ? sort.dir : val(a) < val(b) ? -sort.dir : 0));
  }, [leads, f, sort, now]);

  // Page resets to 0 whenever the filter set changes.
  const filterKey = JSON.stringify(f);
  const page = pageState.key === filterKey ? pageState.page : 0;
  const setPage = (fn: (p: number) => number) => setPageState({ key: filterKey, page: fn(page) });
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const allOnPage = pageRows.length > 0 && pageRows.every((l) => sel.has(l.id));
  const someOnPage = pageRows.some((l) => sel.has(l.id));

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" || key === "company" ? 1 : -1 }));

  const ids = [...sel];
  const clear = () => setSel(new Set());
  const bulkResearch = async () => {
    toast(`Researching ${ids.length} leads`, "AI research running in background", "ai");
    clear();
    for (const id of ids) await researchLead(id);
    toast("Research complete", `${ids.length} leads researched & scored`, "ai");
  };
  const exportCSV = () => {
    const rows = (ids.length ? leads.filter((l) => sel.has(l.id)) : filtered).map((l) => ({
      name: l.name, company: l.company, job_title: l.jobTitle, email: l.email, phone: l.phone, linkedin: l.linkedin ?? "", instagram: l.instagram ?? "",
      website: l.website ?? "", location: l.location, industry: l.industry, company_size: l.companySize, source: l.source, status: l.status,
      score: effectiveScore(l), owner: team.find((t) => t.id === l.ownerId)?.name ?? "", services: l.services.join("; "), tags: l.tags.join("; "), deal_value: l.dealValue ?? "", created: l.createdAt.slice(0, 10),
      ...Object.fromEntries(customDefs.map((d) => [d.key, l.customFields?.[d.key] ?? ""])),
    }));
    downloadFile(`adbibe-leads-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), "text/csv");
  };
  const sellers = team.filter((t) => ["admin", "sales"].includes(t.role));

  return (
    <div>
      <PageHeader
        title="Leads"
        description={`${leads.length.toLocaleString()} leads · centralized database with AI research & scoring`}
        actions={
          <>
            <Button icon={<Download className="size-3.5" />} onClick={exportCSV}>Export</Button>
            {canWrite && <Button icon={<Upload className="size-3.5" />} onClick={() => setImportOpen(true)}>Import</Button>}
            {canWrite && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAddOpen(true)}>Add lead</Button>}
          </>
        }
      />

      <SavedViewsBar current={f} onApply={(nf) => setF(nf)} />
      {showDups && <DuplicatesPanel leads={leads} canWrite={canWrite} onClose={() => setShowDups(false)} />}

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {(["All", ...LEAD_STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter("status", s)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs font-medium transition", status === s ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg-2 hover:bg-surface-2")}>
            {s}
            <span className={cn("tabular-nums", status === s ? "opacity-70" : "text-fg-3")}>{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <SearchInput value={q} onChange={(v) => setFilter("q", v)} placeholder="Search name, company, email, city, tag…" className="w-full sm:w-72" />
          <Select value={f.source} onChange={(e) => setFilter("source", e.target.value)} className="w-auto"><option value="All">All sources</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={f.industry} onChange={(e) => setFilter("industry", e.target.value)} className="w-auto"><option value="All">All industries</option>{INDUSTRIES.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={f.owner} onChange={(e) => setFilter("owner", e.target.value)} className="w-auto"><option value="All">All owners</option>{team.filter((t) => t.role !== "client").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Select value={f.tier} onChange={(e) => setFilter("tier", e.target.value)} className="w-auto"><option value="All">All scores</option>{["Hot", "Warm", "Cool", "Cold"].map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={f.tag} onChange={(e) => setFilter("tag", e.target.value)} className="w-auto"><option value="All">All tags</option>{allTags.map((t) => <option key={t} value={t}>#{t}</option>)}</Select>
          <Input value={f.location} onChange={(e) => setFilter("location", e.target.value)} placeholder="Location" className="w-28" />
          <Select value={f.followups} onChange={(e) => setFilter("followups", e.target.value)} className="w-auto"><option value="">Any follow-up</option><option value="due">Follow-up due</option><option value="week">Follow-up this week</option></Select>
          <Button size="sm" variant={segment ? "primary" : "secondary"} icon={<Filter className="size-3.5" />} onClick={() => setSegOpen(true)}>Segment</Button>
          <Button size="sm" variant={showDups ? "primary" : "secondary"} icon={<Copy className="size-3.5" />} onClick={() => setShowDups((v) => !v)}>Duplicates{dupCount > 0 && <Badge tone="warning" className="ml-0.5">{dupCount}</Badge>}</Button>
          {customDefs.length > 0 && (
            <Select value={customCol} onChange={(e) => setCustomCol(e.target.value)} className="hidden w-auto lg:block" title="Show a custom field column"><option value="">+ Column</option>{customDefs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</Select>
          )}
          <span className="ml-auto text-xs text-fg-3">{filtered.length.toLocaleString()} results</span>
        </div>

        {segment && (
          <div className="flex items-center gap-2 border-b border-border bg-accent-soft/40 px-3 py-1.5 text-xs">
            <Filter className="size-3 text-accent-text" /> Segment: <span className="font-medium">{describeSegment(segment)}</span>
            <button onClick={() => setSegOpen(true)} className="text-accent-text hover:underline">Edit</button>
            <button onClick={() => setFilter("segment", "")} className="ml-auto inline-flex items-center gap-1 text-fg-3 hover:text-fg"><X className="size-3" /> Clear</button>
          </div>
        )}

        {sel.size > 0 && canWrite && (
          <div className="animate-in flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/60 px-3 py-2">
            <span className="text-[13px] font-medium">{sel.size} selected</span>
            <Button size="xs" variant="ai" icon={<Sparkles className="size-3" />} onClick={bulkResearch}>AI research</Button>
            <Button size="xs" icon={<Send className="size-3" />} onClick={() => router.push(`/outreach?new=1&leads=${ids.join(",")}`)}>Add to outreach</Button>
            <Select className="h-7 w-auto text-xs" value="" onChange={(e) => { const v = e.target.value as LeadStatus; if (!v) return; ids.forEach((id) => setLeadStatus(id, v)); toast(`Moved ${ids.length} leads to ${v}`); clear(); }}>
              <option value="">Set status…</option>{LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
            <Select className="h-7 w-auto text-xs" value="" onChange={(e) => { const v = e.target.value; if (!v) return; ids.forEach((id) => updateLead(id, { ownerId: v })); toast(`Assigned ${ids.length} leads`); clear(); }}>
              <option value="">Assign to…</option>{sellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <BulkTagControl ids={ids} allTags={allTags} onDone={() => {}} />
            <Button size="xs" icon={<Download className="size-3" />} onClick={exportCSV}>Export</Button>
            <Button size="xs" variant="ghost" className="text-danger" icon={<Trash2 className="size-3" />} onClick={() => { if (confirm(`Delete ${ids.length} leads? This cannot be undone.`)) { deleteLeads(ids); clear(); } }}>Delete</Button>
            <button className="ml-auto text-xs text-fg-3 hover:text-fg" onClick={clear}>Clear</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="size-5" />} title="No leads match these filters" description="Try clearing filters or import a list." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-8"><Checkbox checked={allOnPage} indeterminate={!allOnPage && someOnPage} onChange={(v) => setSel((s) => { const n = new Set(s); pageRows.forEach((l) => (v ? n.add(l.id) : n.delete(l.id))); return n; })} /></Th>
                <Th onClick={() => toggleSort("name")}>Lead <SortIcon sort={sort} k="name" /></Th>
                <Th onClick={() => toggleSort("company")} className="hidden md:table-cell">Company <SortIcon sort={sort} k="company" /></Th>
                <Th onClick={() => toggleSort("status")}>Status <SortIcon sort={sort} k="status" /></Th>
                <Th onClick={() => toggleSort("score")}>Score <SortIcon sort={sort} k="score" /></Th>
                <Th className="hidden lg:table-cell">Source</Th>
                <Th className="hidden xl:table-cell">Services</Th>
                {customCol && <Th className="hidden lg:table-cell">{customDefs.find((d) => d.key === customCol)?.label}</Th>}
                <Th className="hidden md:table-cell">Owner</Th>
                <Th onClick={() => toggleSort("createdAt")} className="hidden sm:table-cell">Added <SortIcon sort={sort} k="createdAt" /></Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((l) => (
                <tr key={l.id} className={cn("group cursor-pointer hover:bg-surface-2/60", sel.has(l.id) && "bg-accent-soft/40")} onClick={() => router.push(`/leads/${l.id}`)}>
                  <Td><Checkbox checked={sel.has(l.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} /></Td>
                  <Td>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <Link href={`/leads/${l.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">{l.name}</Link>
                        <p className="truncate text-xs text-fg-3">{l.jobTitle}<span className="md:hidden"> · {l.company}</span></p>
                      </div>
                      {l.optedOut && <span className="rounded bg-danger-soft px-1 text-[10px] text-danger">opted out</span>}
                      {l.tags.slice(0, 2).map((t) => <span key={t} className="hidden rounded bg-surface-2 px-1 text-[10px] text-fg-3 sm:inline">#{t}</span>)}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <p className="truncate font-medium">{l.company}</p>
                    <p className="flex items-center gap-1.5 text-xs text-fg-3">
                      {l.industry} · {l.location}
                      {l.website && <Globe className="size-3" />}
                      {l.linkedin && <Linkedin className="size-3" />}
                    </p>
                  </Td>
                  <Td><StatusBadge status={l.status} /></Td>
                  <Td>
                    {l.research?.status === "running" ? <AIBadge>Researching</AIBadge> : <ScorePill score={effectiveScore(l)} overridden={l.score?.override !== undefined} />}
                  </Td>
                  <Td className="hidden lg:table-cell text-fg-2">{l.source}{l.dealValue ? <span className="block text-[11px] text-fg-3">{compactMoney(l.dealValue)}</span> : null}</Td>
                  <Td className="hidden xl:table-cell">
                    <div className="flex max-w-56 flex-wrap gap-1">{l.services.slice(0, 2).map((s) => <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2">{s}</span>)}{l.services.length > 2 && <span className="text-[11px] text-fg-3">+{l.services.length - 2}</span>}</div>
                  </Td>
                  {customCol && <Td className="hidden lg:table-cell text-xs text-fg-2">{l.customFields?.[customCol] || "—"}</Td>}
                  <Td className="hidden md:table-cell"><MemberAvatar id={l.ownerId} showName /></Td>
                  <Td className="hidden sm:table-cell text-xs text-fg-3 whitespace-nowrap" >{relTime(l.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between px-3 py-2.5 text-xs text-fg-3">
            <span>{page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {filtered.length.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <Button size="xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="px-2 tabular-nums">{page + 1} / {pages}</span>
              <Button size="xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <p className="mt-2 text-[11px] text-fg-3">Last lead added {fmtShort(leads[0]?.createdAt)}. Tip: select leads to research them with AI or send them into an outreach campaign.</p>

      {segOpen && <SegmentBuilder open leads={leads} initial={segment} onClose={() => setSegOpen(false)} onApply={(sg) => setFilter("segment", sg ? JSON.stringify(sg) : "")} />}
      <AddLeadModal open={addOpen} onClose={() => { setAddOpen(false); if (params.get("new")) router.replace("/leads"); }} />
      <ImportModal open={importOpen} onClose={() => { setImportOpen(false); if (params.get("import")) router.replace("/leads"); }} />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsInner />
    </Suspense>
  );
}
