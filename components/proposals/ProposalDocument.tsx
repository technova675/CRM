"use client";

import type { ReactNode } from "react";
import type { Proposal } from "@/lib/types";
import { composeProposalDoc } from "@/lib/ai/proposal";
import { fmtDate, money } from "@/lib/utils";

function H({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 flex items-baseline gap-3 text-lg font-semibold tracking-tight break-after-avoid">
      <span className="text-sm font-medium text-accent-text tabular-nums">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );
}

// Client-facing proposal document. Contains no internal notes, margins or AI inputs.
export function ProposalDocument({ proposal: p, company, industry, contactName, agencyName, location }: { proposal: Proposal; company: string; industry?: string; contactName?: string; agencyName: string; location?: string }) {
  const doc = composeProposalDoc(p, { company, industry, contactName, agencyName });
  return (
    <article className="proposal-doc mx-auto max-w-3xl text-[13.5px] leading-relaxed text-fg">
      {/* Cover */}
      <header className="rounded-2xl border border-border bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-7 place-items-center rounded-lg ai-gradient text-xs font-bold text-white">{agencyName.charAt(0)}</span>
            {agencyName}
          </span>
          <span className="text-xs text-fg-3">Proposal · {fmtDate(p.createdAt)}</span>
        </div>
        <p className="mt-10 text-xs font-medium uppercase tracking-widest text-fg-3">Prepared for</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{company}</h1>
        <p className="mt-1 text-sm text-fg-2">{p.title}</p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-fg-3">
          {contactName && <span>Attn: {contactName}</span>}
          {industry && industry !== "—" && <span>{industry}</span>}
          {location && location !== "—" && <span>{location}</span>}
          <span>Valid until {fmtDate(p.expiresAt)}</span>
        </div>
      </header>

      <section>
        <H n={1}>Executive summary</H>
        <p className="text-fg-2">{doc.executiveSummary}</p>
      </section>

      <section>
        <H n={2}>Objectives</H>
        <ul className="list-disc space-y-1 pl-5 text-fg-2">{doc.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
      </section>

      <section>
        <H n={3}>Scope of work</H>
        <div className="grid gap-3 sm:grid-cols-2">
          {doc.scope.map((s) => (
            <div key={s.service} className="rounded-xl border border-border p-4 break-inside-avoid">
              <p className="mb-1.5 font-semibold">{s.service}</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-fg-2">{s.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <H n={4}>Deliverables</H>
        <ul className="grid gap-x-6 gap-y-1 pl-5 text-fg-2 sm:grid-cols-2 list-disc">{doc.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
      </section>

      <section>
        <H n={5}>Timeline</H>
        <ol className="space-y-2">
          {doc.timeline.map((t, i) => (
            <li key={i} className="flex gap-4 break-inside-avoid">
              <span className="w-24 shrink-0 text-xs font-medium text-accent-text">{t.weeks}</span>
              <span><b className="font-medium">{t.phase}</b><span className="block text-xs text-fg-3">{t.detail}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section className="break-inside-avoid">
        <H n={6}>Investment</H>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-strong text-left text-xs text-fg-3">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 font-medium">Billing</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {[...doc.investment.oneTime, ...doc.investment.monthly].map((l, i) => (
              <tr key={i} className="border-b border-border">
                <td className="py-2"><span className="font-medium">{l.service}</span><span className="block text-xs text-fg-3">{l.description}</span></td>
                <td className="py-2 text-xs text-fg-2">{l.billing === "monthly" ? "Monthly" : "One-time"}</td>
                <td className="py-2 text-right tabular-nums">{money(l.price)}{l.billing === "monthly" && <span className="text-xs text-fg-3">/mo</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-[13px]">
            <tr><td colSpan={2} className="pt-3 text-fg-2">One-time total</td><td className="pt-3 text-right font-semibold tabular-nums">{money(doc.investment.oneTimeTotal)}</td></tr>
            <tr><td colSpan={2} className="pt-1 text-fg-2">Monthly retainer</td><td className="pt-1 text-right font-semibold tabular-nums">{money(doc.investment.monthlyTotal)}/mo</td></tr>
            <tr><td colSpan={2} className="pt-1 text-fg-2">First month invoice</td><td className="pt-1 text-right font-semibold tabular-nums">{money(doc.investment.firstMonth)}</td></tr>
          </tfoot>
        </table>
      </section>

      <section>
        <H n={7}>Terms</H>
        <ul className="list-disc space-y-1 pl-5 text-xs text-fg-2">{doc.terms.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>

      <section className="mt-10 grid gap-8 break-inside-avoid sm:grid-cols-2">
        {[agencyName, company].map((who) => (
          <div key={who}>
            <div className="h-12 border-b border-border-strong" />
            <p className="mt-1 text-xs text-fg-3">For {who} · Signature & date</p>
          </div>
        ))}
      </section>
    </article>
  );
}
