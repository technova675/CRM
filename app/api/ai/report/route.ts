import { generateText, isStepCount, Output, tool } from "ai";
import { z } from "zod";
import { aiConfigured, SAFETY_RULES, withModelFallback } from "@/lib/ai/provider";
import { buildFacts, localReport, windowLabel, type AgentReportContent, type ReportDataset } from "@/lib/ai/reporting";

export const maxDuration = 120;

const num = z.number().finite();
const stats = z.object({ spend: num, impressions: num, clicks: num, conversions: num, revenue: num, leads: num });
const datasetSchema = z.object({
  client: z.object({ id: z.string(), company: z.string().max(200), industry: z.string().max(200) }),
  days: z.number().int().min(1).max(365),
  campaigns: z.array(z.object({
    id: z.string(), label: z.string().max(300), platform: z.string().max(200), status: z.string().max(40),
    kpis: z.array(z.object({ label: z.string().max(80), target: num, actual: num, unit: z.string().max(10).optional() })).max(20),
    metrics: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), spend: num, impressions: num, reach: num, clicks: num, leads: num, conversions: num, revenue: num })).max(800),
  })).max(300),
  ads: z.array(z.object({ name: z.string().max(300), platform: z.string().max(60), format: z.string().max(60), frequency: num, prev: stats, curr: stats })).max(300),
  recommendations: z.array(z.object({ title: z.string().max(300), recommendation: z.string().max(1000), priority: z.enum(["High", "Medium", "Low"]), impact: z.string().max(300).optional() })).max(20),
  plannedTests: z.array(z.object({ week: z.string().max(60), test: z.string().max(400), hypothesis: z.string().max(600) })).max(20),
  focus: z.string().max(600).optional(),
});

// Strict structured-output providers (Groq) reject optional keys, so "source" is nullable here.
const item = z.object({ text: z.string(), kind: z.enum(["data", "assumption", "recommendation"]), source: z.string().nullable() });
const reportSchema = z.object({
  headline: z.string().describe("One line, under 90 characters, leading with the single most important result"),
  summary: z.string().describe("Executive summary: 3-5 plain sentences for the client. No bullet points."),
  insights: z.array(item).max(6).describe("Why the numbers look the way they do"),
  changes: z.array(item).max(6).describe("What changed versus the previous period"),
  recommendations: z.array(z.object({ text: z.string(), priority: z.enum(["High", "Medium", "Low"]) })).max(6),
  plan: z.array(z.string()).max(5).describe("Next month's plan, one action per item"),
  emailSubject: z.string(),
  emailBody: z.string().describe("Short plain-text cover email to the client, under 150 words, signed off as Adbibe"),
});

// Tool-calling reporting agent: the model investigates one client's numbers through tools
// (all arithmetic happens in lib/ai/reporting.ts), then writes the report as structured output.
export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const parsed = datasetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid report dataset" }, { status: 400 });
  const ds: ReportDataset = parsed.data;
  const facts = buildFacts(ds);
  if (!facts.daysWithData) return Response.json({ error: "No performance data in this period" }, { status: 422 });

  const steps: AgentReportContent["steps"] = [];
  const evidence: Record<string, unknown> = {};
  const gather = <T,>(name: string, detail: string, result: T) => {
    if (!(name in evidence)) steps.push({ tool: name, detail });
    evidence[name] = result;
    return result;
  };
  const overview = () => gather("get_overview", `Totalled ${facts.daysWithData} day(s) of data and compared with the previous ${facts.window.days} days`, { window: facts.window, daysWithData: facts.daysWithData, current: facts.current, previous: facts.previous, changePct: facts.changePct });
  const breakdown = () => gather("get_campaign_breakdown", `Ranked ${facts.campaigns.length} campaign(s) by spend, ROAS and CPA`, facts.campaigns);
  const goals = () => gather("get_goal_progress", `Checked ${facts.goals.length} KPI target(s)`, facts.goals);

  const none = z.object({});
  const tools = {
    get_overview: tool({ description: "Account totals for the reporting period, the previous period, and the % change of every metric. Call this first.", inputSchema: none, execute: async () => overview() }),
    get_campaign_breakdown: tool({ description: "Per-campaign spend, revenue, ROAS, CPA, share of spend/revenue and change vs the previous period.", inputSchema: none, execute: async () => breakdown() }),
    get_weekly_trend: tool({ description: "Week-by-week spend, revenue, leads, conversions, CPA and ROAS inside the reporting period.", inputSchema: none, execute: async () => gather("get_weekly_trend", `Read the trend across ${facts.weekly.length} week(s)`, facts.weekly) }),
    find_anomalies: tool({ description: "Days where spend, conversions, CPA or ROAS were far from the period average.", inputSchema: none, execute: async () => gather("find_anomalies", `${facts.anomalies.length} unusual day(s) found`, facts.anomalies) }),
    get_goal_progress: tool({ description: "Campaign KPI targets versus actuals.", inputSchema: none, execute: async () => goals() }),
    get_creative_performance: tool({ description: "Top ads/creatives over the last 7 days with ROAS change vs the week before and frequency.", inputSchema: none, execute: async () => gather("get_creative_performance", `Reviewed ${facts.creatives.length} ad(s)`, facts.creatives) }),
    get_open_recommendations: tool({ description: "Open recommendations from the other agents and the tests planned in the client's strategy.", inputSchema: none, execute: async () => gather("get_open_recommendations", `Read ${facts.openRecommendations.length} open recommendation(s) and ${facts.plannedTests.length} planned test(s)`, { openRecommendations: facts.openRecommendations, plannedTests: facts.plannedTests }) }),
  };

  const role = `${SAFETY_RULES}
You are the Reporting Agent inside Adbibe's agency operating system. You are preparing a client performance report for ${facts.client} (${ds.client.industry}) covering ${windowLabel(facts.window)}.
Money is in Indian rupees: write ₹ directly before the number. Never do arithmetic yourself: every figure you state must be copied from a tool result.`;

  // Phase 1 — investigate with tools. A failure here is not fatal: the core tools are run below regardless.
  let notes = "";
  try {
    const res = await withModelFallback((model) =>
      generateText({
        model,
        instructions: `${role}
Investigate before writing. Start with get_overview and get_campaign_breakdown, plus whichever other tools help explain what happened (trend, anomalies, goals, creatives, open recommendations). Request every tool you need in the same step rather than one at a time.
When you have enough evidence, reply with short analyst notes (under 150 words): what happened, the most likely reasons, and what you would recommend.`,
        prompt: ds.focus ? `Prepare the report. The account team asked you to focus on: ${ds.focus}` : "Prepare the report.",
        tools,
        stopWhen: isStepCount(6),
        maxRetries: 1,
      }),
    );
    notes = res.text;
  } catch (e) {
    steps.push({ tool: "note", detail: `Investigation step failed (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}); continued with the core figures` });
  }
  overview();
  breakdown();
  goals();

  // Phase 2 — write the report from the evidence gathered.
  try {
    const { output, model } = await withModelFallback(async (model, label) => {
      const res = await generateText({
        model,
        instructions: `${role}
Write the report from the evidence below and nothing else.
- "data" items restate figures found in the evidence; set source to the tool name they came from. "assumption" items are your inference about causes; "recommendation" items are actions. Use null as the source for assumptions and recommendations.
- Changes are period-over-period (this ${facts.window.days}-day period vs the previous one), never year-over-year.${facts.previous ? "" : "\n- There is no previous-period data: say so once and do not invent comparisons."}
- Write for the client: plain language, specific numbers, no jargon without the number behind it.
- Never say an action was taken; recommendations are proposals for the account team to approve.`,
        prompt: `Evidence (JSON, keyed by tool):\n${JSON.stringify(evidence)}\n\nAnalyst notes:\n${notes || "(none)"}${ds.focus ? `\n\nRequested focus: ${ds.focus}` : ""}`,
        output: Output.object({ schema: reportSchema }),
      });
      return { output: res.output, model: label };
    });
    // Weaker models sometimes leave a section blank or garble a source: keep only sources that name
    // a tool that actually ran, and backfill any empty section from the deterministic report.
    const strip = (xs: z.infer<typeof item>[]) => xs.filter((i) => i.text.trim().length >= 20).map(({ source, ...i }) => (source && source in evidence ? { ...i, source } : i));
    const base = localReport(facts);
    const filled: string[] = [];
    const text = (key: "headline" | "summary" | "emailSubject" | "emailBody", min: number) => (output[key].trim().length >= min ? output[key].trim() : (filled.push(key), base[key]));
    const list = <T,>(key: string, xs: T[], fallback: T[]) => (xs.length ? xs : (filled.push(key), fallback));
    const report: AgentReportContent = {
      headline: text("headline", 8),
      summary: text("summary", 60),
      insights: list("insights", strip(output.insights), base.insights),
      changes: list("changes", strip(output.changes), base.changes),
      recommendations: list("recommendations", output.recommendations.filter((r) => r.text.trim()), base.recommendations),
      plan: list("plan", output.plan.filter((p) => p.trim()), base.plan),
      emailSubject: text("emailSubject", 8),
      emailBody: text("emailBody", 40),
      facts,
      steps,
      mode: "ai",
      model,
    };
    steps.push({ tool: "write_report", detail: "Wrote the summary, insights, recommendations and cover email from the evidence" });
    if (filled.length) steps.push({ tool: "note", detail: `The model left ${filled.join(", ")} blank; filled from the calculated figures` });
    return Response.json({ report });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
