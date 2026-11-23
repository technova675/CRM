import {z} from "zod";
import {LEAD_INDUSTRIES,SERVICES} from "../types.ts";
import type {EvidenceDocument} from "./researchEvidence.ts";

export function researchFindingSchemaFor(documents:EvidenceDocument[]){
  const ids=documents.filter(document=>document.status==="ok").map(document=>document.id);
  return z.object({
    text:z.string().max(1500),kind:z.enum(["verified","assumption","recommendation"]),
    sourceId:(ids.length?z.enum(ids as [string,...string[]]):z.null()).nullable().describe("Use only the exact ID of a supplied source. Never invent or modify an ID."),
    quote:z.string().min(12).max(280).nullable().describe("A verbatim substring of that source, including original spelling. Leave the finding out if unsupported."),
  });
}

export function researchSchemaFor(documents:EvidenceDocument[]){
  const finding=researchFindingSchemaFor(documents);
  return z.object({
    identity:z.object({status:z.enum(["verified","not_verified"]),reason:z.string().max(500),conflicts:z.array(z.string().max(300)).max(5)}),
    analysis:z.array(z.object({topic:z.enum(["website","social","business_model","products","audience","marketing","ads","content","competitors","growth"]),findings:z.array(finding).max(1)})).max(10),
    problems:z.array(finding).max(4),opportunities:z.array(finding).max(4),
    recommendedServices:z.array(z.object({service:z.enum(SERVICES),reason:z.string().max(1000),sourceId:finding.shape.sourceId,quote:finding.shape.quote})).max(4),
    outreachAngle:z.string().max(1500),
    // Sales hypotheses, separate from quoted findings: no quote required, always shown labelled as inference.
    insights:z.object({
      industry:z.enum(LEAD_INDUSTRIES).describe("Closest industry from the list."),
      whatTheyDo:z.string().max(300).describe("One plain sentence: what the company sells and to whom."),
      likelyGaps:z.array(z.string().max(300)).max(3).describe("Marketing gaps that are likely for this kind of business, worded with may/likely."),
      opportunities:z.array(z.string().max(300)).max(3).describe("Concrete marketing opportunities or experiments."),
      serviceFit:z.array(z.object({service:z.enum(SERVICES),why:z.string().max(300)})).max(3),
      outreachAngle:z.string().max(600).describe("A specific, non-generic opening line a salesperson could send."),
      questions:z.array(z.string().max(200)).max(3).describe("Discovery questions for the first call."),
    }).describe("Always fill this. It is shown labelled as AI inference and discarded by the application if identity is not verified."),
  });
}
