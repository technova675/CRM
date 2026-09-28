import type { Lead, LeadResearch, ResearchFinding, Service } from "../types";

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

const v = (text: string, source = "CRM record"): ResearchFinding => ({ text, kind: "verified", source });
const a = (text: string): ResearchFinding => ({ text, kind: "assumption" });
const r = (text: string): ResearchFinding => ({ text, kind: "recommendation" });

export function recommendServices(lead: Lead): Service[] {
  const base = SERVICE_BY_INDUSTRY[lead.industry] ?? ["Brand Strategy", "Consulting", "SEO"];
  const set = new Set<Service>([...lead.services, ...base]);
  if (!lead.website) set.add("SEO");
  return [...set].slice(0, 4);
}

export function outreachAngle(lead: Lead, services = recommendServices(lead)): string {
  const s = services[0];
  if (!lead.website) return `${lead.company} has no website on record — open with how a conversion-focused site + ${s} could turn existing social attention into leads.`;
  if (!lead.instagram && ["Fashion", "Beauty", "D2C / E-commerce", "Food & Beverage"].includes(lead.industry))
    return `Brands in ${lead.industry} win on Instagram; ${lead.company} has no Instagram on record — lead with a creator-led content test.`;
  return `Reference ${lead.company}'s position in ${lead.industry} (${lead.location}) and offer a short ${s} audit with 2–3 specific quick wins.`;
}

export function runLocalResearch(lead: Lead): LeadResearch {
  const services = recommendServices(lead);
  const angle = outreachAngle(lead, services);
  const channels = [lead.website && "website", lead.linkedin && "LinkedIn", lead.instagram && "Instagram"].filter(Boolean) as string[];

  const sections: LeadResearch["sections"] = [
    {
      key: "overview",
      title: "Company overview",
      findings: [
        v(`${lead.company} — ${lead.industry}, ${lead.companySize} employees, based in ${lead.location}.`),
        v(`Primary contact: ${lead.name}, ${lead.jobTitle}.`),
        a("Detailed business model not yet verified — connect an AI provider to analyze the public website."),
      ],
    },
    {
      key: "products",
      title: "Products / services",
      findings: [a(`Likely offers ${lead.industry.toLowerCase()} products/services; exact catalogue unverified.`)],
    },
    {
      key: "audience",
      title: "Target audience",
      findings: [a(`Probably serves customers in and around ${lead.location}; confirm on discovery call.`)],
    },
    {
      key: "marketing",
      title: "Marketing activity & social presence",
      findings: [
        channels.length
          ? v(`Channels on record: ${channels.join(", ")}.`)
          : v("No website or social profiles on record."),
        ...(lead.instagram ? [v(`Instagram: ${lead.instagram}`, "Lead record")] : []),
        ...(lead.linkedin ? [v(`LinkedIn: ${lead.linkedin}`, "Lead record")] : []),
      ],
    },
    {
      key: "website",
      title: "Website analysis",
      findings: lead.website
        ? [v(`Website: ${lead.website}`, "Lead record"), a("Speed, SEO and tracking setup not yet audited.")]
        : [v("No website on record."), r("A landing page is a prerequisite before scaling paid ads.")],
    },
    {
      key: "ads",
      title: "Advertising activity",
      findings: [a("No publicly observable ad data checked yet (Meta Ad Library / Google Ads Transparency).")],
    },
    {
      key: "problems",
      title: "Potential marketing problems",
      findings: [
        ...(!lead.website ? [a("Without a website, paid traffic has nowhere to convert.")] : []),
        ...(!lead.instagram ? [a("Missing Instagram presence limits social proof for a consumer audience.")] : []),
        a("Attribution / conversion tracking status unknown."),
      ],
    },
    {
      key: "opportunities",
      title: "Growth opportunities",
      findings: services.map((s) => r(`${s} for ${lead.company}`)),
    },
  ];

  const summary = `${lead.company} is a ${lead.companySize}-person ${lead.industry} business in ${lead.location} (verified from CRM). ${
    channels.length ? `Active on ${channels.join(", ")}.` : "No digital channels on record."
  } Recommended first offer: ${services[0]}. Angle: ${angle}`;

  return {
    status: "done",
    generatedAt: new Date().toISOString(),
    summary,
    sections,
    recommendedServices: services,
    outreachAngle: angle,
  };
}
