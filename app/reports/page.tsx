"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Database, FileSpreadsheet, FileText, Presentation, RefreshCw, Trash2, Upload } from "lucide-react";
import { useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { tableToCSV, type ReportFileDetail, type ReportFileSummary } from "@/lib/domain/reportFiles";
import { cn, downloadFile, fmtDate, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, Tabs } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { KIND_LABEL, ReportUploadModal } from "@/components/reports/ReportUpload";
import { UploadedTable } from "@/components/reports/UploadedTable";
import { deleteUpload, getUpload, listUploads } from "@/components/reports/uploadsApi";

const KIND_ICON = { excel: FileSpreadsheet, csv: FileText, pptx: Presentation };

function ReportsInner() {
  const me = useMe();
  const params = useSearchParams();
  const writable = can(me.role, "reports", "write") && me.role !== "client";
  const [files, setFiles] = useState<ReportFileSummary[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [fileId, setFileId] = useState(() => params.get("file") ?? "");
  const [tableId, setTableId] = useState("");
  const [detail, setDetail] = useState<ReportFileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setFiles(await listUploads()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load reports"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let live = true;
    listUploads().then((items) => { if (live) setFiles(items); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Could not load reports"); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const companies = useMemo(() => [...new Map(files.map((f) => [f.clientId, f.companyName])).entries()], [files]);
  const visibleFiles = companyId ? files.filter((f) => f.clientId === companyId) : files;
  const selected = visibleFiles.find((f) => f.id === fileId) ?? visibleFiles[0];
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    getUpload(selectedId).then((f) => { if (live) { setDetail(f); setDetailError(""); } }).catch((e) => { if (live) setDetailError(e instanceof Error ? e.message : "Could not open report"); });
    return () => { live = false; };
  }, [selectedId, retry]);
  const shown = detail?.id === selectedId ? detail : null;
  const table = shown?.tables.find((t) => t.id === tableId) ?? shown?.tables[0];

  const remove = async (f: ReportFileSummary) => {
    if (!window.confirm(`Delete "${f.name}" and all its tables?`)) return;
    try {
      await deleteUpload(f.id);
      if (f.id === selectedId) { setFileId(""); setDetail(null); }
      setCompanyId("");
      await refresh();
      toast("Report deleted", f.name);
    } catch (e) { toast("Could not delete report", e instanceof Error ? e.message : undefined, "error"); }
  };

  return (
    <div>
      <style>{`@media print{aside,header,.no-print{display:none!important}main{padding:0!important;max-width:none!important}.lg\\:pl-60{padding-left:0!important}body{background:#fff!important}}`}</style>
      <PageHeader title="Reports" description="Your uploaded workbooks, transformed into reports. Companies, metrics and charts come only from saved uploads."
        actions={<div className="no-print flex flex-wrap gap-2">
          <Button icon={<RefreshCw className="size-3.5" />} disabled={loading} onClick={() => void refresh()}>Refresh</Button>
          {writable && <Button variant="primary" disabled={loading || !!error} icon={<Upload className="size-3.5" />} onClick={() => setUploadOpen(true)}>Upload file</Button>}
          <Button disabled={!shown} onClick={() => window.print()}>Print / PDF</Button>
          <Button disabled={!table} onClick={() => { if (table && shown) downloadFile(`${shown.name}-${table.name}.csv`, tableToCSV(table), "text/csv"); }}>Export sheet CSV</Button>
        </div>} />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Company filter" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setFileId(""); setTableId(""); setDetailError(""); }}>
          <option value="">All uploaded companies</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <span className="text-xs text-fg-3">{visibleFiles.length} uploaded files · {companies.length} companies</span>
      </div>
      {loading ? <Card><EmptyState title="Loading saved reports…" icon={<Database className="size-5" />} /></Card>
        : error ? <Card><EmptyState title="Could not load reports" description={error} action={<Button onClick={() => void refresh()}>Try again</Button>} /></Card>
        : !visibleFiles.length ? <Card><EmptyState icon={<Upload className="size-5" />} title="No uploaded reports yet" description="Upload an Excel workbook, CSV or PowerPoint file. Review its headers and company name, then save it to generate a report. No demo data is used."
          action={writable && <Button variant="primary" onClick={() => setUploadOpen(true)}>Upload your first report</Button>} /></Card>
        : <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="no-print h-fit"><CardHeader title="Uploaded reports" /><ul className="space-y-1 px-2 pb-2">{visibleFiles.map((f) => {
            const Icon = KIND_ICON[f.kind];
            return <li key={f.id} className={cn("group flex items-start gap-2 rounded-lg p-2", selectedId === f.id ? "bg-accent-soft" : "hover:bg-surface-2")}>
              <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => { setFileId(f.id); setTableId(""); setDetailError(""); }}>
                <Icon className="mt-1 size-4 shrink-0 text-fg-3" /><span className="min-w-0"><span className="block truncate text-sm font-medium" title={f.name}>{f.name}</span><span className="block truncate text-xs text-fg-2">{f.companyName}</span><span className="text-[11px] text-fg-3">{f.tables.length} sheets / tables · {fmtDate(f.createdAt)}</span></span>
              </button>
              {writable && <button aria-label={`Delete ${f.name}`} className="rounded p-1 text-fg-3 hover:text-danger" onClick={() => void remove(f)}><Trash2 className="size-3.5" /></button>}
            </li>;
          })}</ul></Card>
          <div className="min-w-0 space-y-4">
            {selected && <div><div className="mb-1 flex items-center gap-2"><Badge>{selected.companyName}</Badge><Badge>{KIND_LABEL[selected.kind]}</Badge></div><h2 className="text-lg font-semibold">{selected.name}</h2><p className="text-xs text-fg-3">Uploaded {fmtDateTime(selected.createdAt)} · {selected.tables.length} sheets / tables · saved in database</p></div>}
            {detailError ? <Card><EmptyState title="Could not open report" description={detailError} action={<Button onClick={() => { setDetailError(""); setRetry((n) => n + 1); }}>Retry</Button>} /></Card>
              : !shown ? <Card><EmptyState title="Opening report…" /></Card>
              : <>
                <Card className="p-4"><p className="text-sm font-semibold">Workbook overview</p><p className="mt-1 text-sm text-fg-2">{shown.tables.length} sheets / tables with {shown.tables.reduce((n, t) => n + t.rows.filter((r) => r.some((v) => v != null)).length, 0).toLocaleString()} populated data rows. Select a sheet to explore its metrics, charts and source data.</p><p className="mt-2 text-xs text-fg-3">Source: {shown.name}. Summaries use only the selected sheet; no campaign targets, previous periods or recommendations are assumed.</p></Card>
                {shown.tables.length > 1 && <div className="no-print"><Tabs value={table?.id ?? ""} onChange={setTableId} tabs={shown.tables.map((t) => ({ value: t.id, label: t.name, count: t.rows.length }))} /></div>}
                {table && <UploadedTable key={table.id} table={table} fileName={shown.name} />}
              </>}
          </div>
        </div>}
      {uploadOpen && <ReportUploadModal onClose={() => setUploadOpen(false)} companies={companies.map(([, name]) => name)} defaultCompany={companies.find(([id]) => id === companyId)?.[1]} uploadedBy={me.name} onSaved={(id) => { setCompanyId(""); setFileId(id); setTableId(""); setDetailError(""); void refresh(); }} />}
    </div>
  );
}

export default function ReportsPage() { return <Suspense><ReportsInner /></Suspense>; }
