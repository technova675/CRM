"use client";

import { Check, Copy, Download, Mail, Sparkles, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { GeneratedReport } from "@/lib/types";
import { AIBadge, Badge, Button, InsightLegend, InsightList, Modal, Table, Td, Th, type Tone } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { cn, compact, compactMoney, downloadFile, money, pct } from "@/lib/utils";
import { reportHtml } from "./agent";

export const REPORT_STATUS_TONE: Record<NonNullable<GeneratedReport["status"]>, Tone> = { Draft: "neutral", "Awaiting approval": "warning", Approved: "success", Rejected: "danger" };
const PRIORITY_TONE: Record<"High" | "Medium" | "Low", Tone> = { High: "danger", Medium: "warning", Low: "neutral" };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-3">{title}</h3>
      {children}
    </section>
  );
}

// A report written by the Reporting agent: the narrative, the figures it was built from,
// what the agent did, and the approval decision.
export function ReportViewer({ report, onClose }: { report: GeneratedReport; onClose: () => void }) {
  const me = useMe();
  const client = useCRM((s) => s.clients.find((c) => c.id === report.clientId));
  const approval = useCRM((s) => s.approvals.find((a) => a.status === "pending" && a.ref?.type === "report" && a.ref.id === report.id));
  const resolveApproval = useCRM((s) => s.resolveApproval);
  const patch = useCRM((s) => s.patch);
  const r = report.content;
  if (!r) return null;
  const status = report.status ?? "Draft";
  const canDecide = can(me.role, "reports", "write") && me.role !== "client";
  const company = client?.company ?? r.facts.client;
  const t = r.facts.current;
  const d = r.facts.changePct;
  const to = client?.contacts[0]?.email ?? "";

  const kpis: [string, string, number | null | undefined, boolean?][] = [
    ["Spend", compactMoney(t.spend), d?.spend],
    ["Revenue", compactMoney(t.revenue), d?.revenue],
    ["ROAS", `${t.roas.toFixed(2)}x`, d?.roas],
    ["CPA", money(t.cpa), d?.cpa, true],
    ["Leads", compact(t.leads), d?.leads],
    ["Conversions", compact(t.conversions), d?.conversions],
    ["CTR", pct(t.ctr, 2), d?.ctr],
    ["CPC", money(t.cpc), d?.cpc, true],
  ];

  const decide = (approve: boolean) => {
    if (approval) resolveApproval(approval.id, approve);
    else patch("reports", report.id, { status: approve ? "Approved" : "Rejected" }, { entity: "client", action: approve ? "Approved client report" : "Rejected client report", field: "status" });
    toast(approve ? "Report approved" : "Report rejected", approve ? "It is ready to send to the client." : undefined, approve ? "success" : "warning");
  };
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${r.emailSubject}\n\n${r.emailBody}`);
      toast("Email copied");
    } catch {
      toast("Could not copy", undefined, "warning");
    }
  };

  return (
    <Modal open onClose={onClose} size="xl" title={<span className="flex flex-wrap items-center gap-2">{company} <Badge tone={REPORT_STATUS_TONE[status]} dot>{status}</Badge></span>} subtitle={`Performance report · ${report.period}`}
      footer={
        <>
          <Button icon={<Download className="size-3.5" />} onClick={() => { downloadFile(`${company.replace(/\s+/g, "-")}-report.html`, reportHtml(company, report.period, r), "text/html"); toast("Report downloaded", "Open it and print to PDF, or attach it to your email."); }}>Download</Button>
          {status === "Approved" && <Button icon={<Mail className="size-3.5" />} href={`mailto:${to}?subject=${encodeURIComponent(r.emailSubject)}&body=${encodeURIComponent(r.emailBody)}`} external>Open in email app</Button>}
          {canDecide && (status === "Awaiting approval" || status === "Draft") && (
            <>
              <Button variant="ghost" icon={<X className="size-3.5" />} onClick={() => decide(false)}>Reject</Button>
              <Button variant="primary" icon={<Check className="size-3.5" />} onClick={() => decide(true)}>Approve</Button>
            </>
          )}
        </>
      }>
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <AIBadge>{r.mode === "ai" ? "Reporting agent" : "Local engine"}</AIBadge>
            {r.model && <span className="text-[11px] text-fg-3">{r.model}</span>}
          </div>
          <p className="text-base font-semibold">{r.headline}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{r.summary}</p>
          {r.note && <p className="mt-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">{r.note}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpis.map(([label, value, delta, lowerIsBetter]) => (
            <div key={label} className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] text-fg-3">{label}</p>
              <p className="text-base font-semibold tabular-nums">{value}</p>
              {delta != null && <p className={cn("text-[11px] tabular-nums", (lowerIsBetter ? -delta : delta) >= 0 ? "text-success" : "text-danger")}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs previous</p>}
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Block title="Key insights">{r.insights.length ? <InsightList items={r.insights} /> : <p className="text-xs text-fg-3">None.</p>}</Block>
          <Block title="What changed">{r.changes.length ? <InsightList items={r.changes} /> : <p className="text-xs text-fg-3">None.</p>}</Block>
        </div>
        <InsightLegend />

        <div className="grid gap-5 lg:grid-cols-2">
          <Block title="What we recommend next">
            <ul className="space-y-1.5">
              {r.recommendations.map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed"><Badge tone={PRIORITY_TONE[x.priority]} className="w-[64px] shrink-0 justify-center">{x.priority}</Badge><span className="text-fg-2">{x.text}</span></li>
              ))}
            </ul>
          </Block>
          <Block title="Next month's plan">
            <ol className="list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-fg-2">{r.plan.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </Block>
        </div>

        <Block title="Campaign performance">
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <thead><tr><Th>Campaign</Th><Th>Spend</Th><Th>Revenue</Th><Th>Leads</Th><Th>Conv.</Th><Th>CPA</Th><Th>ROAS</Th><Th>ROAS vs prev.</Th></tr></thead>
              <tbody className="tabular-nums">
                {r.facts.campaigns.map((c) => (
                  <tr key={c.name}>
                    <Td><p className="font-medium">{c.name}</p><p className="text-xs text-fg-3">{c.platform}</p></Td>
                    <Td>{compactMoney(c.spend)}</Td><Td>{compactMoney(c.revenue)}</Td><Td>{c.leads}</Td><Td>{c.conversions}</Td><Td>{money(c.cpa)}</Td>
                    <Td className={c.roas >= 3 ? "text-success" : c.roas < 2 ? "text-danger" : ""}>{c.roas.toFixed(2)}x</Td>
                    <Td>{c.roasChangePct === null ? "—" : `${c.roasChangePct >= 0 ? "+" : ""}${c.roasChangePct.toFixed(0)}%`}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="mt-1.5 text-[11px] text-fg-3">All figures are calculated from the campaign data, not by the model.</p>
        </Block>

        <div className="grid gap-5 lg:grid-cols-2">
          <Block title="What the agent did">
            <ol className="space-y-1.5">
              {r.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-fg-2"><Sparkles className="mt-0.5 size-3 shrink-0 text-accent" /><span><code className="rounded bg-surface-2 px-1 py-0.5 text-[11px]">{s.tool}</code> {s.detail}</span></li>
              ))}
            </ol>
          </Block>
          <Block title="Cover email">
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="text-[13px] font-medium">{r.emailSubject}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-fg-2">{r.emailBody}</p>
              <Button size="xs" variant="ghost" className="mt-2" icon={<Copy className="size-3" />} onClick={copyEmail}>Copy email</Button>
            </div>
          </Block>
        </div>
      </div>
    </Modal>
  );
}
