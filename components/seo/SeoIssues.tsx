"use client";

import { useMemo, useState } from "react";
import { ListPlus, RefreshCw, Wand2 } from "lucide-react";
import type { SeoIssue, SeoProject } from "@/lib/types";
import { ISSUE_CATEGORIES, ISSUE_SEVERITIES, runAudit, type AuditResult } from "@/lib/ai/seo";
import { useCRM } from "@/lib/store";
import { cn, relTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, InsightList, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { applyIssueFix, createIssueTask, runAuditAction, setIssueStatus } from "./actions";

const SEV_TONE = { Critical: "danger", Warning: "warning", Notice: "neutral" } as const;
const STATUSES: SeoIssue["status"][] = ["Open", "In Progress", "Fixed"];

export function SeoIssues({ project, writable }: { project: SeoProject; writable: boolean }) {
  const mode = useCRM((s) => s.settings.approvalModes["SEO changes"]);
  const [sev, setSev] = useState<SeoIssue["severity"] | "All">("All");
  const [cat, setCat] = useState<SeoIssue["category"] | "All">("All");
  const [status, setStatus] = useState<SeoIssue["status"] | "Unresolved" | "All">("Unresolved");
  const [result, setResult] = useState<AuditResult | null>(null);
  const audit = useMemo(() => runAudit(project), [project]);

  const rows = useMemo(
    () =>
      project.issues
        .filter((i) => (sev === "All" || i.severity === sev) && (cat === "All" || i.category === cat) && (status === "All" || (status === "Unresolved" ? i.status !== "Fixed" : i.status === status)))
        .sort((a, b) => ISSUE_SEVERITIES.indexOf(a.severity) - ISSUE_SEVERITIES.indexOf(b.severity) || b.affectedUrls - a.affectedUrls),
    [project.issues, sev, cat, status],
  );

  const fix = (i: SeoIssue) => {
    const r = applyIssueFix(project, i);
    if (r === "task") toast("Task created", "SEO changes are set to Manual — a human will apply the fix.", "info");
    if (r === "approval") toast("Sent for approval", "Approve in Automations → Approvals to apply the fix.", "info");
    if (r === "done") toast("Fix applied", "SEO changes are set to Automatic — logged in the audit trail.", "ai");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Issues by severity & category"
            subtitle={project.lastAuditAt ? `Last audit ${relTime(project.lastAuditAt)}` : "No audit yet"}
            action={
              writable && (
                <Button
                  size="xs"
                  icon={<RefreshCw className="size-3" />}
                  onClick={() => {
                    setResult(runAuditAction(project.id));
                    toast("Health re-scored", "Based on current issue statuses");
                  }}
                >
                  Re-score health
                </Button>
              )
            }
          />
          <div className="grid grid-cols-3 gap-2 px-4 pb-3">
            {ISSUE_SEVERITIES.map((s) => (
              <button key={s} onClick={() => setSev(sev === s ? "All" : s)} className={cn("rounded-lg border p-2.5 text-left transition", sev === s ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
                <Badge tone={SEV_TONE[s]} dot>{s}</Badge>
                <p className="mt-1 text-xl font-semibold tabular-nums">{audit.bySeverity[s]}</p>
                <p className="text-[11px] text-fg-3">unresolved</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-4">
            {ISSUE_CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCat(cat === c ? "All" : c)} className={cn("rounded-md border px-2 py-1 text-xs", cat === c ? "border-accent bg-accent-soft text-accent-text" : "border-border text-fg-2 hover:bg-surface-2")}>
                {c} <span className="tabular-nums text-fg-3">{audit.byCategory[c]}</span>
              </button>
            ))}
            <span className="ml-auto self-center text-[11px] text-fg-3">{audit.fixed} fixed</span>
          </div>
        </Card>
        <Card>
          <CardHeader title="Audit summary" subtitle="SEO Agent · issue-weighted score" />
          <div className="px-4 pb-4">
            <InsightList items={(result ?? audit).insights} compact />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-40">
            <option value="Unresolved">Unresolved</option>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <p className="text-[11px] text-fg-3 sm:ml-auto">
            AI fixes that change the client&apos;s site follow the <b>SEO changes</b> mode: <Badge tone="accent">{mode}</Badge>
          </p>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={project.issues.length ? "No issues match these filters" : "No crawl data yet"} description={project.issues.length ? undefined : "Connect a site crawler (or run the audit from your SEO tool) to import technical issues."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Issue</Th>
                <Th>Severity</Th>
                <Th>Category</Th>
                <Th className="text-right">URLs</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2">
                  <Td className="min-w-64">
                    <p className={cn("font-medium", i.status === "Fixed" && "text-fg-3 line-through")}>{i.title}</p>
                    <p className="text-xs text-fg-3">{i.fix}</p>
                  </Td>
                  <Td><Badge tone={SEV_TONE[i.severity]} dot>{i.severity}</Badge></Td>
                  <Td className="text-fg-2">{i.category}</Td>
                  <Td className="text-right tabular-nums">{i.affectedUrls}</Td>
                  <Td>
                    {writable ? (
                      <Select className="h-7 w-32 text-xs" value={i.status} onChange={(e) => setIssueStatus(project.id, i.id, e.target.value as SeoIssue["status"])}>
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge>{i.status}</Badge>
                    )}
                  </Td>
                  <Td>
                    {writable && i.status !== "Fixed" && (
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="ghost" icon={<ListPlus className="size-3" />} onClick={() => { createIssueTask(project, i); toast("Task created", i.title); }}>
                          Create task
                        </Button>
                        <Button size="xs" variant="ghost" icon={<Wand2 className="size-3" />} onClick={() => fix(i)} title={`Mode: ${mode}`}>
                          AI fix
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
