import { AI_MODEL_ID, AI_PROVIDER, aiConfigured } from "@/lib/ai/provider";

export async function GET() {
  return Response.json({ enabled: aiConfigured(), provider: aiConfigured() ? AI_PROVIDER : null, model: aiConfigured() ? AI_MODEL_ID : null });
}
