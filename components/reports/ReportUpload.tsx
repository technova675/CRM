"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { ACCEPTED_EXTENSIONS, detectCompany, gridToTable, type ReportFileKind, type ReportTable } from "@/lib/domain/reportFiles";
import { Badge, Button, Input, Modal, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn } from "@/lib/utils";
import { parseReportFile, UnsupportedFileError } from "./parseReportFile";
import { transferReport } from "./transferUpload";
import { validateUploadSize } from "@/lib/domain/reportTransfer";
import { isMissingCell, reportView } from "@/lib/domain/reportView";

export const KIND_LABEL: Record<ReportFileKind, string> = { excel: "Excel", csv: "CSV", pptx: "PPT", pdf: "PDF" };

// Upload an Excel / CSV / PowerPoint / PDF file for a client. The file is read in the browser (every sheet,
// every slide table and chart), previewed, and the chosen tables are saved to the database.
export function ReportUploadModal({ onClose, companies, defaultCompany, uploadedBy, onSaved }: { onClose: () => void; companies: string[]; defaultCompany?: string; uploadedBy: string; onSaved: (fileId: string) => void }) {
  const [companyName, setCompanyName] = useState(defaultCompany ?? "");
  const [file, setFile] = useState<{ name: string; size: number; kind: ReportFileKind; tables: ReportTable[]; originalFile: File } | null>(null);
  const [preview, setPreview] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const [readError, setReadError] = useState("");

  const onFile = async (f: File) => {
    setReading(true);
    setReadError("");
    setFile(null);
    try {
      validateUploadSize(f.size);
      const { kind, tables } = await parseReportFile(f);
      setFile({ name: f.name, size: f.size, kind, tables, originalFile: f });
      const detected = detectCompany(tables);
      if (detected) setCompanyName(detected);
      setPreview(0);
    } catch (e) {
      setReadError(e instanceof UnsupportedFileError ? `${e.message}. ${e.hint}` : e instanceof Error ? e.message : "The file could not be read. Nothing has been imported.");
      if (e instanceof UnsupportedFileError) toast(e.message, e.hint, "error");
      else toast("Could not read file", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    setUploadProgress(0);
    try {
      const id = await transferReport(file.originalFile, { companyName: companyName.trim(), kind: file.kind, uploadedBy, tables: file.tables }, setUploadProgress);
      toast("Report saved", `${file.name} · ${file.tables.length} table(s)`);
      onSaved(id);
      onClose();
    } catch (e) {
      toast("Report not saved", e instanceof Error ? e.message : undefined, "error");
    } finally {
      setSaving(false);
    }
  };

  const shown = file?.tables[preview];
  const cleanPreview = shown ? reportView(shown) : null;
  const remap = (header: number | null) => setFile((f) => {
    if (!f) return f;
    const t = f.tables[preview];
    const mapped = gridToTable(t.name, t.rawRows ?? [t.columns, ...t.rows], header);
    return mapped ? { ...f, tables: f.tables.map((x, i) => i === preview ? mapped : x) } : f;
  });

  return (
    <Modal open onClose={() => !saving && onClose()} size="xl" title="Upload report file" subtitle="No fixed template required. Review the company and each sheet's header interpretation. All sheets and original file contents are preserved."
      footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} disabled={reading || !file || !companyName.trim()} onClick={save}>{saving ? `Uploading ${uploadProgress}%` : `Save ${file?.tables.length === 1 ? "1 table" : `all ${file?.tables.length ?? ""} tables`}`}</Button></>}>
      {saving && <div className="mb-4 space-y-2" role="status"><p className="text-xs text-fg-2">{uploadProgress < 95 ? "Uploading file and worksheet data" : "Finishing report"} · {uploadProgress}%</p><progress aria-label="Report upload progress" value={uploadProgress} max={100} className="h-2 w-full accent-accent" /></div>}
      {readError && <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm leading-6 text-fg"><p className="font-semibold">Import needs attention</p><p className="mt-1">{readError}</p></div>}
      {!file ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2", reading && "pointer-events-none opacity-60")}>
          {reading ? <Loader2 className="mb-2 size-6 text-accent-text motion-safe:animate-spin" aria-hidden="true" /> : <Upload className="mb-2 size-6 text-fg-3" />}
          <p className="text-sm font-medium">{reading ? "Reading your file…" : "Drop a file here or click to browse"}</p>
          {reading && <p role="status" className="mt-1 text-xs text-fg-2">Large files can take a few seconds. Nothing is saved until you press Save.</p>}
          <p className="mt-1 text-xs text-fg-3">.xlsx, .csv, .pptx or .pdf · up to 200 MB per file</p>
          <p className="mt-2 text-xs text-fg-2">Up to 60 sheets, 200 columns and 50,000 source rows per sheet</p>
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
            <p className="mb-2 text-xs font-medium text-fg-2">{file.kind === "pptx" ? "Tables and charts found" : file.kind === "pdf" ? "Tables and text found" : "Sheets found"}</p>
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
                <Select aria-label="Header interpretation" disabled={saving} value={shown.headerRow == null ? "none" : "row"} onChange={(e) => remap(e.target.value === "none" ? null : 0)}><option value="none">No header row — keep every row as data</option><option value="row">Use a row as headers</option></Select>
                {shown.headerRow != null && <label className="flex items-center gap-2">Row <Input aria-label="Header row number" disabled={saving} type="number" className="w-24" min={1} max={shown.rawRows?.length ?? 1} value={shown.headerRow + 1} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 0 && n <= (shown.rawRows?.length ?? 1)) remap(n - 1); }} /></label>}
              </div>
              {file.kind === "pdf" && <p className="mb-3 rounded-lg bg-info-soft p-3 text-xs leading-6 text-fg">PDF tables are recovered from the page layout, so check each one in the preview before saving. Text-based PDFs only: scanned pages are not read, and charts or images are not extracted. If no table is found, the page text is imported instead.</p>}
              <p className="mb-3 text-xs leading-6 text-fg-2">Header detection is a suggestion. Check the selected row before saving. The clean preview hides fully empty rows and columns; original cells are preserved. Missing values are labeled, never replaced with zero.</p>
              {file.kind === "excel" && <p className="mb-3 rounded-lg bg-info-soft p-3 text-xs leading-6 text-fg">All worksheet cell data is read, including saved formula results. This reader does not calculate formulas or render Excel charts, images, formatting or macros. Formula cells without saved results and Excel errors block the import with a cell location. Merged cells may leave empty positions; values are not copied into them.</p>}
              <p className="mb-2 text-xs text-fg-2">Preview · <b className="font-medium">{shown.name}</b> · first {Math.min(5, cleanPreview?.rows.length ?? 0)} of {cleanPreview?.rows.length.toLocaleString()} populated rows · {cleanPreview?.hiddenRows} empty rows / {cleanPreview?.hiddenColumns} empty columns hidden</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <thead><tr>{cleanPreview?.columns.map((c, i) => <Th key={i}>{c}</Th>)}</tr></thead>
                  <tbody className="tabular-nums">
                    {cleanPreview?.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((v, j) => <Td key={j} className="max-w-56 truncate whitespace-nowrap">{isMissingCell(v) ? <span className="italic text-fg-2">Not provided</span> : v}</Td>)}</tr>)}
                    {!cleanPreview?.rows.length && <tr><Td colSpan={Math.max(1, shown.columns.length)} className="text-center text-xs text-fg-2">This worksheet has no populated data rows. Review the header selection or choose another sheet.</Td></tr>}
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
