import { generateText, Output } from "ai";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { can } from "@/lib/permissions";
import { dbError } from "@/lib/db";
import { aiConfigured, SAFETY_RULES, withModelFallback } from "@/lib/ai/provider";
import { analyticsNarrative, buildInvestigation, investigationInput } from "@/lib/domain/analyticsInvestigation";

export const maxDuration = 90;
const running = new Set<string>();
const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Request origin is not allowed." }, 403);
  try {
    const user = await reportIdentity(req);
    let body;
    try { body = await boundedJSON(req, 4000); } catch { return reply({ error: "Invalid investigation request." }, 400); }
    const input = investigationInput.safeParse(body);
    if (!input.success) return reply({ error: "Choose a valid feed, metric and date window." }, 400);
    const library = await ownedLibrary(user.userId);
    if (!library) return reply({ error: "Save or import measured data into your CRM account first." }, 404);
    const actor = library.team.find(member => member.id === user.userId);
    if (!actor || actor.status !== "active" || actor.role === "client" || !can(actor.role, "analytics")) return reply({ error: "You need staff access to Analytics." }, 403);
    if (input.data.clientId !== "All" && !library.clients.some(client => client.id === input.data.clientId)) return reply({ error: "Client not found in this account." }, 404);
    const brief = buildInvestigation(library, input.data);
    if (!brief) return reply({ error: "Feed not found for this account and client." }, 404);
    if (!input.data.explain || "reason" in brief || !brief.comparable) return reply({ brief });
    if (!can(actor.role, "analytics", "write")) return reply({ brief, note: "Your role can review measured evidence. AI generation requires Analytics write access." });
    if (!aiConfigured()) return reply({ brief, note: "The AI provider is unavailable. Measured evidence is shown below." });
    if (running.has(user.userId)) return reply({ brief, note: "An AI investigation is already running for this account. Try again once it finishes." });
    running.add(user.userId);
    try {
      // Send computed aggregates and opaque references. Source labels, client names,
      // campaign names, URLs, CRM records and individual rows stay in the app.
      const evidence = brief.evidence.map(({ id, topic, metric, current, previous, delta, detail, grain }) => ({
        id, topic, metric, current, previous, delta, detail, grain,
      }));
      const ids = new Set(evidence.map(item => item.id));
      const result = await withModelFallback(user.userId,async (model, provider) => {
        const response = await generateText({
          model, output: Output.object({ schema: analyticsNarrative }), maxOutputTokens: 3000, maxRetries: 0,
          abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(35000)]),
          providerOptions: provider.startsWith("groq") ? { groq: { reasoningEffort: "low" } } : undefined,
          instructions: SAFETY_RULES + " Investigate two adjacent equal calendar windows using only the supplied aggregates. The app renders the verified headline. For why, give cautious, competing hypotheses with a verification step. Treat segment movements as associations. A null delta means unavailable; use coverage and small samples to qualify confidence. Do not infer competitor behavior, platform settings, funnel steps, landing page changes or causes from missing data. Never invent a number, benchmark, client name or result. Keep statements specific to the evidence categories and cite only supplied evidence IDs. Recommend prioritized investigation or reversible actions. Give tests with one variable, a comparison group, a success metric and a decision rule. Any proposed target must be clearly prospective. Do not claim to have executed a change.",
          prompt: JSON.stringify({ metric: input.data.metric, daysPerWindow: input.data.days, currency: brief.currency, primary: brief.primary?.id, evidence, gaps: brief.gaps }),
        });
        const output = response.output;
        if (!output || [...output.hypotheses, ...output.actions, ...output.tests].some(item => item.evidenceIds.some(id => !ids.has(id)))) throw new Error("Invalid evidence references");
        return { narrative: output, provider };
      });
      return reply({ brief, ...result });
    } catch {
      return reply({ brief, note: "The AI explanation could not be completed. Review the measured evidence or retry." });
    } finally { running.delete(user.userId); }
  } catch (error) { return dbError(error); }
}
