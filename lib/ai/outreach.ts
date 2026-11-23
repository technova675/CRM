import type { Channel, Lead, Sequence, Service } from "../types";
import { fillTemplate, firstName } from "../utils";
import { outreachAngle, recommendServices } from "./research";

// Short, specific hooks per service — used to make drafts read like a human wrote them.
const HOOKS: Record<Service, string> = {
  "Meta Ads": "a creative and measurement review", "Google Ads": "a search-intent and conversion review", "LinkedIn Ads": "a B2B audience and lead-quality review",
  Programmatic: "a channel-fit and measurement discussion", "Retail Media": "a product-listing and retail campaign review", "Quick Commerce": "a listing and local-demand review",
  SEO: "a search-discovery and content review", "AI Search Visibility (GEO / AEO)": "an AI answer visibility review", "Social Media": "a content and community discussion", "Influencer Marketing": "a creator-fit and measurement discussion",
  "AI Automation": "a review of repetitive sales and marketing work", "Video Production": "a video-content and audience discussion", "Brand Strategy": "a positioning and customer-message discussion", Consulting: "a short discovery conversation",
};

/** signature: the sender and agency lines; without one the message ends with a neutral sign-off and the sender's own mail signature. */
export function personalizeFirstMessage(lead: Lead, channel: Channel, service?: Service, signature?: string): { body: string; angle: string; service: Service } {
  const services=lead.research?.recommendedServices?.length?lead.research.recommendedServices:recommendServices(lead);
  const svc=service??services[0]??"Consulting";
  const angle=lead.research?.outreachAngle??outreachAngle(lead,services);
  const fact=lead.research?.mode?lead.research.sections.flatMap(section=>section.findings).find(finding=>finding.kind==="verified"&&finding.evidenceQuote&&/^https?:\/\//i.test(finding.source??"")):undefined;
  const quote=fact?.evidenceQuote&&fact.evidenceQuote.length>140?`${fact.evidenceQuote.slice(0,fact.evidenceQuote.lastIndexOf(" ",130))}…`:fact?.evidenceQuote;
  const context=fact?`I noticed this on your website: “${quote}” `:"";
  const question=`Would ${HOOKS[svc]} be useful for ${lead.company}${/s$/i.test(lead.company)?"'":"'s"} current priorities?`;
  const body=[`Hi ${firstName(lead.name)},`,`${context}${question}`,"If this is relevant, I'd be glad to compare notes and understand your goals before suggesting any work."];
  if(channel==="Email")body.push(`Best regards${signature?`,\n${signature}`:","}\n\nReply stop and we will not follow up.`);
  return {body:body.join(channel==="Email"?"\n\n":" "),angle,service:svc};
}

export function renderStep(template: string, lead: Lead, service: Service, angle: string) {
  return fillTemplate(template, {
    first_name: firstName(lead.name),
    company: lead.company,
    service,
    angle,
    industry: lead.industry,
    location: lead.location,
  });
}

export const DEFAULT_SEQUENCE: Sequence = {
  id: "seq_default",
  name: "Standard 4-touch",
  steps: [
    { id: "s0", dayOffset: 0, channel: "Email", template: "{{ai_first_message}}", condition: "always" },
    {
      id: "s1",
      dayOffset: 3,
      channel: "Email",
      template: "Hi {{first_name}}, bumping this in case it got buried — happy to send the {{service}} ideas for {{company}} as a short Loom instead.",
      condition: "no_reply",
    },
    {
      id: "s2",
      dayOffset: 7,
      channel: "LinkedIn",
      template: "Hi {{first_name}} — sent you a note about {{company}}'s {{service}}. Would a quick teardown be useful?",
      condition: "no_reply",
    },
    {
      id: "s3",
      dayOffset: 14,
      channel: "Email",
      template: "Hi {{first_name}}, I'll close the loop here. If {{service}} becomes a priority for {{company}} later, just reply to this thread.",
      condition: "no_reply",
    },
  ],
  stopRules: { onReply: true, onMeetingBooked: true, onOptOut: true, onNotInterested: true, onManualPause: true },
  sendWindow: { startHour: 9, endHour: 18, weekdaysOnly: true },
  dailyLimit: 150,
};

const OPT_OUT = /\b(stop|unsubscribe|remove me|not interested|opt.?out)\b/i;
const POSITIVE = /\b(yes|interested|sounds good|let'?s talk|call|meeting|sure|keen|send (it|over)|book)\b/i;
export function classifyReply(text: string): "positive" | "neutral" | "negative" {
  if (OPT_OUT.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}
export const isOptOut = (text: string) => OPT_OUT.test(text);
