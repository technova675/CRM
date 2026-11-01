import type { Lead, LeadResearch, Service } from "../types";
import { evidenceResearch } from "./researchEvidence";

// Local research engine. It only uses facts stored on the lead record and labels
// everything else as an assumption or recommendation — it never invents facts.
// When an AI provider is configured, /api/ai/research enriches this with the
// lead's public website content (see app/api/ai/research/route.ts).

const SERVICE_BY_INDUSTRY: Record<string, Service[]> = {
  "D2C / E-commerce": ["Meta Ads", "Google Ads", "Influencer Marketing"],
  "Real Estate": ["Meta Ads", "Google Ads", "AI Automation"],
  Education: ["Google Ads", "Meta Ads", "SEO"],
  Healthcare: ["SEO", "Google Ads", "Social Media"],
  Hospitality: ["Social Media", "Influencer Marketing", "Meta Ads"],
  Fashion: ["Influencer Marketing", "Meta Ads", "Social Media"],
  Beauty: ["Influencer Marketing", "Meta Ads", "Social Media"],
  SaaS: ["Google Ads", "SEO", "AI Automation"],
  Fintech: ["Google Ads", "Programmatic", "Brand Strategy"],
  Automotive: ["Programmatic", "Google Ads", "Meta Ads"],
  "Food & Beverage": ["Social Media", "Influencer Marketing", "Meta Ads"],
  Fitness: ["Social Media", "Meta Ads", "Influencer Marketing"],
};

export function recommendServices(lead: Lead): Service[] {
  const base = SERVICE_BY_INDUSTRY[lead.industry] ?? ["Brand Strategy", "Consulting", "SEO"];
  const set = new Set<Service>([...lead.services, ...base]);
  if (!lead.website) set.add("SEO");
  return [...set].slice(0, 4);
}

export function outreachAngle(lead: Lead, services = recommendServices(lead)): string {
  return `Ask ${lead.company} about its current priorities and whether a short ${services[0] ?? "marketing"} discovery conversation would be useful. Confirm needs before suggesting work; do not claim an audit or results that have not been established.`;
}

export function runLocalResearch(lead: Lead): LeadResearch {
  return evidenceResearch(lead, [], null, ["Public research has not run. CRM details are supplied information, not independently verified public facts."]);
}
