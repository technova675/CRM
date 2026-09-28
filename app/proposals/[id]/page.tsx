"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button, EmptyState, StatusBadge } from "@/components/ui";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";

// Printable, branded proposal. "Download PDF" uses the browser's print-to-PDF;
// the print stylesheet below hides the app shell (sidebar + header) and all controls.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 16mm 14mm; }
  aside, header.sticky, .no-print { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  .lg\\:pl-60 { padding-left: 0 !important; }
  body { background: #fff !important; color: #111 !important; }
  .dark, :root { --bg: #fff; --surface: #fff; --surface-2: #f3f3f5; --surface-3: #ebebef; --border: #e6e6ea; --border-strong: #d4d4da; --text: #0f0f12; --text-2: #55555f; --text-3: #8b8b96; --accent-text: #5b36f2; color-scheme: light; }
  .proposal-doc { max-width: none !important; }
  .proposal-doc section { break-inside: auto; }
  .break-inside-avoid { break-inside: avoid; }
  .break-after-avoid { break-after: avoid; }
}
`;

export default function ProposalPrintPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const proposal = useCRM((s) => s.proposals.find((p) => p.id === id));
  const deals = useCRM((s) => s.deals);
  const leads = useCRM((s) => s.leads);
  const clients = useCRM((s) => s.clients);
  const agencyName = useCRM((s) => s.settings.agencyName);

  if (!can(me.role, "proposals", "read") || me.role === "client") return <EmptyState title="You don't have access to proposals" />;
  if (!proposal) return <EmptyState title="Proposal not found" action={<Button href="/proposals">Back to proposals</Button>} />;

  const deal = deals.find((d) => d.id === proposal.dealId);
  const lead = deal?.leadId ? leads.find((l) => l.id === deal.leadId) : undefined;
  const client = deal?.clientId ? clients.find((c) => c.id === deal.clientId) : undefined;

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/proposals?p=${proposal.id}`} className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"><ArrowLeft className="size-3" /> Proposals</Link>
        <StatusBadge status={proposal.status} />
        {proposal.approval !== "Approved" && proposal.status !== "Accepted" && <span className="text-xs text-warning">Not yet approved internally — draft copy</span>}
        <Button variant="primary" className="ml-auto" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>Download PDF</Button>
      </div>
      <ProposalDocument
        proposal={proposal}
        company={proposal.company}
        industry={lead?.industry ?? client?.industry}
        location={lead?.location ?? client?.location}
        contactName={lead?.name ?? client?.contacts[0]?.name}
        agencyName={agencyName}
      />
      <p className="no-print mx-auto mt-6 max-w-3xl text-center text-[11px] text-fg-3">Tip: in the print dialog choose “Save as PDF”, paper A4, and enable background graphics for the branded header.</p>
    </div>
  );
}
