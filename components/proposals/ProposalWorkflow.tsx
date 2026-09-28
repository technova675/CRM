"use client";

import Link from "next/link";
import { Check, CheckCircle2, Eye, FileDown, RotateCcw, Send, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Proposal } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { Badge, Button } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { acceptProposal, approveProposalNow, canSendProposal, markProposalViewed, sendProposal, submitForReview } from "./workflow";

const FLOW = ["Draft", "Internal Review", "Sent", "Viewed", "Accepted"] as const;

export function ProposalStepper({ p }: { p: Proposal }) {
  const idx = p.status === "Rejected" ? 3 : FLOW.indexOf(p.status as (typeof FLOW)[number]);
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {FLOW.map((s, i) => {
        const last = i === FLOW.length - 1;
        const rejected = last && p.status === "Rejected";
        const done = idx >= i || (last && p.status === "Accepted");
        return (
          <div key={s} className={cn("flex items-center gap-1", !last && "flex-1")}>
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold", rejected ? "bg-danger text-white" : done ? "bg-accent text-white" : "bg-surface-3 text-fg-3")}>
              {rejected ? "✕" : done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-[11px]", done || rejected ? "text-fg" : "text-fg-3")}>{rejected ? "Rejected" : last ? "Accepted / Rejected" : s}</span>
            {!last && <span className={cn("h-px min-w-3 flex-1", idx > i ? "bg-accent" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

export function ProposalWorkflow({ proposal: p, canWrite, showPrint = true }: { proposal: Proposal; canWrite: boolean; showPrint?: boolean }) {
  const me = useMe();
  const mode = useCRM((s) => s.settings.approvalModes.Proposals);
  const deals = useCRM((s) => s.deals);
  const deal = deals.find((d) => d.id === p.dealId);
  const approver = me.role === "admin" || can(me.role, "automations", "write");
  const sendable = canSendProposal(p, mode);

  const approvalTone = p.approval === "Approved" ? "success" : p.approval === "Awaiting" ? "warning" : "neutral";
  const approvalLabel = p.status === "Draft" && p.approval !== "Approved" ? (mode === "Approval Required" ? "Needs approval" : "Not required") : p.approval;

  return (
    <div className="space-y-3">
      <ProposalStepper p={p} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-fg-3">Internal review:</span>
        <Badge tone={approvalTone}>{approvalLabel}</Badge>
        <span className="text-fg-3">· Proposals mode <b className="font-medium text-fg-2">{mode}</b></span>
        {p.sentAt && ["Sent", "Viewed", "Accepted", "Rejected"].includes(p.status) && <span className="text-fg-3">· Sent {fmtDate(p.sentAt)}</span>}
        {p.viewedAt && <span className="text-fg-3">· Viewed {fmtDate(p.viewedAt)}</span>}
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-1.5">
          {p.status === "Draft" && (
            <Button size="xs" variant="primary" icon={<ShieldCheck className="size-3" />} onClick={() => {
              const r = submitForReview(p.id);
              toast("Submitted for internal review", r === "approval" ? "Approval requested — see Automations → Approvals." : r === "auto" ? "Auto-approved (Automatic mode)." : "Manual mode — review and send when ready.", r === "approval" ? "warning" : "success");
            }}>Submit for internal review</Button>
          )}
          {p.status === "Internal Review" && p.approval === "Awaiting" && approver && (
            <Button size="xs" icon={<CheckCircle2 className="size-3" />} onClick={() => { approveProposalNow(p.id); toast("Proposal approved"); }}>Approve now</Button>
          )}
          {["Draft", "Internal Review"].includes(p.status) && (
            <Button size="xs" variant={p.status === "Internal Review" ? "primary" : "secondary"} icon={<Send className="size-3" />} disabled={!sendable} title={!sendable ? "Approve internally before sending" : undefined}
              onClick={() => { if (sendProposal(p.id)) toast("Proposal sent", `${p.company} · deal moved to Proposal`); }}>
              Send to client
            </Button>
          )}
          {p.status === "Sent" && <Button size="xs" icon={<Eye className="size-3" />} onClick={() => { markProposalViewed(p.id); toast("Marked as viewed"); }}>Mark viewed</Button>}
          {["Sent", "Viewed"].includes(p.status) && (
            <>
              <Button size="xs" variant="primary" icon={<ThumbsUp className="size-3" />} onClick={() => { const cid = acceptProposal(p.id); toast("Proposal accepted 🎉", cid ? "Deal won — client created and onboarding started." : "Deal moved to Won."); }}>Accepted</Button>
              <Button size="xs" variant="outline" icon={<ThumbsDown className="size-3" />} onClick={() => { useCRM.getState().setProposalStatus(p.id, "Rejected"); toast("Proposal rejected", "Deal moved to Lost.", "info"); }}>Rejected</Button>
            </>
          )}
          {p.status === "Rejected" && <Button size="xs" icon={<RotateCcw className="size-3" />} onClick={() => { useCRM.getState().setProposalStatus(p.id, "Draft"); useCRM.getState().updateProposal(p.id, { approval: mode === "Approval Required" ? "Awaiting" : "Not Required" }); }}>Reopen as draft</Button>}
          {showPrint && <Button size="xs" variant="ghost" icon={<FileDown className="size-3" />} href={`/proposals/${p.id}`}>Printable / PDF</Button>}
        </div>
      )}
      {!canWrite && showPrint && <Button size="xs" variant="ghost" icon={<FileDown className="size-3" />} href={`/proposals/${p.id}`}>Printable / PDF</Button>}

      {p.status === "Internal Review" && p.approval === "Awaiting" && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Waiting for internal approval. <Link href="/automations?tab=approvals" className="underline">Open approvals</Link>
        </p>
      )}
      {p.status === "Accepted" && deal?.clientId && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
          Deal won — client created. <Link href={`/onboarding?client=${deal.clientId}`} className="font-medium underline">Open onboarding →</Link>
        </p>
      )}
    </div>
  );
}
