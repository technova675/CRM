import type { Expense, Service } from "../types";
import type { SeedCtx } from "./context";
import { ago, makeRand } from "./context";

// Owned by the Finance module.
// ~6 months of agency expenses. Payroll is NOT logged here — it comes from each team member's
// monthlyCost (Team module) so it isn't double counted. Client-linked, non-billable amounts are sized so
// that, together with allocated team cost, most clients land at 35–65% gross margin and Zen Fitness /
// Ember Kitchen fall below the 30% floor.

type Line = { category: Expense["category"]; vendor: string; description: string };

// Typical direct delivery costs per service.
const SERVICE_LINES: Partial<Record<Service, Line[]>> = {
  "Meta Ads": [
    { category: "Production", vendor: "Frame & Co. Studios", description: "Product shoot — ad creatives" },
    { category: "Freelancer", vendor: "UGC creator (freelance)", description: "UGC video set — 4 hooks" },
  ],
  "Google Ads": [{ category: "Software", vendor: "Optmyzr", description: "PPC management tool — client seat" }],
  "LinkedIn Ads": [{ category: "Freelancer", vendor: "B2B copywriter (freelance)", description: "Thought-leadership ad copy" }],
  SEO: [
    { category: "Freelancer", vendor: "WordCraft Content", description: "SEO articles — 6 × 1,500 words" },
    { category: "Software", vendor: "Ahrefs", description: "Rank tracking — client project" },
  ],
  "Social Media": [
    { category: "Freelancer", vendor: "Reel editor (freelance)", description: "Reels edit batch" },
    { category: "Production", vendor: "Frame & Co. Studios", description: "Monthly content shoot" },
  ],
  "Influencer Marketing": [{ category: "Influencer", vendor: "Creator payouts", description: "Creator fees — micro-influencer batch" }],
  Programmatic: [{ category: "Software", vendor: "Integral Ad Science", description: "Brand-safety & viewability verification" }],
  "Brand Strategy": [{ category: "Production", vendor: "Northlight Films", description: "Brand film production instalment" }],
  "AI Automation": [{ category: "Software", vendor: "n8n Cloud + OpenAI API", description: "Lead-routing automations usage" }],
  "Video Production": [{ category: "Production", vendor: "Northlight Films", description: "Video production" }],
};

// Monthly non-billable direct cost per client (₹). Tuned against the team-cost allocation model.
const DIRECT_MONTHLY: Record<string, number> = {
  c_1: 28000, // Bloom Organics
  c_2: 19000, // Cedar Realty
  c_3: 5500, // Lumen Academy
  c_4: 3000, // Coral Stays
  c_5: 20500, // Atlas Health
  c_6: 3000, // Ember Kitchen
  c_7: 75000, // Orbit Finance
  c_8: 11000, // Zen Fitness
};

// Pass-through costs re-invoiced to the client (excluded from margin).
const BILLABLE_MONTHLY: Record<string, Line & { amount: number }> = {
  c_1: { category: "Influencer", vendor: "Creator payouts", description: "Creator fees — rebilled at cost", amount: 60000 },
  c_2: { category: "Production", vendor: "SkyView Drones", description: "Drone walkthrough shoot — rebilled", amount: 35000 },
  c_4: { category: "Influencer", vendor: "Travel creators", description: "Creator stay & fees — rebilled", amount: 40000 },
  c_7: { category: "Media", vendor: "Programmatic media (DV360)", description: "Media pass-through — rebilled", amount: 90000 },
};

// Agency overhead (no client).
const OVERHEAD: (Line & { amount: number })[] = [
  { category: "Software", vendor: "Canva Teams", description: "Design seats", amount: 4200 },
  { category: "Software", vendor: "Figma", description: "Professional plan — 4 editors", amount: 6400 },
  { category: "Software", vendor: "Semrush", description: "Guru plan", amount: 18500 },
  { category: "Software", vendor: "ChatGPT Team", description: "8 seats", amount: 12600 },
  { category: "Software", vendor: "Google Workspace", description: "Business Standard — 16 users", amount: 13400 },
  { category: "Software", vendor: "Slack", description: "Pro plan", amount: 5800 },
  { category: "Office", vendor: "WeWork BKC", description: "Office — 12 desks", amount: 120000 },
  { category: "Office", vendor: "Airtel Business", description: "Internet & phones", amount: 7500 },
  { category: "Other", vendor: "Accounting & legal", description: "CA retainer & compliance", amount: 15000 },
];

export function seedExpenses(ctx: SeedCtx): Expense[] {
  const { R, int, pick } = makeRand(28028);
  const out: Expense[] = [];
  let n = 1;
  const push = (monthsAgo: number, line: Line, amount: number, clientId: string | undefined, billable: boolean) =>
    out.push({
      id: `exp_${n++}`,
      date: ago(monthsAgo * 30 + int(1, 28)),
      category: line.category,
      vendor: line.vendor,
      amount: Math.round(amount / 100) * 100,
      clientId,
      description: line.description,
      billable,
    });

  for (let m = 0; m < 6; m++) {
    OVERHEAD.forEach((o) => push(m, o, o.amount * (o.category === "Software" ? 1 : 0.95 + R() * 0.1), undefined, false));
    // Occasional one-offs
    if (m % 2 === 0) push(m, { category: "Freelancer", vendor: "Freelance motion designer", description: "Agency showreel & pitch assets" }, int(15, 30) * 1000, undefined, false);
    if (m === 3) push(m, { category: "Other", vendor: "Goafest", description: "Industry event passes" }, 42000, undefined, false);

    ctx.clients.forEach((c) => {
      const monthly = DIRECT_MONTHLY[c.id];
      if (monthly) {
        const lines = c.services.flatMap((s) => SERVICE_LINES[s] ?? []);
        const fallback: Line = { category: "Software", vendor: "Looker Studio connectors", description: "Reporting connectors" };
        const chosen = lines.length ? [pick(lines), pick(lines)] : [fallback];
        const total = monthly * (0.9 + R() * 0.2);
        chosen.forEach((line, i) => push(m, line, i === 0 ? total * 0.6 : total * 0.4, c.id, false));
      }
      const bill = BILLABLE_MONTHLY[c.id];
      if (bill && (m % 2 === 0 || c.id === "c_1")) push(m, bill, bill.amount * (0.85 + R() * 0.3), c.id, true);
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
