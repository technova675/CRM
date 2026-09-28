"use client";

import { useCRM } from "@/lib/store";
import type { ApprovalMode, Proposal } from "@/lib/types";
import { money, sum } from "@/lib/utils";

// Proposal workflow: Draft → Internal Review → Sent → Viewed → Accepted / Rejected.
// Internal review follows the "Proposals" approval mode:
//   Approval Required → an approval request whose apply-patch marks the proposal Approved
//   Automatic         → auto-approved (logged as AI)
//   Manual            → a human reviews and sends; no formal approval gate

export const proposalTotal = (p: Proposal) => sum(p.lines.map((l) => l.price));
export const proposalMonthly = (p: Proposal) => sum(p.lines.filter((l) => l.billing === "monthly").map((l) => l.price));
export const proposalOneTime = (p: Proposal) => sum(p.lines.filter((l) => l.billing === "one-time").map((l) => l.price));
// First-year contract value: one-time + 12 × monthly.
export const proposalContractValue = (p: Pick<Proposal, "lines">) =>
  sum(p.lines.filter((l) => l.billing === "one-time").map((l) => l.price)) + 12 * sum(p.lines.filter((l) => l.billing === "monthly").map((l) => l.price));

export function canSendProposal(p: Proposal, mode: ApprovalMode) {
  if (!["Draft", "Internal Review"].includes(p.status)) return false;
  return mode !== "Approval Required" || p.approval === "Approved";
}

export function pendingProposalApproval(proposalId: string) {
  return useCRM.getState().approvals.find((a) => a.status === "pending" && a.apply?.collection === "proposals" && a.apply.id === proposalId);
}

export function submitForReview(id: string): "approval" | "auto" | "manual" | null {
  const s = useCRM.getState();
  const p = s.proposals.find((x) => x.id === id);
  if (!p) return null;
  const mode = s.modeFor("Proposals");
  s.setProposalStatus(id, "Internal Review");
  if (mode === "Approval Required") {
    s.updateProposal(id, { approval: "Awaiting" });
    if (!pendingProposalApproval(id)) {
      s.requestApproval({
        kind: "Proposals",
        title: `Approve proposal: ${p.title}`,
        detail: `${p.company} — ${money(proposalMonthly(p))}/mo + ${money(proposalOneTime(p))} one-time · ${p.lines.length} line items`,
        ref: { type: "proposal", id },
        agent: "sales",
        apply: { collection: "proposals", id, patch: { approval: "Approved" } },
      });
    }
    return "approval";
  }
  if (mode === "Automatic") {
    s.updateProposal(id, { approval: "Approved" });
    s.log({ actor: "ai", agent: "sales", entity: "proposal", entityId: id, action: "Auto-approved proposal (Automatic mode)", detail: p.title });
    return "auto";
  }
  s.updateProposal(id, { approval: "Not Required" });
  return "manual";
}

// Approver shortcut: resolves the linked approval request (so the audit trail stays in Approvals).
export function approveProposalNow(id: string) {
  const s = useCRM.getState();
  const ap = pendingProposalApproval(id);
  if (ap) s.resolveApproval(ap.id, true);
  else s.patch("proposals", id, { approval: "Approved" }, { entity: "proposal", action: "Approved proposal internally" });
}

export function sendProposal(id: string) {
  const s = useCRM.getState();
  const p = s.proposals.find((x) => x.id === id);
  if (!p || !canSendProposal(p, s.modeFor("Proposals"))) return false;
  s.setProposalStatus(id, "Sent");
  return true;
}

export function markProposalViewed(id: string) {
  const s = useCRM.getState();
  s.setProposalStatus(id, "Viewed");
  s.updateProposal(id, { viewedAt: new Date().toISOString() });
}

// Accepted → deal Won → client created → onboarding starts (store). Returns the new client id.
export function acceptProposal(id: string) {
  const s = useCRM.getState();
  s.setProposalStatus(id, "Accepted");
  const p = useCRM.getState().proposals.find((x) => x.id === id);
  return useCRM.getState().deals.find((d) => d.id === p?.dealId)?.clientId;
}
