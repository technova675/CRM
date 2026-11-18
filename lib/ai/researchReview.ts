import { z } from "zod";
import { groundFinding, type EvidenceDocument, type ProposedFinding, type ProposedResearch } from "./researchEvidence.ts";

export const researchReviewSchema = z.object({
  identity: z.object({status: z.enum(["verified", "not_verified"]), reason: z.string().max(500), conflicts: z.array(z.string().max(300)).max(5)}),
  sources: z.array(z.object({sourceId: z.string(), relevance: z.enum(["matched", "uncertain", "mismatched"]), reason: z.string().max(400)})).max(15),
  findings: z.array(z.object({id: z.string(), accept: z.boolean(), reason: z.string().max(400)})).max(30),
});
export type ResearchReview = z.infer<typeof researchReviewSchema>;

export function researchCandidates(proposal: ProposedResearch) {
  return [
    ...proposal.analysis.flatMap((item, i) => item.findings.map((finding, j) => ({id: `analysis-${i}-${j}`, topic: item.topic, finding}))),
    ...proposal.problems.map((finding, i) => ({id: `problem-${i}`, topic: "potential_problem", finding})),
    ...proposal.opportunities.map((finding, i) => ({id: `opportunity-${i}`, topic: "growth_opportunity", finding})),
    ...proposal.recommendedServices.map((service, i) => ({id: `service-${i}`, topic: `recommended_service: ${service.service}`, finding: {text: service.reason, kind: "recommendation" as const, sourceId: service.sourceId, quote: service.quote}})),
  ];
}

export function researchReviewSchemaFor(documents: EvidenceDocument[], proposal: ProposedResearch) {
  const sourceIds=documents.filter(document=>document.status==="ok").map(document=>document.id);
  const candidateIds=researchCandidates(proposal).map(candidate=>candidate.id);
  return researchReviewSchema.extend({
    sources:z.array(researchReviewSchema.shape.sources.element.extend({sourceId:sourceIds.length?z.enum(sourceIds as [string,...string[]]):z.string()})).length(sourceIds.length),
    findings:z.array(researchReviewSchema.shape.findings.element.extend({id:candidateIds.length?z.enum(candidateIds as [string,...string[]]):z.string()})).length(candidateIds.length),
  });
}

// The reviewer cannot introduce or rewrite claims. Missing, duplicate or uncertain
// decisions fail closed, and even accepted claims still require an exact quote.
export function applyResearchReview(proposal: ProposedResearch, documents: EvidenceDocument[], review: ResearchReview) {
  const candidates = researchCandidates(proposal);
  const identityVerified = proposal.identity?.status === "verified" && review.identity.status === "verified";
  const relevant = documents.filter(document => {
    const decisions = review.sources.filter(item => item.sourceId === document.id);
    return document.status === "ok" && decisions.length === 1 && decisions[0].relevance === "matched";
  });
  const accept = (id: string, finding: ProposedFinding) => {
    const decisions = review.findings.filter(item => item.id === id);
    const grounded = groundFinding(finding, relevant);
    return identityVerified && decisions.length === 1 && decisions[0].accept && !!grounded?.evidenceQuote;
  };
  const approved = new Set(candidates.filter(candidate => accept(candidate.id, candidate.finding)).map(candidate => candidate.id));
  const identity = identityVerified ? review.identity : {
    status: "not_verified" as const,
    reason: proposal.identity?.status !== "verified" ? proposal.identity?.reason || "Company identity was not established." : review.identity.reason,
    conflicts: [...new Set([...(proposal.identity?.conflicts ?? []), ...review.identity.conflicts])],
  };
  const filtered: ProposedResearch = {
    ...proposal, identity,
    analysis: proposal.analysis.map((item, i) => ({...item, findings: item.findings.filter((_, j) => approved.has(`analysis-${i}-${j}`))})),
    problems: proposal.problems.filter((_, i) => approved.has(`problem-${i}`)),
    opportunities: proposal.opportunities.filter((_, i) => approved.has(`opportunity-${i}`)),
    recommendedServices: proposal.recommendedServices.filter((_, i) => approved.has(`service-${i}`)),
    outreachAngle: "", // The display layer builds this from the accepted company evidence.
  };
  const auditedDocuments = documents.map(document => {
    if (document.status !== "ok") return document;
    const decisions = review.sources.filter(item => item.sourceId === document.id);
    const decision = decisions.length === 1 ? decisions[0] : undefined;
    return {...document, reason: `Source relevance: ${decision?.relevance ?? "uncertain"}. ${decision?.reason ?? "The verification pass did not establish this source's relevance."}`};
  });
  return {proposal: filtered, documents: auditedDocuments, accepted: approved.size, rejected: candidates.length - approved.size};
}

// Give every readable source a share of the prompt, including later search results.
// Separate excerpts preserve exact quotations and avoid treating omitted text as read.
export function researchSourcePacket(documents: EvidenceDocument[], budget = 60000) {
  const readable = documents.filter(document => document.status === "ok").slice(0, 15);
  const perSource = Math.min(10000, Math.floor(budget / Math.max(readable.length, 1)));
  return readable.map(({id, url, title, text, checkedAt}) => ({id, url, title, checkedAt,
    excerpts: text.length <= perSource ? [text] : [text.slice(0, Math.floor(perSource * 0.6)), text.slice(-Math.floor(perSource * 0.4))],
  }));
}
