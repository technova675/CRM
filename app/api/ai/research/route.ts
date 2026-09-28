import { generateText, Output } from "ai";
import { z } from "zod";
import { AI_MODEL, aiConfigured, SAFETY_RULES } from "@/lib/ai/provider";
import { SERVICES, type Lead, type LeadResearch } from "@/lib/types";

const finding = z.object({
  text: z.string(),
  kind: z.enum(["verified", "assumption", "recommendation"]),
  source: z.string().optional(),
});
const schema = z.object({
  summary: z.string().describe("3-4 sentence AI Lead Summary"),
  sections: z.array(z.object({ key: z.string(), title: z.string(), findings: z.array(finding) })),
  recommendedServices: z.array(z.enum(SERVICES)).max(4),
  outreachAngle: z.string(),
});

// Fetch the lead's public homepage and reduce it to readable text.
async function fetchSite(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "AdbibeResearchBot/1.0 (+https://adbibe.com)" } });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1];
    const hasPixel = /fbq\(|connect\.facebook\.net/.test(html);
    const hasGtag = /gtag\(|googletagmanager\.com/.test(html);
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 12_000);
    return { url: u.toString(), title, desc, hasPixel, hasGtag, text };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ research: null, error: "AI provider not configured" }, { status: 503 });
  const { lead } = (await req.json()) as { lead: Lead };
  const site = await fetchSite(lead.website);

  try {
    const { output } = await generateText({
      model: AI_MODEL,
      instructions: `${SAFETY_RULES}
You are Adbibe's lead research agent. Produce research sections with keys: overview, products, audience, marketing, website, ads, problems, opportunities.
Mark a finding "verified" ONLY if it is directly supported by the CRM record or the fetched website content, and set source to "CRM record" or the URL.
Anything inferred is "assumption". Suggestions are "recommendation". If the website could not be fetched, say so as a verified finding.
Adbibe services: ${SERVICES.join(", ")}.`,
      prompt: `CRM record:\n${JSON.stringify({ name: lead.name, company: lead.company, jobTitle: lead.jobTitle, industry: lead.industry, size: lead.companySize, location: lead.location, website: lead.website, linkedin: lead.linkedin, instagram: lead.instagram, notes: lead.notes })}\n\nWebsite fetch: ${
        site ? JSON.stringify({ url: site.url, title: site.title, metaDescription: site.desc, metaPixelDetected: site.hasPixel, googleTagDetected: site.hasGtag, text: site.text }) : "not available"
      }`,
      output: Output.object({ schema }),
    });
    const research: LeadResearch = { status: "done", generatedAt: new Date().toISOString(), ...output };
    return Response.json({ research });
  } catch (e) {
    return Response.json({ research: null, error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
