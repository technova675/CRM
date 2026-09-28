import type { AdRow, AdStats, Campaign } from "../types";
import { makeRand } from "./context";

const PLATFORM_BY_SERVICE: Partial<Record<Campaign["service"], AdRow["platform"]>> = {
  "Meta Ads": "Meta",
  "Google Ads": "Google",
  "LinkedIn Ads": "LinkedIn",
  Programmatic: "Programmatic",
  "Retail Media": "Amazon",
  "Quick Commerce": "Blinkit",
};

const HOOKS = [
  "POV: you finally found…", "Stop scrolling if you…", "3 mistakes everyone makes with…", "I tried this for 30 days",
  "The real reason your … isn't working", "Founder story: why we started", "Before / after in 7 days", "What ₹999 gets you",
  "Customer unboxing", "Don't buy … until you watch this",
];
const AUDIENCES = ["Broad 25-44", "Lookalike 1% purchasers", "Interest: wellness", "Retargeting 30d visitors", "In-market: home buyers", "Custom intent keywords", "Engaged shoppers", "Job title: marketing heads"];
const PLACEMENTS: Record<AdRow["platform"], string[]> = {
  Meta: ["Reels", "Feed", "Stories"],
  Google: ["Search", "PMax", "YouTube"],
  LinkedIn: ["Feed", "Lead gen form"],
  Programmatic: ["Display", "CTV", "Native"],
  Amazon: ["Sponsored products", "Sponsored brands"],
  Blinkit: ["Search listing", "Homepage banner"],
};
const GEOS = ["Mumbai", "Bengaluru", "Delhi NCR", "Pune", "Hyderabad", "Tier-2 India", "Pan-India"];

function stats(r: () => number, spend: number, ctr: number, cvr: number, aov: number): AdStats {
  const impressions = Math.round(spend * (22 + r() * 14));
  const clicks = Math.round(impressions * ctr);
  const conversions = Math.max(0, Math.round(clicks * cvr));
  return { spend: Math.round(spend), impressions, clicks, conversions, leads: Math.round(conversions * (1.6 + r())), revenue: Math.round(conversions * aov) };
}

// Ad-level rows for every paid campaign. Deliberately includes winners, losers,
// fatigued creatives and rising-CPA ads so the Media / Analytics agents have real signals.
export function seedAds(campaigns: Campaign[]): AdRow[] {
  const { R, pick, int } = makeRand(4242);
  const out: AdRow[] = [];
  campaigns.forEach((c, ci) => {
    const platform = PLATFORM_BY_SERVICE[c.service];
    if (!platform) return;
    const n = int(3, 5);
    const weekly = c.budget / 4.3 / n;
    for (let i = 0; i < n; i++) {
      const archetype = (ci + i) % 5; // 0 winner · 1 steady · 2 fatigue · 3 loser · 4 rising CPA
      const aov = 1800 + R() * 3200;
      const baseCtr = platform === "Google" ? 0.035 + R() * 0.03 : 0.009 + R() * 0.012;
      // Click → purchase rates tuned so CPA lands near ₹500–1,200 and ROAS ≈ 2–6x.
      const baseCvr = platform === "Google" ? 0.0009 + R() * 0.0009 : 0.002 + R() * 0.0022;
      const prev = stats(R, weekly * (0.8 + R() * 0.4), baseCtr, baseCvr, aov);
      const ctrMul = archetype === 0 ? 1.12 : archetype === 2 ? 0.62 : archetype === 3 ? 0.8 : archetype === 4 ? 0.92 : 1;
      const cvrMul = archetype === 0 ? 1.15 : archetype === 2 ? 0.8 : archetype === 3 ? 0.55 : archetype === 4 ? 0.7 : 1.02;
      const spendMul = archetype === 0 ? 1.05 : archetype === 4 ? 1.25 : 1;
      const curr = stats(R, weekly * spendMul * (0.85 + R() * 0.3), baseCtr * ctrMul, baseCvr * cvrMul, aov);
      out.push({
        id: `ad_${ci}_${i}`,
        campaignId: c.id,
        clientId: c.clientId,
        name: `${c.name.split(" · ")[0]} — ${platform === "Google" ? pick(["Brand", "Generic", "Competitor", "PMax"]) : pick(["Hook", "UGC", "Offer", "Demo", "Testimonial"])} ${i + 1}`,
        platform,
        format: platform === "Google" ? "Search" : pick(["Video", "Video", "Static", "Carousel", "UGC"] as const),
        hook: platform === "Google" ? undefined : pick(HOOKS),
        audience: pick(AUDIENCES),
        placement: pick(PLACEMENTS[platform]),
        geography: pick(GEOS),
        status: archetype === 3 && R() > 0.7 ? "Paused" : "Active",
        prev,
        curr,
        frequency: +(archetype === 2 ? 4.2 + R() * 2.5 : 1.3 + R() * 1.8).toFixed(1),
      });
    }
  });
  return out;
}
