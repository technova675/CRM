import { generateText } from "ai";
import { AI_MODEL, aiConfigured, SAFETY_RULES } from "@/lib/ai/provider";

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const { question, snapshot, history } = (await req.json()) as {
    question: string;
    snapshot: unknown;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!question || typeof question !== "string") return Response.json({ error: "question required" }, { status: 400 });

  try {
    const { text } = await generateText({
      model: AI_MODEL,
      instructions: `${SAFETY_RULES}
You answer questions for the agency team using ONLY the CRM snapshot below (JSON). If the data doesn't contain the answer, say so.
When listing leads or clients, use short bullet points with the company name first. Use ₹ for money.
CRM snapshot:
${JSON.stringify(snapshot).slice(0, 60_000)}`,
      messages: [...(history ?? []).slice(-8), { role: "user", content: question }],
    });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
