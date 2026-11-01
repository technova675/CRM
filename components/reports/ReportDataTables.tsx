"use client";

import { useState } from "react";
import { Table2 } from "lucide-react";
import type { ReportFileDetail } from "@/lib/domain/reportFiles";
import { cn } from "@/lib/utils";
import { UploadedTable } from "./UploadedTable";

// The uploaded data as tables (search, sort, export), shown under the dashboard. Colours come from the theme
// variables, so it follows the page theme or the dark-blue overview it is placed inside.
export function ReportDataTables({ file, showAll }: { file: ReportFileDetail; showAll: boolean }) {
  const [active, setActive] = useState(0);
  const part = file.kind === "pptx" ? "slide table" : file.kind === "pdf" ? "table" : "sheet";
  const shown = showAll ? file.tables : [file.tables[Math.min(active, file.tables.length - 1)]];
  return <section aria-label="Data tables" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h3 className="flex items-center gap-2 text-base font-semibold"><Table2 className="size-4 text-accent-text" aria-hidden="true" />Data</h3>
        <p className="mt-1 text-xs text-fg-3">Every row from {file.name}, as uploaded. Search, sort and export each {part}.</p></div>
    </div>
    {file.tables.length > 1 && !showAll && <div role="tablist" aria-label="Data sheets" className="flex gap-1.5 overflow-x-auto pb-1 print:hidden">
      {file.tables.map((table, i) => <button key={table.id} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
        className={cn("flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition", i === active ? "border-accent bg-accent-soft text-fg" : "border-border text-fg-3 hover:text-fg-2")}>
        <span className="max-w-48 truncate" title={table.name}>{table.name}</span><span className="text-[11px] tabular-nums text-fg-3">{table.rows.length.toLocaleString()}</span>
      </button>)}
    </div>}
    {shown.map((table) => <div key={table.id} className="space-y-2">
      {showAll && <h4 className="text-sm font-semibold">{table.name}</h4>}
      <UploadedTable dataOnly table={table} fileName={file.name} />
    </div>)}
  </section>;
}
