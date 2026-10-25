"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { ACCEPTED_EXTENSIONS, detectCompany, gridToTable, MAX_PAYLOAD_BYTES, type ReportFileKind, type ReportTable } from "@/lib/domain/reportFiles";
import { Badge, Button, Input, Modal, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn } from "@/lib/utils";
import { parseReportFile, UnsupportedFileError } from "./parseReportFile";
import { saveUpload, uploadPayload, UploadsApiError } from "./uploadsApi";

export const KIND_LABEL: Record<ReportFileKind, string> = { excel: "Excel", csv: "CSV", pptx: "PPT" };

// Upload an Excel / CSV / PowerPoint file for a client. The file is read in the browser (every sheet,
// every slide table and chart), previewed, and the chosen tables are saved to the database.
export function ReportUploadModal({ onClose, companies, defaultCompany, uploadedBy, onSaved }: { onClose: () => void; companies: string[]; defaultCompany?: string; uploadedBy: string; onSaved: (fileId: string) => void }) {
  const [companyName, setCompanyName] = useState(defaultCompany ?? "");
  const [file, setFile] = useState<{ name: string; size: number; kind: ReportFileKind; tables: ReportTable[]; originalBase64: string } | null>(null);
  const [preview, setPreview] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);

  const onFile = async (f: File) => {
    setReading(true);
    setFile(null);
    try {
      if (f.size > MAX_PAYLOAD_BYTES) throw new Error("This file exceeds the upload limit. Split the workbook before uploading.");
      const { kind, tables } = await parseReportFile(f);
      const originalBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not preserve the original file"));
        reader.readAsDataURL(f);
      });
      setFile({ name: f.name, size: f.size, kind, tables, originalBase64 });
      const detected = detectCompany(tables);
      if (detected) setCompanyName(detected);
      setPreview(0);
    } catch (e) {
      if (e instanceof UnsupportedFileError) toast(e.message, e.hint, "error");
      else toast("Could not read file", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!file) return;
    const body = uploadPayload({ companyName: companyName.trim(), name: file.name, kind: file.kind, size: file.size, uploadedBy, tables: file.tables, originalBase64: file.originalBase64 });
    const bytes = new TextEncoder().encode(body).length;
    if (bytes > MAX_PAYLOAD_BYTES) return toast("File is too large to save", `The original file and parsed data require ${(bytes / 1e6).toFixed(1)} MB; the limit is ${MAX_PAYLOAD_BYTES / 1e6} MB. Split the workbook. No data has been saved.`, "error");
    setSaving(true);
    try {
      const id = await saveUpload(body);
      toast("Report saved", `${file.name} · ${file.tables.length} table(s)`);
      onSaved(id);
      onClose();
    } catch (e) {
      toast("Report not saved", e instanceof UploadsApiError ? e.message : undefined, "error");
    } finally {
      setSaving(false);
    }
  };

  const shown = file?.tables[preview];
  const remap = (header: number | null) => setFile((f) => {
    if (!f) return f;
    const t = f.tables[preview];
    const mapped = gridToTable(t.name, t.rawRows ?? [t.columns, ...t.rows], header);
    return mapped ? { ...f, tables: f.tables.map((x, i) => i === preview ? mapped : x) } : f;
  });

  return (
    <Modal open onClose={() => !saving && onClose()} size="xl" title="Upload report file" subtitle="No fixed template required. Review the company and each sheet's header interpretation. All sheets and original file contents are preserved."
      footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} disabled={!file || !companyName.trim()} onClick={save}>Save all {file?.tables.length ?? ""} tables</Button></>}>
      {!file ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2", reading && "pointer-events-none opacity-60")}>
          <Upload className="mb-2 size-6 text-fg-3" />
          <p className="text-sm font-medium">{reading ? "Reading file…" : "Drop a file here or click to browse"}</p>
          <p className="mt-1 text-xs text-fg-3">.xlsx, .csv or .pptx</p>
          <input type="file" accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <FileSpreadsheet className="size-4 text-fg-3" />
            <span className="font-medium">{file.name}</span>
            <Badge>{KIND_LABEL[file.kind]}</Badge>
            <Badge>{file.tables.length} table{file.tables.length === 1 ? "" : "s"}</Badge>
            <button className="text-xs text-accent-text hover:underline" disabled={saving} onClick={() => setFile(null)}>Choose another file</button>
            <span className="ml-auto flex items-center gap-2 text-xs text-fg-3">
              Company / report owner
              <Input aria-label="Company name" list="report-companies" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter company name" className="w-48" maxLength={300} disabled={saving} />
              <datalist id="report-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
            </span>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-fg-2">{file.kind === "pptx" ? "Tables and charts found" : "Sheets found"}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {file.tables.map((t, i) => (
                <li key={i} onClick={() => setPreview(i)} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]", preview === i ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
                  <span className="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-fg-3">{t.rows.length.toLocaleString()} × {t.columns.length}</span>
                </li>
              ))}
            </ul>
          </div>

          {shown && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <span>Header interpretation</span>
                <Select aria-label="Header interpretation" disabled={saving} value={shown.headerRow == null ? "none" : "row"} onChange={(e) => remap(e.target.value === "none" ? null : 0)}><option value="none">No header row — keep every row as data</option><option value="row">Use a worksheet row as headers</option></Select>
                {shown.headerRow != null && <label className="flex items-center gap-2">Row <Input aria-label="Header row number" disabled={saving} type="number" className="w-24" min={1} max={shown.rawRows?.length ?? 1} value={shown.headerRow + 1} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= (shown.rawRows?.length ?? 1)) remap(n - 1); }} /></label>}
              </div>
              <p className="mb-3 text-xs text-fg-3">Header detection is a suggestion. For multiple tables or complex headers, select no header row to retain the whole sheet as a grid. Preambles, blank cells and formulas remain in the preserved original file.</p>
              <p className="mb-2 text-xs text-fg-2">Preview · <b className="font-medium">{shown.name}</b> · first {Math.min(5, shown.rows.length)} of {shown.rows.length.toLocaleString()} rows</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <thead><tr>{shown.columns.map((c, i) => <Th key={i}>{c}</Th>)}</tr></thead>
                  <tbody className="tabular-nums">
                    {shown.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((v, j) => <Td key={j} className="max-w-56 truncate whitespace-nowrap">{v ?? ""}</Td>)}</tr>)}
                    {!shown.rows.length && <tr><Td colSpan={shown.columns.length} className="text-center text-xs text-fg-3">Headers only, no rows</Td></tr>}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
