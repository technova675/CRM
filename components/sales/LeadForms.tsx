"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useCRM } from "@/lib/store";
import { LEAD_SOURCES, SERVICES, type CompanySize, type Lead, type LeadSource, type Service } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn } from "@/lib/utils";
import { CustomFieldInput, findDuplicatesFor } from "./LeadTools";

export const INDUSTRIES = ["D2C / E-commerce", "Real Estate", "Education", "Healthcare", "Hospitality", "Fashion", "Beauty", "SaaS", "Fintech", "Automotive", "Food & Beverage", "Fitness", "Consulting", "Other"];
export const SIZES: CompanySize[] = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

type Draft = {
  name: string; company: string; jobTitle: string; email: string; phone: string; linkedin: string; instagram: string; website: string;
  location: string; industry: string; companySize: CompanySize; source: LeadSource; ownerId: string; services: Service[]; notes: string;
  dealValue: string; customFields: Record<string, string>;
};

const empty = (ownerId: string): Draft => ({
  name: "", company: "", jobTitle: "", email: "", phone: "", linkedin: "", instagram: "", website: "", location: "", industry: INDUSTRIES[0]!,
  companySize: "11-50", source: "Website", ownerId, services: [], notes: "", dealValue: "", customFields: {},
});

export function ServicePicker({ value, onChange }: { value: Service[]; onChange: (v: Service[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SERVICES.map((s) => {
        const on = value.includes(s);
        return (
          <button key={s} type="button" onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])} className={cn("rounded-md border px-2 py-1 text-xs transition", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

export function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const team = useCRM((s) => s.team);
  const me = useCRM((s) => s.currentUserId);
  const addLead = useCRM((s) => s.addLead);
  const leads = useCRM((s) => s.leads);
  const customDefs = useCRM((s) => s.settings.leadCustomFields);
  const [d, setD] = useState<Draft>(() => empty(me));
  const dups = useMemo(() => (d.email || d.phone || d.company ? findDuplicatesFor(d, leads) : []), [d, leads]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const sellers = team.filter((t) => ["admin", "sales"].includes(t.role));

  const submit = () => {
    if (!d.name.trim() || !d.company.trim()) return toast("Name and company are required", undefined, "warning");
    const { dealValue, customFields, ...rest } = d;
    const cf = Object.fromEntries(Object.entries(customFields).filter(([, v]) => v !== ""));
    const lead = addLead({ ...rest, linkedin: d.linkedin || undefined, instagram: d.instagram || undefined, website: d.website || undefined, dealValue: Number(dealValue) || undefined, customFields: Object.keys(cf).length ? cf : undefined });
    toast("Lead added", `${lead.company} — AI research started`, "ai");
    setD(empty(me));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add lead" subtitle="AI research and scoring run automatically when the lead is saved." size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save lead</Button></>}>
      {dups.length > 0 && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          <p className="font-medium">Possible duplicate{dups.length > 1 ? "s" : ""} already in the CRM:</p>
          <ul className="mt-1 space-y-0.5">
            {dups.map(({ lead, reasons }) => (
              <li key={lead.id}><Link href={`/leads/${lead.id}`} className="underline" onClick={onClose}>{lead.name} · {lead.company}</Link> <span className="opacity-80">({reasons.join(", ")} · {lead.status})</span></li>
            ))}
          </ul>
          <p className="mt-1 opacity-80">You can still save — merge later from Leads → Duplicates.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><Input value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Company / brand *"><Input value={d.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Job title"><Input value={d.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Website"><Input value={d.website} placeholder="https://" onChange={(e) => set("website", e.target.value)} /></Field>
        <Field label="LinkedIn"><Input value={d.linkedin} onChange={(e) => set("linkedin", e.target.value)} /></Field>
        <Field label="Instagram"><Input value={d.instagram} placeholder="@handle" onChange={(e) => set("instagram", e.target.value)} /></Field>
        <Field label="Location"><Input value={d.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Industry">
          <Select value={d.industry} onChange={(e) => set("industry", e.target.value)}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</Select>
        </Field>
        <Field label="Company size">
          <Select value={d.companySize} onChange={(e) => set("companySize", e.target.value as CompanySize)}>{SIZES.map((i) => <option key={i}>{i}</option>)}</Select>
        </Field>
        <Field label="Lead source">
          <Select value={d.source} onChange={(e) => set("source", e.target.value as LeadSource)}>{LEAD_SOURCES.map((i) => <option key={i}>{i}</option>)}</Select>
        </Field>
        <Field label="Assigned salesperson">
          <Select value={d.ownerId} onChange={(e) => set("ownerId", e.target.value)}>{sellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        </Field>
        <Field label="Expected deal value (₹)"><Input type="number" value={d.dealValue} placeholder="e.g. 150000" onChange={(e) => set("dealValue", e.target.value)} /></Field>
        {customDefs.map((def) => (
          <Field key={def.key} label={def.label}>
            <CustomFieldInput def={def} value={d.customFields[def.key] ?? ""} onChange={(v) => set("customFields", { ...d.customFields, [def.key]: v })} />
          </Field>
        ))}
        <Field label="Potential services" className="sm:col-span-2"><ServicePicker value={d.services} onChange={(v) => set("services", v)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------------- Import ----------------
const TARGETS: { key: keyof Lead | "skip"; label: string; guess: RegExp }[] = [
  { key: "name", label: "Name", guess: /^(full.?)?name$|contact|person/i },
  { key: "company", label: "Company", guess: /company|brand|organi[sz]ation|business/i },
  { key: "jobTitle", label: "Job title", guess: /title|designation|role|position/i },
  { key: "email", label: "Email", guess: /e-?mail/i },
  { key: "phone", label: "Phone", guess: /phone|mobile|whatsapp|contact.?no/i },
  { key: "linkedin", label: "LinkedIn", guess: /linkedin/i },
  { key: "instagram", label: "Instagram", guess: /insta/i },
  { key: "website", label: "Website", guess: /web|site|url|domain/i },
  { key: "location", label: "Location", guess: /city|location|country|region|address/i },
  { key: "industry", label: "Industry", guess: /industry|category|sector|vertical/i },
  { key: "companySize", label: "Company size", guess: /size|employees|headcount/i },
  { key: "source", label: "Lead source", guess: /source|channel/i },
  { key: "notes", label: "Notes", guess: /note|comment|remark/i },
];

const normSize = (v: string): CompanySize => {
  const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
  if (SIZES.includes(v as CompanySize)) return v as CompanySize;
  if (!n) return "11-50";
  return n <= 10 ? "1-10" : n <= 50 ? "11-50" : n <= 200 ? "51-200" : n <= 1000 ? "201-1000" : "1000+";
};
const normSource = (v: string): LeadSource => (LEAD_SOURCES.find((s) => s.toLowerCase() === v.toLowerCase()) ?? "Cold List") as LeadSource;

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importLeads = useCRM((s) => s.importLeads);
  const me = useCRM((s) => s.currentUserId);
  const team = useCRM((s) => s.team);
  const [file, setFile] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, string>>({});
  const [owner, setOwner] = useState(me);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [drag, setDrag] = useState(false);

  const reset = () => { setFile(""); setHeaders([]); setRows([]); setMap({}); setResult(null); };
  const close = () => { reset(); onClose(); };

  const load = (hs: string[], data: string[][], name: string) => {
    setFile(name);
    setHeaders(hs);
    setRows(data.filter((r) => r.some((c) => c && c.trim())));
    const used = new Set<string>();
    const m: Record<number, string> = {};
    hs.forEach((h, i) => {
      const t = TARGETS.find((t) => !used.has(t.key) && t.guess.test(h.trim()));
      if (t) { used.add(t.key); m[i] = t.key; } else m[i] = "skip";
    });
    setMap(m);
  };

  const onFile = async (f: File) => {
    setResult(null);
    try {
      if (/\.xlsx?$/i.test(f.name)) {
        const data = await readSheet(f);
        const str = data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c))));
        load(str[0] ?? [], str.slice(1), f.name);
      } else {
        Papa.parse<string[]>(f, {
          skipEmptyLines: true,
          complete: (res) => load(res.data[0] ?? [], res.data.slice(1), f.name),
          error: () => toast("Could not parse CSV", undefined, "warning"),
        });
      }
    } catch {
      toast("Could not read file", "Use .csv or .xlsx", "warning");
    }
  };

  const mapped = useMemo(() => {
    return rows.map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((_, i) => { const k = map[i]; if (k && k !== "skip") o[k] = (r[i] ?? "").trim(); });
      return o;
    });
  }, [rows, headers, map]);

  const run = () => {
    const leads = mapped.map((o) => ({
      name: o.name || "",
      company: o.company || o.name || "",
      jobTitle: o.jobTitle || "",
      email: o.email || "",
      phone: o.phone || "",
      linkedin: o.linkedin || undefined,
      instagram: o.instagram || undefined,
      website: o.website ? (o.website.startsWith("http") ? o.website : `https://${o.website}`) : undefined,
      location: o.location || "",
      industry: o.industry || "Other",
      companySize: normSize(o.companySize || ""),
      source: normSource(o.source || ""),
      ownerId: owner,
      notes: o.notes || "",
    }));
    const r = importLeads(leads);
    setResult(r);
    toast("Import complete", `${r.added} added · ${r.skipped} skipped`);
  };

  const hasName = Object.values(map).includes("name");

  return (
    <Modal open={open} onClose={close} size="xl" title="Import leads" subtitle="Upload CSV or Excel (.xlsx). Columns are auto-mapped; duplicates by email are skipped."
      footer={result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" disabled={!rows.length || !hasName} onClick={run}>Import {rows.length.toLocaleString()} leads</Button></>}>
      {result ? (
        <div className="py-8 text-center">
          <p className="text-3xl font-semibold">{result.added.toLocaleString()}</p>
          <p className="text-sm text-fg-3">leads imported · {result.skipped} skipped (duplicate email or missing name)</p>
          <p className="mt-3 text-xs text-fg-3">Imported leads were scored instantly. Run AI research from the Leads or AI Research page.</p>
        </div>
      ) : !rows.length ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
          <Upload className="mb-2 size-6 text-fg-3" />
          <p className="text-sm font-medium">Drop a file here or click to browse</p>
          <p className="mt-1 text-xs text-fg-3">.csv, .xlsx — up to thousands of rows. First row must contain headers.</p>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <FileSpreadsheet className="size-4 text-fg-3" />
            <span className="font-medium">{file}</span>
            <Badge>{rows.length.toLocaleString()} rows</Badge>
            <button className="text-xs text-accent-text hover:underline" onClick={reset}>Choose another file</button>
            <span className="ml-auto flex items-center gap-2 text-xs text-fg-3">
              Assign to
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-40">
                {team.filter((t) => ["admin", "sales"].includes(t.role)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </span>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-fg-2">Column mapping</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={h}>{h || `Column ${i + 1}`}</span>
                  <span className="text-fg-3">→</span>
                  <Select value={map[i] ?? "skip"} onChange={(e) => setMap((m) => ({ ...m, [i]: e.target.value }))} className="w-36">
                    <option value="skip">Skip</option>
                    {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            {!hasName && <p className="mt-2 text-xs text-danger">Map at least one column to “Name”.</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-fg-2">Preview (first 5 rows)</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <thead><tr>{TARGETS.filter((t) => Object.values(map).includes(t.key)).map((t) => <Th key={t.key}>{t.label}</Th>)}</tr></thead>
                <tbody>
                  {mapped.slice(0, 5).map((o, i) => (
                    <tr key={i}>{TARGETS.filter((t) => Object.values(map).includes(t.key)).map((t) => <Td key={t.key} className="max-w-48 truncate">{o[t.key]}</Td>)}</tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
