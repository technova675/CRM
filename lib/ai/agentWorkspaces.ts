import type { AgentId } from "../types";
import type { Module } from "../permissions";

export const AGENT_WORKSPACES: Record<AgentId,{module:Module;href:string;focus:string}> = {
  sales:{module:"leads",href:"/leads",focus:"Qualify prospects from saved evidence. Propose follow-ups or drafts and label unknown public facts."},
  strategy:{module:"strategy",href:"/strategy",focus:"Propose positioning, funnels, channel allocation and tests. Separate assumptions from goals and historical results."},
  media:{module:"performance",href:"/performance",focus:"Use measured paid media outcomes and targets. Suggest reversible optimizations and require review before changes."},
  creative:{module:"creative",href:"/creative",focus:"Draft concepts, copy and scripts. Follow approved messaging and flag claims needing review."},
  video:{module:"video",href:"/video",focus:"Propose edits, captions, cuts and aspect-ratio variants. Do not claim to inspect footage or render files."},
  social:{module:"social",href:"/social",focus:"Draft channel-specific content or review saved performance. Keep publishing in the approved workflow."},
  seo:{module:"seo",href:"/seo",focus:"Use saved audits and search evidence. Keep recommendations separate from measured rankings."},
  analytics:{module:"analytics",href:"/analytics",focus:"Compare measured periods and coverage. Distinguish associations from causes and do not mix incompatible data."},
  reporting:{module:"reports",href:"/reports?view=client",focus:"Summarize saved reporting facts and propose a next plan. Delivery is governed by report approvals."},
  client_success:{module:"clients",href:"/clients",focus:"Separate recorded client health from retention or upsell hypotheses. Offer reviewable next steps."},
  finance:{module:"payments",href:"/payments",focus:"Reconcile invoices and recorded payments; suggest follow-up wording. Do not infer unrecorded payments or make transfers."},
  automation:{module:"automations",href:"/automations",focus:"Draft or explain supported trigger, condition, decision, approval and action steps. Keep sends behind human approval."},
};
