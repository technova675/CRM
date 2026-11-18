import type { LeadResearch, ResearchFinding } from "../types";

export function researchCitation(research: LeadResearch, finding: ResearchFinding) {
  if (!finding.sourceId || !finding.source || !finding.evidenceQuote || !/^https?:\/\//i.test(finding.source)) return undefined;
  return research.sources?.find(source => source.id === finding.sourceId && source.url === finding.source && source.status === "ok");
}
