"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useCRM } from "@/lib/store";
import { LEAD_SOURCES, LEAD_STATUSES, SERVICES, type CompanySize, type LeadStatus, type LeadSource, type Service } from "@/lib/types";
import { Badge, Button, Field, Input, Modal, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn, downloadFile, toCSV } from "@/lib/utils";
import { importedLead, LEAD_IMPORT_FIELDS, normalizeHeader } from "@/lib/domain/leadImport";
import { CustomFieldInput, findDuplicatesFor } from "./LeadTools";

export const INDUSTRIES = ["D2C / E-commerce", "Real Estate", "Education", "Healthcare", "Hospitality", "Fashion", "Beauty", "SaaS", "Fintech", "Automotive", "Food & Beverage", "Fitness", "Consulting", "Other"];
export const SIZES: CompanySize[] = ["Unknown","1-10", "11-50", "51-200", "201-1000", "1000+"];

type Draft = {
  name: string; company: string; jobTitle: string; email: string; phone: string; linkedin: string; instagram: string; website: string;
  location: string; industry: string; companySize: CompanySize; source: LeadSource; ownerId: string; services: Service[]; notes: string;
  dealValue: string; customFields: Record<string, string>; status: LeadStatus; leadScore: string; tags: string; communicationHistory: string;
};

const empty = (ownerId: string): Draft => ({
  name: "", company: "", jobTitle: "", email: "", phone: "", linkedin: "", instagram: "", website: "", location: "", industry: "Other",
  companySize: "Unknown", status: "New", leadScore: "", tags: "", communicationHistory: "", source: "Website", ownerId, services: [], notes: "", dealValue: "", customFields: {},
});

export function ServicePicker({ value, onChange, ...accessibility }: { value: Service[]; onChange: (v: Service[]) => void; "aria-labelledby"?: string }) {
  return (
    <div {...accessibility} role="group" className="flex flex-wrap gap-1.5">
      {SERVICES.map((s) => {
        const on = value.includes(s);
        return (
          <button key={s} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])} className={cn("min-h-11 rounded-md border px-3 py-2 text-xs transition", on ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>
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
    const { dealValue, customFields, leadScore, tags, ...rest } = d;
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return toast("Enter a valid email", undefined, "warning");
    const initialScore = leadScore.trim() === "" ? undefined : Number(leadScore);
    if (initialScore !== undefined && (!Number.isInteger(initialScore) || initialScore < 0 || initialScore > 100)) return toast("Lead score must be 0–100", undefined, "warning");
    if (dealValue && (!Number.isFinite(Number(dealValue)) || Number(dealValue) < 0)) return toast("Deal value must be non-negative",undefined,"warning");
    const cf = Object.fromEntries(Object.entries(customFields).filter(([, v]) => v !== ""));
    const lead = addLead({ ...rest, name: d.name.trim(), company: d.company.trim(), email: d.email.trim(), initialScore, tags: tags.split(/[;,]/).map(tag => tag.trim().replace(/^#/, "")).filter(Boolean), linkedin: d.linkedin || undefined, instagram: d.instagram || undefined, website: d.website || undefined, dealValue: dealValue.trim() === "" ? undefined : Number(dealValue), customFields: Object.keys(cf).length ? cf : undefined });
    toast("Lead added", `${lead.company} · ${lead.status}`);
    setD(empty(me));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add lead" subtitle="Create a complete lead profile. Scores are calculated automatically; AI research is also available from the lead profile." size="lg"
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
        <Field label="Status"><Select value={d.status} onChange={(e) => set("status", e.target.value as LeadStatus)}>{LEAD_STATUSES.map(status => <option key={status}>{status}</option>)}</Select></Field>
        <Field label="Lead score (0–100)"><Input type="number" min={0} max={100} value={d.leadScore} placeholder="Leave blank to calculate automatically" onChange={(e) => set("leadScore", e.target.value)} /></Field>
        <Field label="Tags"><Input value={d.tags} placeholder="Separate tags with commas" onChange={(e) => set("tags",e.target.value)} /></Field>
        <Field label="Deal value (₹)"><Input type="number" value={d.dealValue} placeholder="e.g. 150000" onChange={(e) => set("dealValue", e.target.value)} /></Field>
        {customDefs.map((def) => (
          <Field key={def.key} label={def.label}>
            <CustomFieldInput def={def} value={d.customFields[def.key] ?? ""} onChange={(v) => set("customFields", { ...d.customFields, [def.key]: v })} />
          </Field>
        ))}
        <Field label="Services required" className="sm:col-span-2"><ServicePicker value={d.services} onChange={(v) => set("services", v)} /></Field>
        <Field label="Communication history" className="sm:col-span-2"><Textarea value={d.communicationHistory} onChange={(e) => set("communicationHistory",e.target.value)} placeholder="Record earlier calls, emails or meetings…" /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ---------------- Import ----------------
const TARGETS = LEAD_IMPORT_FIELDS;

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importLeads = useCRM((s) => s.importLeads);
  const me = useCRM((s) => s.currentUserId);
  const team = useCRM((s) => s.team);
  const customDefs = useCRM((s) => s.settings.leadCustomFields);
  const [issues, setIssues] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [file, setFile] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, string>>({});
  const [owner, setOwner] = useState(me);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [drag, setDrag] = useState(false);

  const reset = () => { setFile(""); setHeaders([]); setRows([]); setMap({}); setResult(null); setIssues([]); };
  const close = () => { reset(); onClose(); };

  const load = (hs: string[], data: string[][], name: string) => {
    setFile(name);
    setHeaders(hs);
    setRows(data.filter((r) => r.some((c) => c && c.trim())));
    const used = new Set<string>();
    const m: Record<number, string> = {};
    hs.forEach((h, i) => {
      const t = TARGETS.find((t) => !used.has(t.key) && (t.aliases as readonly string[]).includes(normalizeHeader(h)));
      if (t) { used.add(t.key); m[i] = t.key; } else { const custom = customDefs.find(def => [def.key,def.label].map(normalizeHeader).includes(normalizeHeader(h))); m[i] = custom ? `custom:${custom.key}` : "skip"; }
    });
    setMap(m);
  };

  const onFile = async (f: File) => {
    setResult(null);
    try {
      if (f.size > 20_000_000) throw new Error("Lead imports support files up to 20 MB. Split a larger list into batches.");
      if (/\.xls$/i.test(f.name)) throw new Error("Save the legacy .xls file as .xlsx or CSV first.");
      if (/\.xlsx$/i.test(f.name)) {
        const data = await readSheet(f);
        const str = data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c))));
        load(str[0] ?? [], str.slice(1), f.name);
      } else {
        Papa.parse<string[]>(f, {
          skipEmptyLines: true,
          complete: (res) => { if (res.errors.length) toast("Could not parse CSV",res.errors[0].message,"warning"); else load(res.data[0] ?? [], res.data.slice(1), f.name); },
          error: () => toast("Could not parse CSV", undefined, "warning"),
        });
      }
    } catch (error) {
      toast("Could not read file", error instanceof Error ? error.message : "Use .csv or .xlsx", "warning");
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
    const failures: string[] = [];
    const valid: ReturnType<typeof importedLead>[] = [];
    mapped.forEach((row,index) => { try { valid.push(importedLead(row,owner,team.filter(member => ["admin","sales"].includes(member.role)))); } catch(error) { failures.push(`Row ${index+2}: ${error instanceof Error ? error.message : "Invalid data"}`); } });
    const imported = importLeads(valid);
    const r = { added: imported.added, skipped: imported.skipped + failures.length };
    setIssues(failures);
    setResult(r);
    toast("Import complete", `${r.added} added · ${r.skipped} skipped`);
  };

  const hasName = Object.values(map).includes("name") && Object.values(map).includes("company");
  const mappedFields = Object.values(map).filter(value => value !== "skip");
  const duplicateMapping = new Set(mappedFields).size !== mappedFields.length;

  return (
    <Modal open={open} onClose={close} size="xl" title="Import leads" subtitle="Import CSV or Excel (.xlsx), or paste a CSV list. Map every lead field; duplicate email addresses and phone numbers are skipped."
      footer={result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" disabled={!rows.length || !hasName || duplicateMapping || rows.length > 10000} onClick={run}>Import {rows.length.toLocaleString()} leads</Button></>}>
      {result ? (
        <div className="py-8 text-center">
          <p className="text-3xl font-semibold">{result.added.toLocaleString()}</p>
          <p className="text-sm text-fg-3">leads imported · {result.skipped} skipped (duplicates or invalid rows)</p>
          {issues.length > 0 && <div className="mx-auto mt-4 max-h-52 max-w-xl overflow-auto rounded-lg border border-border p-3 text-left text-xs"><p className="font-semibold">Rows that need correction</p>{issues.map(issue => <p key={issue} className="mt-1">{issue}</p>)}</div>}
          <p className="mt-3 text-xs text-fg-3">Imported leads were scored instantly. Run AI research from the Leads or AI Research page.</p>
        </div>
      ) : !rows.length ? (
        <div className="space-y-4"><Button icon={<FileSpreadsheet size={15}/>} onClick={() => downloadFile("crm-leads-template.csv",toCSV([{name:"",company:"",website:"",email:"",phone:"",linkedin:"",instagram:"",industry:"",location:"",company_size:"",lead_source:"",services_required:"",assigned_salesperson:"",lead_score:"",status:"New",notes:"",communication_history:"",ai_research:"",deal_value:"",tags:""}]),"text/csv")}>Download CSV template</Button>
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
          <Upload className="mb-2 size-6 text-fg-3" />
          <p className="text-sm font-medium">Drop a file here or click to browse</p>
          <p className="mt-1 text-xs text-fg-3">.csv, .xlsx — up to 20 MB and 10,000 leads per batch. First row must contain headers.</p>
          <input type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        </label><Field label="Or paste a bulk CSV list"><Textarea rows={5} value={paste} onChange={event => setPaste(event.target.value)} placeholder="Name,Company,Email,Phone,Status" /></Field><Button disabled={!paste.trim()} onClick={() => { const parsed=Papa.parse<string[]>(paste,{skipEmptyLines:true}); if(parsed.errors.length)toast("Could not parse CSV",parsed.errors[0].message,"warning");else load(parsed.data[0]??[],parsed.data.slice(1),"Pasted lead list"); }}>Preview pasted leads</Button></div>
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
                    {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}{customDefs.map(def => <option key={def.key} value={`custom:${def.key}`}>Custom: {def.label}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            {duplicateMapping && <p role="alert" className="mt-2 text-xs text-danger">Map each destination field only once to prevent overwriting values.</p>}
            {rows.length > 10000 && <p role="alert" className="mt-2 text-xs text-danger">Split this list into batches of no more than 10,000 leads.</p>}
            {!hasName && <p className="mt-2 text-xs text-danger">Map one column to “Name” and one to “Company”.</p>}
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
