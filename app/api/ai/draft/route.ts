import { generateText } from "ai";
import { AI_MODEL, aiConfigured, SAFETY_RULES } from "@/lib/ai/provider";
import type { Lead } from "@/lib/types";

// Generates a personalized outreach / follow-up message for one lead.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const { lead, channel, kind, context } = (await req.json()) as { lead: Lead; channel: string; kind: "first" | "follow_up" | "reply"; context?: string };
  try {
    const { text } = await generateText({
      model: AI_MODEL,
      instructions: `${SAFETY_RULES}
Write a ${kind === "first" ? "first outreach" : kind === "reply" ? "reply" : "follow-up"} message from the Adbibe team for the ${channel} channel.
Sound like a thoughtful human, not a template: one specific observation, one relevant idea, one low-friction ask.
${channel === "Email" ? "Max 110 words. Include a one-line opt-out note at the end." : "Max 60 words. No subject line."}
Do not claim facts that are not in the lead data. Output only the message body.`,
      prompt: JSON.stringify({ lead: { name: lead.name, company: lead.company, title: lead.jobTitle, industry: lead.industry, location: lead.location, website: lead.website, research: lead.research?.summary, angle: lead.research?.outreachAngle, services: lead.research?.recommendedServices }, conversation: context }),
    });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
