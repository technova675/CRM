"use client";

import { useMemo, useState } from "react";
import { Bookmark, Copy, GitMerge, Plus, Send, Share2, Tag, Trash2, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCRM, useMe } from "@/lib/store";
import { LEAD_SOURCES, LEAD_STATUSES, SERVICES, type CustomFieldDef, type InsightItem, type Lead, type SavedView } from "@/lib/types";
import { effectiveScore, scoreTier } from "@/lib/ai/scoring";
import { cn, DAY, relTime, uid } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, ScorePill, Select, StatusBadge, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { INDUSTRIES, SIZES } from "./LeadForms";

// ---------------- Filters (serialisable so they can be saved as views) ----------------
export interface LeadFilters {
  q: string;
  status: string;
  source: string;
  owner: string;
  industry: string;
  tier: string;
  tag: string;
  location: string;
  followups: string; // "" | "due" | "week"
  segment: string; // JSON-encoded Segment
}
export const EMPTY_FILTERS: LeadFilters = { q: "", status: "All", source: "All", owner: "All", industry: "All", tier: "All", tag: "All", location: "", followups: "", segment: "" };
export const filtersFromRecord = (r: Record<string, string>): LeadFilters => ({ ...EMPTY_FILTERS, ...r });
export const filtersToRecord = (f: LeadFilters) => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== EMPTY_FILTERS[k as keyof LeadFilters])) as Record<string, string>;

export interface Segment {
  industries: string[];
  sizes: string[];
  sources: string[];
  locations: string[];
  statuses: string[];
  services: string[];
  tags: string[];
  minScore: number;
  maxScore: number;
}
export const EMPTY_SEGMENT: Segment = { industries: [], sizes: [], sources: [], locations: [], statuses: [], services: [], tags: [], minScore: 0, maxScore: 100 };
export const parseSegment = (s: string): Segment | null => {
  if (!s) return null;
  try {
    return { ...EMPTY_SEGMENT, ...(JSON.parse(s) as Partial<Segment>) };
  } catch {
    return null;
  }
};
export function matchesSegment(l: Lead, s: Segment) {
  const score = effectiveScore(l);
  return (
    (!s.industries.length || s.industries.includes(l.industry)) &&
    (!s.sizes.length || s.sizes.includes(l.companySize)) &&
    (!s.sources.length || s.sources.includes(l.source)) &&
    (!s.locations.length || s.locations.includes(l.location)) &&
    (!s.statuses.length || s.statuses.includes(l.status)) &&
    (!s.services.length || s.services.some((x) => l.services.includes(x as Lead["services"][number]))) &&
    (!s.tags.length || s.tags.some((x) => l.tags.includes(x))) &&
    score >= s.minScore &&
    score <= s.maxScore
  );
}
export const describeSegment = (s: Segment) =>
  [
    s.industries.length && s.industries.join("/"),
    s.sizes.length && `${s.sizes.join("/")} staff`,
    s.sources.length && `via ${s.sources.join("/")}`,
    s.locations.length && s.locations.join("/"),
    s.statuses.length && s.statuses.join("/"),
    s.services.length && `needs ${s.services.join("/")}`,
    s.tags.length && `#${s.tags.join(" #")}`,
    (s.minScore > 0 || s.maxScore < 100) && `score ${s.minScore}–${s.maxScore}`,
  ]
    .filter(Boolean)
    .join(" · ") || "All leads";

export function applyLeadFilters(leads: Lead[], f: LeadFilters, now: number) {
  const t = f.q.trim().toLowerCase();
  const seg = parseSegment(f.segment);
  const weekEnd = now + 7 * DAY;
  return leads.filter(
    (l) =>
      (f.status === "All" || l.status === f.status) &&
      (f.source === "All" || l.source === f.source) &&
      (f.owner === "All" || l.ownerId === f.owner) &&
      (f.industry === "All" || l.industry === f.industry) &&
      (f.tier === "All" || scoreTier(effectiveScore(l)) === f.tier) &&
      (f.tag === "All" || l.tags.includes(f.tag)) &&
      (!f.location || l.location.toLowerCase().includes(f.location.toLowerCase())) &&
      (!f.followups ||
        (!!l.nextFollowUpAt && !l.optedOut && !["Won", "Lost"].includes(l.status) && (f.followups === "due" ? new Date(l.nextFollowUpAt).getTime() <= now + DAY : new Date(l.nextFollowUpAt).getTime() <= weekEnd))) &&
      (!seg || matchesSegment(l, seg)) &&
      (!t || `${l.name} ${l.company} ${l.email} ${l.location} ${l.jobTitle} ${l.tags.join(" ")}`.toLowerCase().includes(t)),
  );
}

// ---------------- Duplicate detection ----------------
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "icloud.com", "rediffmail.com", "proton.me", "protonmail.com", "live.com"]);
const normCompany = (c: string) => c.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|inc|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const normPhone = (p: string) => {
  const d = (p || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-10) : "";
};
const domainOf = (e: string) => (e.split("@")[1] ?? "").toLowerCase();

export interface DupGroup {
  key: string;
  reasons: string[];
  leads: Lead[];
}

export function findDuplicateGroups(leads: Lead[]): DupGroup[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const reasons = new Map<string, Set<string>>();
  const index = (key: string, reason: string) => {
    const seen = new Map<string, string>();
    return { seen, reason, key };
  };
  const buckets = [index("email", "Same email"), index("domco", "Same email domain + company"), index("phone", "Same phone")];
  for (const l of leads) {
    parent.set(l.id, l.id);
    const email = l.email.trim().toLowerCase();
    const dom = domainOf(email);
    const keys = [email || "", dom && !FREE_MAIL.has(dom) && normCompany(l.company) ? `${dom}|${normCompany(l.company)}` : "", normPhone(l.phone)];
    keys.forEach((k, i) => {
      if (!k) return;
      const b = buckets[i]!;
      const other = b.seen.get(k);
      if (other) {
        union(l.id, other);
        [l.id, other].forEach((id) => (reasons.get(id) ?? reasons.set(id, new Set()).get(id)!).add(b.reason));
      } else b.seen.set(k, l.id);
    });
  }
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    if (!reasons.has(l.id)) continue;
    const r = find(l.id);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(l);
  }
  return [...groups.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([key, ls]) => ({ key, leads: ls.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), reasons: [...new Set(ls.flatMap((l) => [...(reasons.get(l.id) ?? [])]))] }));
}

// Duplicates for a lead that is being typed into the add form.
export function findDuplicatesFor(d: { email: string; phone: string; company: string }, leads: Lead[]) {
  const email = d.email.trim().toLowerCase();
  const dom = domainOf(email);
  const phone = normPhone(d.phone);
  const co = normCompany(d.company);
  return leads
    .map((l) => {
      const r: string[] = [];
      if (email && l.email.toLowerCase() === email) r.push("same email");
      if (dom && !FREE_MAIL.has(dom) && co && domainOf(l.email) === dom && normCompany(l.company) === co) r.push("same domain + company");
      if (phone && normPhone(l.phone) === phone) r.push("same phone");
      return { lead: l, reasons: r };
    })
    .filter((x) => x.reasons.length)
    .slice(0, 5);
}

// Merge: keep the primary, fold notes / tags / services / custom fields and move related records.
export function mergeLeads(primaryId: string, otherIds: string[]) {
  const s = useCRM.getState();
  const primary = s.leads.find((l) => l.id === primaryId);
  const others = s.leads.filter((l) => otherIds.includes(l.id));
  if (!primary || !others.length) return;
  const merged: Lead = { ...primary };
  for (const o of others) {
    merged.tags = [...new Set([...merged.tags, ...o.tags])];
    merged.services = [...new Set([...merged.services, ...o.services])];
    if (o.notes.trim()) merged.notes = [merged.notes, `— Merged from ${o.name} (${o.email || o.phone || o.id}):\n${o.notes}`].filter(Boolean).join("\n\n");
    merged.phone ||= o.phone;
    merged.website ||= o.website;
    merged.linkedin ||= o.linkedin;
    merged.instagram ||= o.instagram;
    merged.dealValue = Math.max(merged.dealValue ?? 0, o.dealValue ?? 0) || undefined;
    merged.customFields = { ...(o.customFields ?? {}), ...(merged.customFields ?? {}) };
    if (!merged.research && o.research) merged.research = o.research;
    if (o.lastContactedAt && (!merged.lastContactedAt || o.lastContactedAt > merged.lastContactedAt)) merged.lastContactedAt = o.lastContactedAt;
  }
  const ids = new Set(otherIds);
  const re = <T extends { leadId?: string }>(x: T): T => (x.leadId && ids.has(x.leadId) ? { ...x, leadId: primaryId } : x);
  useCRM.setState((st) => ({
    leads: st.leads.filter((l) => !ids.has(l.id)).map((l) => (l.id === primaryId ? merged : l)),
    conversations: st.conversations.map(re),
    meetings: st.meetings.map(re),
    deals: st.deals.map(re),
    tasks: st.tasks.map((t) => (t.related?.type === "lead" && ids.has(t.related.id) ? { ...t, related: { type: "lead", id: primaryId } } : t)),
    outreach: st.outreach.map((c) => ({ ...c, recipients: c.recipients.map((r) => (ids.has(r.leadId) ? { ...r, leadId: primaryId } : r)) })),
  }));
  s.log({ actor: "human", actorId: s.currentUserId, entity: "lead", entityId: primaryId, action: "Merged duplicate leads", detail: `${others.length} merged into ${primary.name} · ${primary.company}` });
}

export function DuplicatesPanel({ leads, canWrite, onClose }: { leads: Lead[]; canWrite: boolean; onClose: () => void }) {
  const groups = useMemo(() => findDuplicateGroups(leads), [leads]);
  const [primary, setPrimary] = useState<Record<string, string>>({});
  return (
    <Card className="mb-3">
      <CardHeader title={<span className="flex items-center gap-2"><Copy className="size-3.5" /> Possible duplicates</span>} subtitle={`${groups.length} group(s) sharing an email, a company email domain + company name, or a phone number`} action={<button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button>} />
      {groups.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No duplicates found" />
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-y-auto px-4 pb-4">
          {groups.map((g) => {
            const pid = primary[g.key] ?? g.leads[0]!.id;
            return (
              <div key={g.key} className="rounded-lg border border-border p-2.5">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{g.reasons.map((r) => <Badge key={r} tone="warning">{r}</Badge>)}</div>
                <div className="space-y-1">
                  {g.leads.map((l) => (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-surface-2">
                      <input type="radio" name={`p-${g.key}`} checked={pid === l.id} onChange={() => setPrimary({ ...primary, [g.key]: l.id })} className="accent-[var(--accent)]" disabled={!canWrite} />
                      <span className="min-w-0 flex-1 truncate"><b className="font-medium">{l.name}</b> <span className="text-fg-3">· {l.company} · {l.email || "no email"} · {l.phone || "no phone"}</span></span>
                      <StatusBadge status={l.status} />
                      <span className="hidden text-[11px] text-fg-3 sm:inline">{relTime(l.createdAt)}</span>
                    </label>
                  ))}
                </div>
                {canWrite && (
                  <div className="mt-2 flex justify-end">
                    <Button size="xs" icon={<GitMerge className="size-3" />} onClick={() => { mergeLeads(pid, g.leads.filter((l) => l.id !== pid).map((l) => l.id)); toast("Leads merged", "Notes, tags and history folded into the primary lead."); }}>Merge into selected</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------- Bulk tagging ----------------
export function BulkTagControl({ ids, allTags, onDone }: { ids: string[]; allTags: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState("");
  const apply = (mode: "add" | "remove") => {
    const t = tag.trim();
    if (!t) return;
    const set = new Set(ids);
    useCRM.setState((s) => ({ leads: s.leads.map((l) => (set.has(l.id) ? { ...l, tags: mode === "add" ? [...new Set([...l.tags, t])] : l.tags.filter((x) => x !== t) } : l)) }));
    useCRM.getState().log({ actor: "human", actorId: useCRM.getState().currentUserId, entity: "lead", action: mode === "add" ? "Tagged leads" : "Removed tag from leads", detail: `#${t} · ${ids.length} lead(s)` });
    toast(mode === "add" ? `Tagged ${ids.length} leads #${t}` : `Removed #${t} from ${ids.length} leads`);
    setTag("");
    setOpen(false);
    onDone();
  };
  return (
    <div className="relative">
      <Button size="xs" icon={<Tag className="size-3" />} onClick={() => setOpen((o) => !o)}>Tags</Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="animate-in absolute left-0 top-8 z-30 w-64 space-y-2 rounded-xl border border-border bg-surface p-3 shadow-pop">
            <Input autoFocus list="lead-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag name" onKeyDown={(e) => e.key === "Enter" && apply("add")} />
            <datalist id="lead-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="flex gap-2">
              <Button size="xs" variant="primary" className="flex-1" disabled={!tag.trim()} onClick={() => apply("add")}>Add to {ids.length}</Button>
              <Button size="xs" className="flex-1" disabled={!tag.trim()} onClick={() => apply("remove")}>Remove</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Segment builder ----------------
function Chips({ options, value, onChange }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={cn("rounded-md border px-1.5 py-0.5 text-[11px] transition", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>{o}</button>;
      })}
    </div>
  );
}

export function SegmentBuilder({ open, onClose, leads, initial, onApply }: { open: boolean; onClose: () => void; leads: Lead[]; initial: Segment | null; onApply: (s: Segment | null) => void }) {
  const router = useRouter();
  const [s, setS] = useState<Segment>(initial ?? EMPTY_SEGMENT);
  const locations = useMemo(() => [...new Set(leads.map((l) => l.location).filter(Boolean))].sort(), [leads]);
  const tags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))].sort(), [leads]);
  const industries = useMemo(() => [...new Set([...INDUSTRIES, ...leads.map((l) => l.industry)])], [leads]);
  const matched = useMemo(() => leads.filter((l) => matchesSegment(l, s)), [leads, s]);
  const reachable = matched.filter((l) => !l.optedOut && !["Won", "Lost"].includes(l.status));
  const set = <K extends keyof Segment>(k: K, v: Segment[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Segment builder" subtitle={describeSegment(s)}
      footer={<>
        <Button variant="ghost" onClick={() => setS(EMPTY_SEGMENT)}>Reset</Button>
        <Button onClick={() => { onApply(JSON.stringify(s) === JSON.stringify(EMPTY_SEGMENT) ? null : s); onClose(); }}>Apply to list</Button>
        <Button variant="ai" icon={<Send className="size-3.5" />} disabled={!reachable.length} onClick={() => router.push(`/outreach?new=1&leads=${reachable.map((l) => l.id).join(",")}`)}>Start outreach to {reachable.length}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" className="sm:col-span-2"><Chips options={industries} value={s.industries} onChange={(v) => set("industries", v)} /></Field>
        <Field label="Company size"><Chips options={SIZES} value={s.sizes} onChange={(v) => set("sizes", v)} /></Field>
        <Field label="Lead source"><Chips options={LEAD_SOURCES} value={s.sources} onChange={(v) => set("sources", v)} /></Field>
        <Field label="Location" className="sm:col-span-2"><Chips options={locations} value={s.locations} onChange={(v) => set("locations", v)} /></Field>
        <Field label="Status" className="sm:col-span-2"><Chips options={LEAD_STATUSES} value={s.statuses} onChange={(v) => set("statuses", v)} /></Field>
        <Field label="Services required" className="sm:col-span-2"><Chips options={SERVICES} value={s.services} onChange={(v) => set("services", v)} /></Field>
        {tags.length > 0 && <Field label="Tags" className="sm:col-span-2"><Chips options={tags} value={s.tags} onChange={(v) => set("tags", v)} /></Field>}
        <Field label={`Score range: ${s.minScore}–${s.maxScore}`} className="sm:col-span-2">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={5} value={s.minScore} onChange={(e) => set("minScore", Math.min(Number(e.target.value), s.maxScore))} className="flex-1 accent-[var(--accent)]" aria-label="Minimum score" />
            <input type="range" min={0} max={100} step={5} value={s.maxScore} onChange={(e) => set("maxScore", Math.max(Number(e.target.value), s.minScore))} className="flex-1 accent-[var(--accent)]" aria-label="Maximum score" />
          </div>
        </Field>
      </div>
      <div className="mt-4 rounded-xl border border-border p-3">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-semibold tabular-nums">{matched.length}<span className="ml-1 text-sm font-normal text-fg-3">leads match</span></p>
          <p className="text-xs text-fg-3">{reachable.length} reachable (not opted out, not closed)</p>
        </div>
        <ul className="mt-2 space-y-1">
          {matched.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{l.name} · <span className="text-fg-3">{l.company} · {l.location}</span></span><ScorePill score={effectiveScore(l)} /></li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

// ---------------- Saved views ----------------
export function SavedViewsBar({ current, onApply }: { current: LeadFilters; onApply: (f: LeadFilters, id: string | null) => void }) {
  const me = useMe();
  const views = useCRM((s) => s.savedViews);
  const upsert = useCRM((s) => s.upsert);
  const remove = useCRM((s) => s.remove);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const mine = useMemo(() => views.filter((v) => v.module === "leads" && (v.shared || v.ownerId === me.id)), [views, me.id]);
  const currentKey = JSON.stringify(filtersToRecord(current));
  const activeId = mine.find((v) => JSON.stringify(filtersToRecord(filtersFromRecord(v.filters))) === currentKey)?.id ?? null;
  const dirty = currentKey !== "{}";

  const save = () => {
    if (!name.trim()) return;
    const v: SavedView = { id: uid("sv"), module: "leads", name: name.trim(), filters: filtersToRecord(current), ownerId: me.id, shared };
    upsert("savedViews", v);
    toast("View saved", shared ? "Shared with the team" : "Only visible to you");
    setName("");
    setSaving(false);
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <Bookmark className="size-3.5 text-fg-3" />
      <button onClick={() => onApply(EMPTY_FILTERS, null)} className={cn("h-7 rounded-full border px-3 text-xs font-medium", !dirty ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-2 hover:bg-surface-2")}>All leads</button>
      {mine.map((v) => (
        <span key={v.id} className={cn("group inline-flex h-7 items-center gap-1 rounded-full border pl-3 pr-1.5 text-xs font-medium", activeId === v.id ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface text-fg-2 hover:bg-surface-2")}>
          <button onClick={() => onApply(filtersFromRecord(v.filters), v.id)}>{v.name}</button>
          {v.shared && <span title="Shared view"><Share2 className="size-3 opacity-60" /></span>}
          {(v.ownerId === me.id || me.role === "admin") && (
            <button onClick={() => { remove("savedViews", v.id); toast("View deleted"); }} className="rounded-full p-0.5 opacity-50 hover:bg-danger-soft hover:text-danger group-hover:opacity-100" aria-label={`Delete view ${v.name}`}><Trash2 className="size-3" /></button>
          )}
        </span>
      ))}
      {dirty && !activeId && (
        <div className="relative">
          <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setSaving((o) => !o)}>Save view</Button>
          {saving && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setSaving(false)} />
              <div className="animate-in absolute left-0 top-8 z-30 w-64 space-y-2 rounded-xl border border-border bg-surface p-3 shadow-pop">
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" onKeyDown={(e) => e.key === "Enter" && save()} />
                <label className="flex items-center justify-between text-xs text-fg-2">Share with team <Toggle checked={shared} onChange={setShared} /></label>
                <Button size="xs" variant="primary" className="w-full" disabled={!name.trim()} onClick={save}>Save current filters</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Custom fields ----------------
export function CustomFieldInput({ def, value, onChange, disabled }: { def: CustomFieldDef; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  if (def.type === "select")
    return (
      <Select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(def.options ?? []).map((o) => <option key={o}>{o}</option>)}
      </Select>
    );
  return <Input disabled={disabled} type={def.type === "number" ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} />;
}

// ---------------- Recommended next action ----------------
export function nextBestAction(l: Lead, ctx: { threshold: number; hasMeeting: boolean; hasProposal: boolean; now: number }): InsightItem[] {
  const score = effectiveScore(l);
  const out: InsightItem[] = [];
  const days = l.lastContactedAt ? Math.round((ctx.now - new Date(l.lastContactedAt).getTime()) / DAY) : null;
  out.push({ kind: "data", text: `Score ${score} (${scoreTier(score)}) · status ${l.status}${days !== null ? ` · last contacted ${days} day(s) ago` : " · never contacted"}`, source: "CRM record" });
  if (l.optedOut) return [...out, { kind: "recommendation", text: "Opted out — do not contact. Keep the record for reporting only." }];
  if (["Won", "Lost"].includes(l.status)) return [...out, { kind: "recommendation", text: l.status === "Won" ? "Won — make sure onboarding is running for the new client." : "Lost — add a nurture tag and revisit in 90 days." }];
  if (l.research?.status !== "done") out.push({ kind: "recommendation", text: "Run AI research first so outreach uses a specific angle." });
  if (l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= ctx.now + DAY) out.push({ kind: "recommendation", text: "Follow-up is due — send the next sequence step or a personal note today." });
  switch (l.status) {
    case "New":
    case "Researching":
      out.push({ kind: "recommendation", text: score >= ctx.threshold ? "Qualifies — mark Qualified and send a personalised first message." : `Below the ${ctx.threshold} qualification threshold — enrich the record or nurture.` });
      break;
    case "Qualified":
      out.push({ kind: "recommendation", text: score >= 75 ? "Hot lead — send a personalised first message within 24h (call if a phone number is on record)." : "Add to an outreach campaign with the recommended angle." });
      break;
    case "Contacted":
      out.push({ kind: "recommendation", text: days !== null && days >= 4 ? `No reply for ${days} days — send a follow-up on a second channel (LinkedIn / WhatsApp).` : "Wait for a reply; the sequence will follow up automatically." });
      break;
    case "Replied":
      out.push({ kind: "recommendation", text: "Replied — take over from AI and book a discovery call." });
      break;
    case "Meeting":
      out.push({ kind: "recommendation", text: ctx.hasMeeting ? "Capture meeting notes and outcome, then generate a proposal." : "Schedule the discovery meeting." });
      break;
    case "Proposal":
      out.push({ kind: "recommendation", text: ctx.hasProposal ? "Proposal is out — check if it was viewed and follow up within 48h." : "Generate the proposal from discovery notes." });
      break;
    case "Negotiation":
      out.push({ kind: "recommendation", text: "Resolve open objections (scope / price) and agree a start date." });
      break;
  }
  return out;
}
