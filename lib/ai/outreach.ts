import type { Channel, Lead, Sequence, Service } from "../types";
import { fillTemplate, firstName } from "../utils";
import { outreachAngle, recommendServices } from "./research";

// Short, specific hooks per service — used to make drafts read like a human wrote them.
const HOOKS: Record<Service, string> = {
  "Meta Ads": "tightening Meta ad creative + audience structure usually cuts CPA by 20–30% within a month",
  "Google Ads": "a lot of search budget in this space leaks to broad-match terms that never convert",
  "LinkedIn Ads": "LinkedIn lead-gen forms with tight job-title targeting usually beat cold outbound on cost per meeting",
  Programmatic: "programmatic lets you reach in-market buyers at a fraction of premium placements",
  "Retail Media": "sponsored listings on Amazon tend to be the cheapest incremental sales once reviews are in place",
  "Quick Commerce": "Blinkit and Zepto ads can move trial fast in metros when the listing and offer are right",
  SEO: "a handful of high-intent pages can bring steady inbound without paying per click",
  "Social Media": "a consistent content system tends to lift inbound DMs more than one-off viral posts",
  "Influencer Marketing": "micro-creators in your niche often outperform big names on cost per sale",
  "AI Automation": "automating lead follow-up alone typically recovers 15–25% of leads that go cold",
  "Video Production": "a steady pipeline of short-form video usually lowers CPMs and keeps creative fatigue in check",
  "Brand Strategy": "a sharper positioning line makes every ad and post work harder",
  Consulting: "an outside audit usually surfaces 2–3 quick wins in the first week",
};

export function personalizeFirstMessage(lead: Lead, channel: Channel, service?: Service): { body: string; angle: string; service: Service } {
  const services = lead.research?.recommendedServices?.length ? lead.research.recommendedServices : recommendServices(lead);
  const svc = service ?? services[0]!;
  const angle = lead.research?.outreachAngle ?? outreachAngle(lead, services);
  const fn = firstName(lead.name);
  const hook = HOOKS[svc];

  const opener = lead.website
    ? `I was looking at ${lead.company}'s site`
    : lead.instagram
      ? `I came across ${lead.company} on Instagram`
      : `I came across ${lead.company} while looking at ${lead.industry.toLowerCase()} brands in ${lead.location}`;

  if (channel === "LinkedIn" || channel === "WhatsApp" || channel === "Instagram") {
    return {
      service: svc,
      angle,
      body: `Hi ${fn} — ${opener.toLowerCase().replace(/^i /, "I ")} and had a quick thought: ${hook}. Happy to share 2–3 specific ideas for ${lead.company} if useful?`,
    };
  }
  return {
    service: svc,
    angle,
    body: `Hi ${fn},\n\n${opener} and noticed an opportunity on the ${svc} side — ${hook}.\n\nFor a ${lead.industry.toLowerCase()} brand like ${lead.company}, I'd start with a short audit and share what we'd change first. No pitch deck, just specifics.\n\nWorth a 15-minute look next week?\n\nBest,\nTeam Adbibe\n\n—\nReply "stop" and we won't reach out again.`,
  };
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
