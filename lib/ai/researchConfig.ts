export const RESEARCH_PROVIDERS = ["groq", "openrouter", "gateway"] as const;
export type ResearchProvider = (typeof RESEARCH_PROVIDERS)[number];

export function researchOpenRouterSettings(freeOnly: boolean) {
  return {provider: {require_parameters: true, ...(freeOnly ? {max_price: {prompt: 0, completion: 0, request: 0}} : {})}, reasoning: {max_tokens: 1024, exclude: true}};
}

// Keep research model selection separate from the other AI workspaces.
// A research request must never silently switch to a different model.
export function researchModelConfig(env: Record<string, string | undefined>, inherited: {provider: ResearchProvider; model: string}) {
  const requested = env.AI_RESEARCH_PROVIDER?.trim().toLowerCase();
  if (requested && !RESEARCH_PROVIDERS.includes(requested as ResearchProvider)) {
    throw new Error("AI_RESEARCH_PROVIDER must be groq, openrouter or gateway.");
  }
  const provider = requested as ResearchProvider || inherited.provider;
  const defaults: Record<ResearchProvider, string> = {
    groq: env.GROQ_MODEL || "openai/gpt-oss-120b",
    openrouter: env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free",
    gateway: env.AI_MODEL || "anthropic/claude-sonnet-5",
  };
  const configured: Record<ResearchProvider, boolean> = {
    groq: Boolean(env.GROQ_API_KEY),
    openrouter: Boolean(env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY1),
    gateway: Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN),
  };
  const model = env.AI_RESEARCH_MODEL?.trim() || (provider === inherited.provider ? inherited.model : defaults[provider]);
  const freeOnly = env.AI_RESEARCH_FREE_ONLY === "true";
  if (freeOnly && (provider !== "openrouter" || !model.endsWith(":free"))) {
    throw new Error("Free-only research requires an OpenRouter :free model.");
  }
  return {provider, model, configured: configured[provider], freeOnly};
}
