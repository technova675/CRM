"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useCRM } from "@/lib/store";
import { METRIC_TARGETS, METRICS_TEMPLATE_CSV, guessMapping, parseMetricRows, type DateOrder } from "@/lib/domain/metricsImport";
import { Badge, Button, Modal, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn, compactMoney, downloadFile } from "@/lib/utils";

// Upload real ad performance (Excel/CSV) for a client. Rows become campaigns tagged as uploaded
// data, which the Reports page and the Reporting agent can report on separately from demo data.
export function MetricsImportModal({ open, onClose, clients, defaultClientId, onImported }: { open: boolean; onClose: () => void; clients: { id: string; company: string }[]; defaultClientId?: string; onImported: (clientId: string) => void }) {
  const importMetrics = useCRM((s) => s.importMetrics);
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [file, setFile] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<number, string>>({});
  const [dateOrder, setDateOrder] = useState<DateOrder>("auto");
  const [drag, setDrag] = useState(false);

  const reset = () => { setFile(""); setHeaders([]); setRows([]); setMap({}); setDateOrder("auto"); };
  const close = () => { reset(); onClose(); };

  const load = (hs: string[], data: string[][], name: string) => {
    setFile(name);
    setHeaders(hs);
    setRows(data.filter((r) => r.some((c) => c && c.trim())));
    setMap(guessMapping(hs));
  };

  const onFile = async (f: File) => {
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

  const parsed = useMemo(() => parseMetricRows(headers, rows, map, { dateOrder, fallbackCampaign: file.replace(/\.[^.]+$/, "") || "Uploaded data" }), [headers, rows, map, dateOrder, file]);
  const mappedKeys = Object.values(map);
  const missing = METRIC_TARGETS.filter((t) => t.required && !mappedKeys.includes(t.key)).map((t) => t.label);
  const totalSpend = parsed.rows.reduce((a, r) => a + r.spend, 0);

  const run = () => {
    const r = importMetrics(clientId, parsed.rows, file);
    toast("Performance data imported", `${r.days} day(s) · ${r.created} new and ${r.updated} updated campaign(s)`);
    onImported(clientId);
    close();
  };

  return (
    <Modal open={open} onClose={close} size="xl" title="Import performance data" subtitle="Upload a CSV or Excel export with one row per day (per campaign). Columns are auto-mapped; exports from Meta Ads Manager and Google Ads work as they are."
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" disabled={!parsed.rows.length || missing.length > 0 || !clientId} onClick={run}>Import {parsed.rows.length.toLocaleString()} daily rows</Button></>}>
      {!rows.length ? (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center transition", drag ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
            <Upload className="mb-2 size-6 text-fg-3" />
            <p className="text-sm font-medium">Drop a file here or click to browse</p>
            <p className="mt-1 text-xs text-fg-3">.csv, .xlsx — first row must contain headers. Needs a date and a spend column at minimum.</p>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>
          <p className="mt-3 text-xs text-fg-3">
            Not sure about the format?{" "}
            <button className="text-accent-text hover:underline" onClick={() => downloadFile("performance-data-template.csv", METRICS_TEMPLATE_CSV, "text/csv")}>Download the template</button>
            {" "}— Date, Campaign, Platform, Spend, Impressions, Reach, Clicks, Leads, Conversions, Revenue.
          </p>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <FileSpreadsheet className="size-4 text-fg-3" />
            <span className="font-medium">{file}</span>
            <Badge>{rows.length.toLocaleString()} rows</Badge>
            <button className="text-xs text-accent-text hover:underline" onClick={reset}>Choose another file</button>
            <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-fg-3">
              Client
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-44">
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </Select>
              Dates
              <Select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)} className="w-36">
                <option value="auto">Auto-detect</option>
                <option value="dmy">Day / Month / Year</option>
                <option value="mdy">Month / Day / Year</option>
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
                    {METRIC_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}{t.required ? " *" : ""}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {missing.length > 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">Map a column to {missing.join(" and ")} to continue.</p>
          ) : !parsed.rows.length ? (
            <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">No row has a readable date. Check the Date column mapping and the date format.</p>
          ) : (
            <div>
              <p className="mb-2 text-xs text-fg-2">
                <b className="font-medium">{parsed.rows.length.toLocaleString()}</b> daily rows · <b className="font-medium">{parsed.campaigns.length}</b> campaign(s) · {parsed.from} to {parsed.to} · {compactMoney(totalSpend)} spend
                {parsed.skipped > 0 && <span className="text-fg-3"> · {parsed.skipped} row(s) skipped (no readable date, e.g. a totals row)</span>}
                {dateOrder === "auto" && <span className="text-fg-3"> · dates read as {parsed.dateOrder === "dmy" ? "day/month/year" : "month/day/year"}</span>}
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <thead><tr><Th>Date</Th><Th>Campaign</Th><Th>Platform</Th><Th>Spend</Th><Th>Impr.</Th><Th>Clicks</Th><Th>Leads</Th><Th>Conv.</Th><Th>Revenue</Th></tr></thead>
                  <tbody className="tabular-nums">
                    {parsed.rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <Td className="whitespace-nowrap">{r.date}</Td><Td className="max-w-56 truncate">{r.campaign}</Td><Td>{r.platform}</Td>
                        <Td>{r.spend.toLocaleString("en-IN")}</Td><Td>{r.impressions.toLocaleString("en-IN")}</Td><Td>{r.clicks.toLocaleString("en-IN")}</Td><Td>{r.leads}</Td><Td>{r.conversions}</Td><Td>{r.revenue.toLocaleString("en-IN")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <p className="mt-2 text-[11px] text-fg-3">Preview of the first 5 rows. Re-uploading a day for the same campaign replaces that day. Uploaded data is kept separate from demo and platform data.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
