// Proposal Generator engine — pure & deterministic (no store imports).
// Builds a proposal from real inputs (client/lead record, discovery notes, selected services,
// an optional strategy document and the editable price book). Anything not backed by those
// inputs is phrased as a proposal assumption, never as fact.
import type { InsightItem, Proposal, ProposalLine, Service, StrategyDoc } from "../types";

export interface PriceBookEntry {
  service: Service;
  setup: number; // one-time (₹)
  monthly: number; // recurring (₹ / month)
  note?: string;
}

// Sensible Indian-agency defaults (₹). Editable per proposal in the generator.
export const DEFAULT_PRICE_BOOK: PriceBookEntry[] = [
  { service: "Meta Ads", setup: 25000, monthly: 60000, note: "Excludes media spend" },
  { service: "Google Ads", setup: 25000, monthly: 55000, note: "Excludes media spend" },
  { service: "LinkedIn Ads", setup: 25000, monthly: 60000, note: "Excludes media spend" },
  { service: "Programmatic", setup: 40000, monthly: 90000, note: "Excludes media spend" },
  { service: "Retail Media", setup: 20000, monthly: 50000, note: "Amazon / Flipkart ads" },
  { service: "Quick Commerce", setup: 20000, monthly: 45000, note: "Blinkit / Zepto / Instamart" },
  { service: "SEO", setup: 35000, monthly: 50000 },
  { service: "Social Media", setup: 15000, monthly: 45000, note: "12–16 posts / month" },
  { service: "Influencer Marketing", setup: 20000, monthly: 75000, note: "Creator fees billed at actuals" },
  { service: "AI Automation", setup: 120000, monthly: 25000, note: "Build + maintenance" },
  { service: "Video Production", setup: 80000, monthly: 0, note: "Per production batch" },
  { service: "Brand Strategy", setup: 150000, monthly: 0, note: "One-time engagement" },
  { service: "Consulting", setup: 0, monthly: 40000, note: "Advisory retainer" },
];

const SCOPE: Record<Service, string[]> = {
  "Meta Ads": ["Account & pixel/CAPI audit", "Full-funnel campaign structure (prospecting, retargeting, retention)", "Audience research & lookalikes", "Weekly creative testing & budget optimisation"],
  "Google Ads": ["Search, Performance Max & YouTube campaigns", "Keyword research & negative lists", "GA4 conversion tracking", "Bid strategy & budget pacing"],
  "LinkedIn Ads": ["ICP & account-list targeting", "Lead-gen forms & CRM sync", "Thought-leadership + conversion campaigns"],
  Programmatic: ["DSP setup & brand-safe inventory", "Audience segments & frequency capping", "Brand-lift / reach reporting"],
  "Retail Media": ["Sponsored product & brand campaigns", "Keyword harvesting & ACoS control", "Listing content recommendations"],
  "Quick Commerce": ["Blinkit / Zepto / Instamart ads", "Dark-store level availability monitoring", "Promo calendar & bid management"],
  SEO: ["Technical SEO audit & fixes", "Keyword map & on-page optimisation", "Content briefs & publishing calendar", "Authority building (digital PR / links)"],
  "Social Media": ["Monthly content calendar & pillars", "Design + copy for posts, carousels and reels", "Community management", "Monthly social analytics"],
  "Influencer Marketing": ["Creator discovery & vetting", "Negotiation, contracts & briefs", "Content approvals & usage rights", "Campaign tracking (codes / UTMs)"],
  "AI Automation": ["Workflow discovery & mapping", "Lead capture → CRM → WhatsApp/email automations", "AI assistants for sales & support", "Monitoring & iteration"],
  "Video Production": ["Concept & scripting", "Shoot / UGC production", "Editing, captions & aspect-ratio cut-downs", "Hook variations for testing"],
  "Brand Strategy": ["Market & competitor research", "Positioning, messaging & tone of voice", "Brand identity guidelines", "Go-to-market narrative"],
  Consulting: ["Monthly growth review", "Marketing org & vendor advisory", "Quarterly planning workshop"],
};

const DELIVERABLES: Record<Service, string[]> = {
  "Meta Ads": ["Meta campaign architecture document", "8–12 ad creatives tested per month", "Weekly performance snapshot"],
  "Google Ads": ["Search & PMax campaign build", "Conversion tracking QA report", "Weekly performance snapshot"],
  "LinkedIn Ads": ["Account list & ICP document", "4 ad variants per month", "Lead sync to CRM"],
  Programmatic: ["Media plan & inventory list", "Monthly reach & brand-lift report"],
  "Retail Media": ["Marketplace ads setup", "Monthly ACoS / ROAS report"],
  "Quick Commerce": ["Q-comm ads setup", "Availability & share-of-shelf tracker"],
  SEO: ["Technical audit with prioritised fixes", "Keyword map", "4–8 SEO articles / month", "Monthly rankings & traffic report"],
  "Social Media": ["Monthly content calendar", "12–16 designed posts / month", "4 reels / month"],
  "Influencer Marketing": ["Creator shortlist", "Signed creator agreements", "Creator performance report"],
  "AI Automation": ["Automation blueprint", "Live automations with documentation", "Monthly automation health report"],
  "Video Production": ["Scripts & storyboards", "Edited master videos + 9:16 / 1:1 / 16:9 cut-downs"],
  "Brand Strategy": ["Brand strategy deck", "Messaging framework", "Brand guidelines"],
  Consulting: ["Monthly advisory session notes", "Quarterly growth plan"],
};

const PAID = new Set<Service>(["Meta Ads", "Google Ads", "LinkedIn Ads", "Programmatic", "Retail Media", "Quick Commerce"]);

export interface ProposalInput {
  company: string;
  industry?: string;
  contactName?: string;
  location?: string;
  services: Service[];
  discoveryNotes: string;
  strategy?: Pick<StrategyDoc, "title" | "summary" | "budget" | "kpis" | "status"> | null;
  priceBook: PriceBookEntry[];
  monthlyAdSpend?: number;
  durationMonths?: number;
}

export interface GeneratedProposal {
  title: string;
  lines: ProposalLine[];
  deliverables: string[];
  timeline: { phase: string; weeks: string; detail: string }[];
  strategySummary: string;
  sources: InsightItem[]; // what the generator used — shown to the team, not the client
}

const priceFor = (book: PriceBookEntry[], s: Service) => book.find((b) => b.service === s) ?? DEFAULT_PRICE_BOOK.find((b) => b.service === s) ?? { service: s, setup: 0, monthly: 0 };

export function buildTimeline(services: Service[]) {
  const t: { phase: string; weeks: string; detail: string }[] = [
    { phase: "Discovery & onboarding", weeks: "Week 1", detail: "Kick-off, access collection (ad accounts, analytics, website), brand assets and tracking requirements." },
    { phase: "Strategy & setup", weeks: "Weeks 2–3", detail: "Approve strategy, build tracking, audiences, campaign structure and the first content / creative batch." },
  ];
  if (services.some((s) => PAID.has(s))) t.push({ phase: "Launch", weeks: "Week 4", detail: "Paid campaigns go live with structured creative and audience tests." });
  if (services.includes("SEO")) t.push({ phase: "SEO foundation", weeks: "Weeks 2–8", detail: "Technical fixes, keyword map and the first content cluster." });
  if (services.includes("Social Media") || services.includes("Influencer Marketing")) t.push({ phase: "Content & creators live", weeks: "Weeks 3–6", detail: "Monthly calendar published; creator shortlist contracted and briefed." });
  if (services.includes("AI Automation")) t.push({ phase: "Automation build", weeks: "Weeks 2–6", detail: "Workflows built, tested with your team and handed over with documentation." });
  if (services.includes("Video Production")) t.push({ phase: "Production sprint", weeks: "Weeks 2–5", detail: "Scripts approved, shoot, edit and deliver cut-downs." });
  if (services.includes("Brand Strategy")) t.push({ phase: "Brand strategy", weeks: "Weeks 1–6", detail: "Research, positioning workshop, messaging and guidelines." });
  t.push({ phase: "Optimise & scale", weeks: "Months 2–3", detail: "Scale winners, cut losers, monthly reporting and a quarterly review." });
  return t;
}

export function buildProposal(input: ProposalInput): GeneratedProposal {
  const services = input.services.length ? input.services : (["Meta Ads"] as Service[]);
  const lines: ProposalLine[] = [];
  for (const s of services) {
    const p = priceFor(input.priceBook, s);
    if (p.setup > 0) lines.push({ service: s, description: `${s} — setup & onboarding`, price: p.setup, billing: "one-time" });
    if (p.monthly > 0) lines.push({ service: s, description: `${s} — ${SCOPE[s][0]?.toLowerCase() ?? "management"} and ongoing management`, price: p.monthly, billing: "monthly" });
  }
  const deliverables = [...new Set(services.flatMap((s) => DELIVERABLES[s] ?? []))];
  deliverables.push("Monthly performance report with insights & next-month plan");

  const sources: InsightItem[] = [];
  sources.push({ kind: "data", text: `Services selected: ${services.join(", ")}`, source: "Deal / lead record" });
  if (input.discoveryNotes.trim()) sources.push({ kind: "data", text: `Discovery notes (${input.discoveryNotes.trim().split(/\s+/).length} words) used for objectives`, source: "Discovery notes" });
  else sources.push({ kind: "assumption", text: "No discovery notes — objectives use generic goals for the selected services. Add notes for a sharper proposal." });

  let strategySummary = "";
  if (input.strategy) {
    const top = [...(input.strategy.budget ?? [])].sort((a, b) => b.pct - a.pct).slice(0, 3);
    strategySummary = `${input.strategy.summary}${top.length ? ` Recommended budget split: ${top.map((b) => `${b.channel} ${b.pct}%`).join(", ")}.` : ""}`;
    sources.push({ kind: "data", text: `Strategy document “${input.strategy.title}” (${input.strategy.status})`, source: "Strategy module" });
  } else {
    strategySummary = `A ${services.length > 1 ? "multi-channel" : services[0]} programme for ${input.company}${input.industry ? ` in ${input.industry}` : ""}: build measurement first, launch structured tests, then scale what works based on weekly data.`;
    sources.push({ kind: "assumption", text: "No strategy document linked — strategy summary is a standard playbook outline." });
  }
  sources.push({ kind: "assumption", text: "Pricing comes from the price book (editable) — confirm before sending." });
  if (services.some((s) => PAID.has(s))) sources.push({ kind: "recommendation", text: input.monthlyAdSpend ? `Media spend (≈ ₹${Math.round(input.monthlyAdSpend).toLocaleString("en-IN")}/mo on record) is billed separately.` : "State the expected monthly media spend — it is billed separately from management fees." });

  return {
    title: `${input.company} — Growth Proposal`,
    lines,
    deliverables,
    timeline: buildTimeline(services),
    strategySummary,
    sources,
  };
}

// ---------- Document composition (used by the printable proposal view) ----------
export interface ProposalDoc {
  executiveSummary: string;
  objectives: string[];
  scope: { service: Service; items: string[] }[];
  deliverables: string[];
  timeline: { phase: string; weeks: string; detail: string }[];
  investment: { oneTime: ProposalLine[]; monthly: ProposalLine[]; oneTimeTotal: number; monthlyTotal: number; firstMonth: number };
  terms: string[];
}

const GOAL_HINTS: [RegExp, string][] = [
  [/roas|return on ad/i, "Improve return on ad spend (ROAS) with disciplined testing and budget allocation"],
  [/cpa|cost per|cac|cpl/i, "Lower cost per acquisition / lead while holding volume"],
  [/lead|enquir|inquir|demo/i, "Grow qualified lead volume and hand-off speed to sales"],
  [/sale|revenue|order|ecom|d2c/i, "Grow online revenue and order volume profitably"],
  [/brand|awareness|reach/i, "Build brand awareness and reach in priority markets"],
  [/seo|organic|rank/i, "Grow organic traffic and rankings for commercial keywords"],
  [/launch|new product|expan/i, "Launch successfully into the new market / product line"],
  [/automat|crm|whatsapp|manual/i, "Automate repetitive marketing and sales workflows"],
  [/social|instagram|content|reel/i, "Build a consistent, high-engagement social presence"],
];

export function composeProposalDoc(p: Proposal, ctx: { company: string; industry?: string; contactName?: string; agencyName: string }): ProposalDoc {
  const services = [...new Set(p.lines.map((l) => l.service))];
  const notes = p.discoveryNotes ?? "";
  const objectives = GOAL_HINTS.filter(([re]) => re.test(notes)).map(([, g]) => g);
  if (!objectives.length) {
    if (services.some((s) => PAID.has(s))) objectives.push("Build a profitable, scalable paid acquisition engine");
    if (services.includes("SEO")) objectives.push("Grow organic traffic for commercial keywords");
    if (services.includes("Social Media") || services.includes("Influencer Marketing")) objectives.push("Grow engaged audience and social proof");
    if (!objectives.length) objectives.push(`Deliver measurable growth from ${services.join(", ")}`);
  }
  objectives.push("Give leadership clear, weekly visibility of what is working and what we will do next");

  const oneTime = p.lines.filter((l) => l.billing === "one-time");
  const monthly = p.lines.filter((l) => l.billing === "monthly");
  const oneTimeTotal = oneTime.reduce((a, l) => a + l.price, 0);
  const monthlyTotal = monthly.reduce((a, l) => a + l.price, 0);
  const who = ctx.contactName ? `${ctx.contactName.split(" ")[0]} and the ${ctx.company} team` : `the ${ctx.company} team`;

  return {
    executiveSummary:
      `${ctx.agencyName} proposes a ${services.length > 1 ? `${services.length}-service` : services[0]} engagement for ${ctx.company}${ctx.industry && ctx.industry !== "—" ? ` (${ctx.industry})` : ""}. ` +
      (p.strategySummary ? `${p.strategySummary} ` : "") +
      `We will work with ${who} on ${objectives[0]!.charAt(0).toLowerCase()}${objectives[0]!.slice(1)}, reporting progress every week.`,
    objectives,
    scope: services.map((s) => ({ service: s, items: SCOPE[s] ?? [] })),
    deliverables: p.deliverables?.length ? p.deliverables : [...new Set(services.flatMap((s) => DELIVERABLES[s] ?? []))],
    timeline: p.timeline?.length ? p.timeline : buildTimeline(services),
    investment: { oneTime, monthly, oneTimeTotal, monthlyTotal, firstMonth: oneTimeTotal + monthlyTotal },
    terms: [
      "Prices are in INR and exclude 18% GST.",
      "Media spend and creator / influencer fees are billed at actuals and paid directly to platforms or creators.",
      "Monthly fees are invoiced in advance; one-time fees are invoiced 50% on signing and 50% on delivery.",
      "Minimum term of 3 months for retainers, then month-to-month with 30 days' notice.",
      "Client provides timely access to ad accounts, analytics and brand assets; timelines start once access is granted.",
      `This proposal is valid until ${new Date(p.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    ],
  };
}
