import { generateText, Output } from "ai";
import { z } from "zod";
import { AI_MODEL, aiConfigured, SAFETY_RULES } from "@/lib/ai/provider";
import { AGENTS } from "@/lib/ai/agents";
import { AGENT_IDS, type AgentId } from "@/lib/types";

// Strict structured-output providers (Groq) reject optional keys, so "source" is nullable
// in the schema and stripped back to optional before returning.
const insight = z.object({
  text: z.string(),
  kind: z.enum(["data", "assumption", "recommendation"]),
  source: z.string().nullable(),
});
const insightsSchema = z.object({
  summary: z.string().describe("2-4 sentence answer"),
  insights: z.array(insight).max(20),
  nextSteps: z.array(z.string()).max(8),
});

// Generic endpoint for every specialised agent. The caller passes only the
// authorized, pre-filtered context for the current user (never other orgs/clients).
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const body = (await req.json()) as { agent: AgentId; task: string; context?: unknown; format?: "text" | "insights"; knowledge?: unknown };
  if (!AGENT_IDS.includes(body.agent) || !body.task) return Response.json({ error: "agent and task required" }, { status: 400 });
  const a = AGENTS[body.agent];
  const instructions = `${SAFETY_RULES}
You are the ${a.name} inside Adbibe's agency operating system. ${a.description}
Capabilities: ${a.capabilities.join(", ")}.
Use ONLY the JSON context and client knowledge provided. Tag every insight: "data" (directly in the context — cite the source), "assumption" (your inference), "recommendation" (what to do).
Never claim an action was executed — humans approve consequential actions. Use ₹ for money.
Client knowledge base: ${JSON.stringify(body.knowledge ?? {}).slice(0, 8_000)}
Context: ${JSON.stringify(body.context ?? {}).slice(0, 50_000)}`;
  try {
    if (body.format === "insights") {
      const { output } = await generateText({ model: AI_MODEL, instructions, prompt: body.task, output: Output.object({ schema: insightsSchema }) });
      return Response.json({ ...output, insights: output.insights.map(({ source, ...i }) => (source ? { ...i, source } : i)) });
    }
    const { text } = await generateText({ model: AI_MODEL, instructions, prompt: body.task });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
