import type { Lead, LeadScore, ScoreFactor, ScoringCriterion } from "../types";

// Industries where Adbibe's paid + social services typically fit best.
const HIGH_FIT_INDUSTRIES = ["D2C / E-commerce", "Real Estate", "Education", "Healthcare", "Hospitality", "Fashion", "Beauty"];
const MID_FIT_INDUSTRIES = ["SaaS", "Fintech", "Automotive", "Food & Beverage", "Fitness"];
const SENIOR_TITLES = /(founder|ceo|cmo|chief|director|head|vp|owner|partner|gm|marketing manager)/i;

export const DEFAULT_CRITERIA: ScoringCriterion[] = [
  { key: "relevance", label: "Company relevance", weight: 15, enabled: true },
  { key: "industry", label: "Industry fit", weight: 15, enabled: true },
  { key: "size", label: "Company size", weight: 10, enabled: true },
  { key: "marketing", label: "Marketing activity", weight: 10, enabled: true },
  { key: "ads", label: "Potential advertising needs", weight: 10, enabled: true },
  { key: "website", label: "Website quality", weight: 10, enabled: true },
  { key: "social", label: "Social presence", weight: 10, enabled: true },
  { key: "budget", label: "Budget signals", weight: 10, enabled: true },
  { key: "fit", label: "Fit with Adbibe services", weight: 10, enabled: true },
];

type Eval = (lead: Lead) => { ratio: number; reason: string };

const evaluators: Record<string, Eval> = {
  relevance: (l) =>
    SENIOR_TITLES.test(l.jobTitle)
      ? { ratio: 1, reason: `Contact is a decision-maker (${l.jobTitle})` }
      : { ratio: 0.4, reason: `Contact title "${l.jobTitle}" may not own budget` },
  industry: (l) =>
    HIGH_FIT_INDUSTRIES.includes(l.industry)
      ? { ratio: 1, reason: `${l.industry} is a core Adbibe vertical` }
      : MID_FIT_INDUSTRIES.includes(l.industry)
        ? { ratio: 0.6, reason: `${l.industry} is a secondary vertical` }
        : { ratio: 0.3, reason: `${l.industry || "Unknown industry"} is outside focus verticals` },
  size: (l) => {
    const m: Record<string, [number, string]> = {
      "1-10": [0.3, "Very small team — limited budget likely"],
      "11-50": [0.7, "SMB — good fit for managed services"],
      "51-200": [1, "Mid-market — ideal retainer size"],
      "201-1000": [0.9, "Large — multi-service potential"],
      "1000+": [0.6, "Enterprise — longer sales cycle"],
    };
    const [ratio, reason] = m[l.companySize] ?? [0.4, "Company size unknown"];
    return { ratio, reason };
  },
  marketing: (l) => {
    const n = [l.instagram, l.linkedin, l.website].filter(Boolean).length;
    return { ratio: n / 3, reason: `${n}/3 marketing channels on record (website, LinkedIn, Instagram)` };
  },
  ads: (l) =>
    ["D2C / E-commerce", "Real Estate", "Education", "Hospitality", "Fashion", "Beauty"].includes(l.industry)
      ? { ratio: 1, reason: "Industry typically relies on performance ads" }
      : { ratio: 0.5, reason: "Ad dependency for this industry is moderate (assumption)" },
  website: (l) =>
    l.website
      ? l.website.startsWith("https")
        ? { ratio: 0.8, reason: "Has a secure website on record (not yet audited)" }
        : { ratio: 0.5, reason: "Website on record is not HTTPS" }
      : { ratio: 0.1, reason: "No website on record" },
  social: (l) =>
    l.instagram && l.linkedin
      ? { ratio: 1, reason: "Active on both Instagram and LinkedIn (per record)" }
      : l.instagram || l.linkedin
        ? { ratio: 0.6, reason: "Present on one social network" }
        : { ratio: 0.1, reason: "No social profiles on record" },
  budget: (l) => {
    const big = ["51-200", "201-1000", "1000+"].includes(l.companySize);
    const senior = SENIOR_TITLES.test(l.jobTitle);
    const ratio = (big ? 0.6 : 0.2) + (senior ? 0.4 : 0);
    return { ratio, reason: `${big ? "Company size" : "Small size"}${senior ? " + senior contact" : ""} suggest ${ratio > 0.7 ? "healthy" : "limited"} budget` };
  },
  fit: (l) =>
    l.services.length >= 2
      ? { ratio: 1, reason: `Needs ${l.services.length} Adbibe services (${l.services.slice(0, 3).join(", ")})` }
      : l.services.length === 1
        ? { ratio: 0.7, reason: `Needs ${l.services[0]}` }
        : { ratio: 0.3, reason: "No services identified yet" },
};

export function scoreLead(lead: Lead, criteria: ScoringCriterion[] = DEFAULT_CRITERIA): LeadScore {
  const active = criteria.filter((c) => c.enabled && evaluators[c.key]);
  const totalWeight = active.reduce((a, c) => a + c.weight, 0) || 1;
  const factors: ScoreFactor[] = active.map((c) => {
    const { ratio, reason } = evaluators[c.key]!(lead);
    const max = (c.weight / totalWeight) * 100;
    return { key: c.key, label: c.label, max: Math.round(max), points: Math.round(max * ratio), reason };
  });
  const value = Math.min(100, factors.reduce((a, f) => a + f.points, 0));
  return {
    value,
    factors,
    override: lead.score?.override,
    overrideReason: lead.score?.overrideReason,
    scoredAt: new Date().toISOString(),
  };
}

export const effectiveScore = (l: Lead) => l.score?.override ?? l.score?.value ?? 0;

export const scoreTier = (s: number) => (s >= 75 ? "Hot" : s >= 55 ? "Warm" : s >= 35 ? "Cool" : "Cold");
