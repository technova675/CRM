import { AI_MODEL, aiConfigured } from "@/lib/ai/provider";

export async function GET() {
  return Response.json({ enabled: aiConfigured(), model: aiConfigured() ? AI_MODEL : null });
}
