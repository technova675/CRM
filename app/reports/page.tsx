"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, FileSpreadsheet, FileText, Presentation, Printer, RefreshCw, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ClientReporting } from "@/components/reports/ClientReporting";
import { ReportAccount } from "@/components/reports/ReportAccount";
import { type ReportFileDetail, type ReportFileKind, type ReportFileSummary } from "@/lib/domain/reportFiles";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { KIND_LABEL, ReportUploadModal } from "@/components/reports/ReportUpload";
import { WorkbookDashboard } from "@/components/reports/WorkbookDashboard";
import { ReportLoader } from "@/components/reports/ReportLoader";
import { latestCompanyReport } from "@/lib/domain/workbookDashboard";
import { deleteUpload, getUpload, listUploads } from "@/components/reports/uploadsApi";

const KIND_ICON: Record<ReportFileKind, typeof FileSpreadsheet> = { excel: FileSpreadsheet, csv: FileSpreadsheet, pptx: Presentation, pdf: FileText };
const PART_NAME: Record<ReportFileKind, string> = { excel: "sheet", csv: "sheet", pptx: "table", pdf: "table" };

function LoadingDashboard({ name, progress }: { name?: string; progress: { done: number; total: number } | null }) {
  return <div className="space-y-5">
    <ReportLoader title={name ? `Opening ${name}` : "Opening your report"} detail={progress ? "Loading data" : "Reading every sheet and preparing the dashboard"} progress={progress} />
    <div aria-hidden="true" className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[104px] rounded-xl border border-border bg-surface-2 motion-safe:animate-pulse" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><div className="h-72 rounded-xl border border-border bg-surface-2 motion-safe:animate-pulse lg:col-span-2" /><div className="h-72 rounded-xl border border-border bg-surface-2 motion-safe:animate-pulse" /></div>
    </div>
  </div>;
}

function ReportsInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const writable = !!user;
  const [files, setFiles] = useState<ReportFileSummary[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [fileId, setFileId] = useState(() => params.get("file") ?? "");
  const [detail, setDetail] = useState<ReportFileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

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
  const requestedFile = files.find((file) => file.id === fileId);
  const activeCompany = companies.some(([id]) => id === companyId) ? companyId : requestedFile?.clientId || files[0]?.clientId || "";
  const visibleFiles = files.filter((file) => file.clientId === activeCompany);
  const selected = latestCompanyReport(files, activeCompany);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    getUpload(selectedId, (done, total) => { if (live) setProgress({ done, total }); }).then((f) => { if (live) { setDetail(f); setDetailError(""); } }).catch((e) => { if (live) setDetailError(e instanceof Error ? e.message : "Could not open report"); }).finally(() => { if (live) setProgress(null); });
    return () => { live = false; };
  }, [selectedId, retry]);
  const shown = detail?.id === selectedId ? detail : null;

  const remove = async (f: ReportFileSummary) => {
    if (!window.confirm(`Delete "${f.name}" and all its tables?`)) return;
    try {
      await deleteUpload(f.id);
      if (f.id === selectedId) { setFileId(""); setDetail(null); }
      setCompanyId(f.clientId);
      await refresh();
      toast("Report deleted", f.name);
    } catch (e) { toast("Could not delete report", e instanceof Error ? e.message : undefined, "error"); }
  };

  const KindIcon = KIND_ICON[selected?.kind ?? "excel"];
  const tableCount = selected?.tables.length ?? 0;
  return (
    <div className="space-y-5">
      <style>{`@media print{aside,header,.no-print{display:none!important}main{padding:0!important;max-width:none!important}.lg\\:pl-60{padding-left:0!important}body{background:#fff!important}}`}</style>
      <PageHeader
        title="Reports"
        description="Upload an Excel, CSV, PowerPoint or PDF report and read it as one dashboard. No demo data is used."
        actions={<div className="no-print flex flex-wrap items-center gap-2">
          <Button className="min-h-11" variant="primary" href="/reports?view=client">AI Client Reporting</Button>
          <Button loading={loading || (!!selectedId && !shown && !detailError)} icon={<RefreshCw className="size-3.5" aria-hidden="true" />} disabled={loading} onClick={() => { setDetailError(""); setRetry((n) => n + 1); void refresh(); }}>Refresh</Button>
          <Button icon={<Printer className="size-3.5" aria-hidden="true" />} disabled={!shown} onClick={() => window.print()}>Print / PDF</Button>
          {writable && <Button variant="primary" icon={<Upload className="size-3.5" aria-hidden="true" />} onClick={() => setUploadOpen(true)}>Upload report</Button>}
        </div>}
      />
      <ReportAccount onLinked={() => void refresh()} />
      <Card className="no-print flex flex-col gap-x-6 gap-y-3 p-3.5 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2 text-xs font-medium text-fg-3"><span className="flex shrink-0 items-center gap-1.5"><Building2 className="size-3.5" aria-hidden="true" />Company</span>
          <span className="w-full sm:w-56"><Select aria-label="Company" value={activeCompany} disabled={loading || !companies.length} onChange={(event) => { setCompanyId(event.target.value); setFileId(""); setDetailError(""); }} className="text-fg">{!companies.length && <option value="">No companies yet</option>}{companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></span>
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-3 border-border sm:border-l sm:pl-6">
          <span className="rounded-md bg-accent-soft p-1.5 text-accent-text"><KindIcon className="size-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium"><span className="truncate">{selected?.name ?? "No report selected"}</span>{selected && <Badge tone="accent">{KIND_LABEL[selected.kind]}</Badge>}{selected && <Badge tone="success" dot>Latest</Badge>}</p>
            <p className="mt-0.5 text-xs text-fg-3">{selected ? `Uploaded ${fmtDateTime(selected.createdAt)} · ${tableCount} ${PART_NAME[selected.kind]}${tableCount === 1 ? "" : "s"} · ${visibleFiles.length} saved ${visibleFiles.length === 1 ? "report" : "reports"}` : "Upload a report to get started"}</p>
          </div>
        </div>
        {selected && writable && <Button variant="ghost" aria-label={`Delete ${selected.name}`} icon={<Trash2 className="size-3.5" aria-hidden="true" />} onClick={() => void remove(selected)}>Delete</Button>}
      </Card>
      {loading ? <ReportLoader title="Loading your reports" detail="Fetching your saved reports" />
        : error ? <Card><EmptyState title="Could not load reports" description={error} action={<Button onClick={() => void refresh()}>Try again</Button>} /></Card>
        : !visibleFiles.length ? <Card><EmptyState icon={<Upload className="size-5" />} title="No uploaded reports yet" description="Upload an Excel workbook, CSV, PowerPoint or PDF file. Review its headers and company name, then save it to generate a report."
          action={writable && <Button variant="primary" onClick={() => setUploadOpen(true)}>Upload your first report</Button>} /></Card>
        : detailError ? <Card><EmptyState title="Could not open report" description={detailError} action={<Button onClick={() => { setDetailError(""); setRetry((n) => n + 1); }}>Retry</Button>} /></Card>
        : !shown ? <LoadingDashboard name={selected?.name} progress={progress} />
        : <WorkbookDashboard key={shown.id} file={shown} />}
      {uploadOpen && <ReportUploadModal onClose={() => setUploadOpen(false)} companies={companies.map(([, name]) => name)} defaultCompany={companies.find(([id]) => id === activeCompany)?.[1]} uploadedBy={user?.email ?? ""} onSaved={(id) => { setCompanyId(""); setFileId(id); setDetailError(""); void refresh(); }} />}
    </div>
  );
}

function ReportsView() { return useSearchParams().get("view") === "client" ? <ClientReporting /> : <ReportsInner />; }
export default function ReportsPage() { return <Suspense><ReportsView /></Suspense>; }
