import type { CRMState } from "../store";
import { effectiveScore } from "./scoring";
import { personalizeFirstMessage } from "./outreach";
import { recommendServices } from "./research";
import { compactMoney, fmtShort, isSameDay, isPast, sum } from "../utils";

// Local, deterministic assistant used when no AI provider is configured.
// It answers the common agency questions straight from CRM data, and returns
// links so the answer is actionable. With an AI provider, /api/ai/assistant is
// used instead and receives a compact CRM snapshot (see buildSnapshot).

export interface AssistantAnswer {
  text: string;
  items?: { label: string; sub?: string; href?: string }[];
}

type S = Pick<CRMState, "leads" | "clients" | "invoices" | "conversations" | "messages" | "deals" | "campaigns" | "tasks" | "meetings">;

const findLead = (s: S, q: string) => {
  const lower = q.toLowerCase();
  return s.leads.find((l) => lower.includes(l.company.toLowerCase()) || lower.includes(l.name.toLowerCase()));
};
const findClient = (s: S, q: string) => {
  const lower = q.toLowerCase();
  return s.clients.find((c) => lower.includes(c.company.toLowerCase()) || lower.includes(c.company.split(" ")[0]!.toLowerCase()));
};

export function answerLocally(q: string, s: S): AssistantAnswer {
  const t = q.toLowerCase();

  if (/follow.?up/.test(t) && /(today|due|need)/.test(t) && !/create|write|draft/.test(t)) {
    const due = s.leads.filter((l) => l.nextFollowUpAt && (isSameDay(l.nextFollowUpAt) || isPast(l.nextFollowUpAt)) && !l.optedOut && !["Won", "Lost"].includes(l.status));
    return {
      text: due.length ? `${due.length} leads need a follow-up today (including overdue):` : "No follow-ups are due today. 🎉",
      items: due.slice(0, 12).map((l) => ({ label: `${l.name} · ${l.company}`, sub: `${l.status} · due ${fmtShort(l.nextFollowUpAt)}`, href: `/leads/${l.id}` })),
    };
  }
  if (/(high.?potential|hot|best)/.test(t) && /(not|n't|haven)/.test(t) && /contact/.test(t)) {
    const list = s.leads.filter((l) => ["New", "Researching", "Qualified"].includes(l.status) && !l.optedOut).sort((a, b) => effectiveScore(b) - effectiveScore(a)).slice(0, 10);
    return {
      text: `Top ${list.length} high-potential leads that haven't been contacted yet, by AI score:`,
      items: list.map((l) => ({ label: `${l.company} — score ${effectiveScore(l)}`, sub: `${l.name}, ${l.jobTitle} · ${l.industry}`, href: `/leads/${l.id}` })),
    };
  }
  if (/pending payment|unpaid|overdue|owe/.test(t)) {
    const open = s.invoices.filter((i) => i.status !== "Paid");
    const byClient = new Map<string, number>();
    open.forEach((i) => byClient.set(i.clientId, (byClient.get(i.clientId) ?? 0) + i.amount - i.paid));
    return {
      text: `${byClient.size} clients have pending payments totalling ${compactMoney(sum([...byClient.values()]))}.`,
      items: [...byClient.entries()].sort((a, b) => b[1] - a[1]).map(([id, amt]) => {
        const c = s.clients.find((x) => x.id === id);
        const overdue = open.some((i) => i.clientId === id && i.status === "Overdue");
        return { label: `${c?.company} — ${compactMoney(amt)}`, sub: overdue ? "Includes overdue invoice" : "Pending", href: `/payments` };
      }),
    };
  }
  if (/report/.test(t) && /(haven|not|n't|missing)/.test(t)) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const list = s.clients.filter((c) => !c.lastReportAt || new Date(c.lastReportAt) < monthStart);
    return {
      text: list.length ? `${list.length} clients haven't received a report this month:` : "Every client has received a report this month.",
      items: list.map((c) => ({ label: c.company, sub: `Last report ${c.lastReportAt ? fmtShort(c.lastReportAt) : "never"}`, href: `/reports` })),
    };
  }
  if (/repl/.test(t) && /positive/.test(t)) {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const msgs = s.messages.filter((m) => m.direction === "inbound" && m.sentiment === "positive" && new Date(m.sentAt).getTime() > weekAgo);
    const items = msgs.map((m) => {
      const conv = s.conversations.find((c) => c.id === m.conversationId);
      const lead = s.leads.find((l) => l.id === conv?.leadId);
      const client = s.clients.find((c) => c.id === conv?.clientId);
      return { label: lead ? `${lead.name} · ${lead.company}` : client?.company ?? "Contact", sub: `"${m.body.slice(0, 70)}${m.body.length > 70 ? "…" : ""}"`, href: `/inbox?c=${m.conversationId}` };
    });
    return { text: `${items.length} positive replies in the last 7 days:`, items };
  }
  if (/(create|write|draft).*(follow.?up|message|email)/.test(t)) {
    const lead = findLead(s, q);
    if (!lead) return { text: "Which lead? Mention the company or contact name, e.g. “Draft a follow-up for Nova Homes”." };
    const d = personalizeFirstMessage(lead, "Email");
    return { text: `Here's a draft for ${lead.name} at ${lead.company} (angle: ${d.service}):\n\n${d.body}`, items: [{ label: `Open ${lead.company}`, href: `/leads/${lead.id}` }] };
  }
  if (/summar/.test(t)) {
    const c = findClient(s, q);
    if (c) {
      const camps = s.campaigns.filter((x) => x.clientId === c.id);
      const m30 = camps.flatMap((x) => x.metrics.slice(-30));
      const spend = sum(m30.map((m) => m.spend));
      const rev = sum(m30.map((m) => m.revenue));
      const leads = sum(m30.map((m) => m.leads));
      const open = s.invoices.filter((i) => i.clientId === c.id && i.status !== "Paid");
      const tasks = s.tasks.filter((x) => x.related?.id === c.id && x.status !== "Done");
      return {
        text: `**${c.company}** (${c.industry}, ${c.location}) — ${c.health}.\n• Services: ${c.services.join(", ")} · retainer ${compactMoney(c.retainer)}/mo\n• Last 30 days: ${compactMoney(spend)} spend, ${leads} leads, ${compactMoney(rev)} revenue (ROAS ${(rev / Math.max(1, spend)).toFixed(1)}x)\n• ${camps.filter((x) => x.status === "Active").length} active campaigns · ${tasks.length} open tasks\n• ${open.length ? `${open.length} unpaid invoice(s): ${compactMoney(sum(open.map((i) => i.amount - i.paid)))}` : "No outstanding payments"}\n• Last report: ${c.lastReportAt ? fmtShort(c.lastReportAt) : "never"}`,
        items: [{ label: `Open ${c.company}`, href: `/clients/${c.id}` }],
      };
    }
    const lead = findLead(s, q);
    if (lead) return { text: lead.research?.summary ?? `${lead.company} hasn't been researched yet — open the lead and run AI research.`, items: [{ label: `Open ${lead.company}`, href: `/leads/${lead.id}` }] };
  }
  if (/service|upsell|relevant/.test(t)) {
    const c = findClient(s, q);
    if (c) {
      const lead = { ...s.leads[0]!, industry: c.industry, services: c.services, website: c.website, company: c.company };
      const recs = recommendServices(lead).filter((x) => !c.services.includes(x));
      return {
        text: `${c.company} currently uses ${c.services.join(", ")}. Based on its industry (${c.industry}) — an assumption, not verified demand — these could be relevant next:`,
        items: recs.map((r) => ({ label: r, sub: "Recommendation" })),
      };
    }
  }
  if (/pipeline|forecast/.test(t)) {
    const open = s.deals.filter((d) => !["Won", "Lost"].includes(d.stage));
    const weighted = sum(open.map((d) => (d.value * d.probability) / 100));
    return { text: `${open.length} open deals worth ${compactMoney(sum(open.map((d) => d.value)))} (weighted forecast ${compactMoney(weighted)}).`, items: [{ label: "Open pipeline", href: "/pipeline" }] };
  }
  if (/meeting/.test(t)) {
    const up = s.meetings.filter((m) => !isPast(m.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 8);
    return { text: `${up.length} upcoming meetings:`, items: up.map((m) => ({ label: m.title, sub: fmtShort(m.startsAt), href: "/meetings" })) };
  }
  if (/task|overdue/.test(t)) {
    const od = s.tasks.filter((x) => x.status !== "Done" && isPast(x.dueDate));
    return { text: `${od.length} overdue tasks:`, items: od.slice(0, 10).map((x) => ({ label: x.title, sub: `${x.priority} · due ${fmtShort(x.dueDate)}`, href: "/tasks" })) };
  }
  return {
    text: "I can answer questions from your CRM data. Try:\n• Which leads need follow-up today?\n• Show me high-potential leads that haven't been contacted\n• Which clients have pending payments?\n• Which clients haven't received a report this month?\n• Which leads replied positively this week?\n• Draft a follow-up for <company>\n• Summarize <client>'s account\n• What services could be relevant for <client>?",
  };
}

// Compact snapshot sent to the server-side model; keeps token usage bounded.
export function buildSnapshot(s: S) {
  return {
    today: new Date().toISOString().slice(0, 10),
    leads: s.leads.slice(0, 200).map((l) => ({ id: l.id, name: l.name, company: l.company, status: l.status, score: effectiveScore(l), industry: l.industry, nextFollowUp: l.nextFollowUpAt?.slice(0, 10), optedOut: l.optedOut, summary: l.research?.summary?.slice(0, 240) })),
    clients: s.clients.map((c) => ({ id: c.id, company: c.company, industry: c.industry, services: c.services, retainer: c.retainer, health: c.health, lastReport: c.lastReportAt?.slice(0, 10) })),
    invoices: s.invoices.filter((i) => i.status !== "Paid").map((i) => ({ client: s.clients.find((c) => c.id === i.clientId)?.company, outstanding: i.amount - i.paid, status: i.status, due: i.dueDate.slice(0, 10) })),
    deals: s.deals.filter((d) => !["Won", "Lost"].includes(d.stage)).map((d) => ({ title: d.title, stage: d.stage, value: d.value, probability: d.probability })),
    recentInbound: s.messages.filter((m) => m.direction === "inbound").slice(-40).map((m) => ({ conversationId: m.conversationId, sentiment: m.sentiment, at: m.sentAt.slice(0, 10), body: m.body.slice(0, 200) })),
    tasksOpen: s.tasks.filter((t) => t.status !== "Done").map((t) => ({ title: t.title, due: t.dueDate.slice(0, 10), priority: t.priority })),
  };
}
