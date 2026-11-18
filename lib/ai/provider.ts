import "server-only";
import {reserveTenantUsage} from "../tenantServer";
import type { LanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { researchModelConfig, researchOpenRouterSettings } from "./researchConfig";

// Central place to configure the model. AI_PROVIDER picks the backend; when unset, the first
// provider with a key wins (Groq → OpenRouter → Vercel AI Gateway). Each provider has its own
// model env var, so switching is a one-line change.
const PROVIDERS = ["groq", "openrouter", "gateway"] as const;
type Provider = (typeof PROVIDERS)[number];

const hasKey: Record<Provider, boolean> = {
  groq: Boolean(process.env.GROQ_API_KEY),
  openrouter: Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY1),
  gateway: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
};

const MODEL_IDS: Record<Provider, string> = {
  groq: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  openrouter: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
  gateway: process.env.AI_MODEL || "anthropic/claude-sonnet-5",
};

const requested = process.env.AI_PROVIDER?.toLowerCase() as Provider | undefined;
export const AI_PROVIDER: Provider = requested && PROVIDERS.includes(requested) ? requested : (PROVIDERS.find((p) => hasKey[p]) ?? "gateway");

export const AI_MODEL_ID = MODEL_IDS[AI_PROVIDER];

// Gateway takes a plain "provider/model" string; Groq and OpenRouter need a provider instance.
const openRouter = () => createOpenRouter({apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY1});
const modelFor = (p: Provider): LanguageModel => (p === "groq" ? createGroq()(MODEL_IDS.groq) : p === "openrouter" ? openRouter()(MODEL_IDS.openrouter) : MODEL_IDS.gateway);
export const AI_MODEL: LanguageModel = modelFor(AI_PROVIDER);

// Free tiers hit rate limits often: when the primary provider fails, retry once on the next
// provider that has a key. The label tells the caller which model actually answered.
const FALLBACK = PROVIDERS.find((p) => p !== AI_PROVIDER && hasKey[p]);
export async function withModelFallback<T>(owner:string,run: (model: LanguageModel, label: string) => Promise<T>): Promise<T> {
  await reserveTenantUsage(owner,"aiCredits",1);
  try {
    return await run(AI_MODEL, `${AI_PROVIDER} · ${AI_MODEL_ID}`);
  } catch (e) {
    if (!FALLBACK) throw e;
    return run(modelFor(FALLBACK), `${FALLBACK} · ${MODEL_IDS[FALLBACK]}`);
  }
}

export const aiConfigured = () => hasKey[AI_PROVIDER];

const researchConfig = () => researchModelConfig(process.env, {provider: AI_PROVIDER, model: AI_MODEL_ID});
export const researchAIConfigured = () => researchConfig().configured;
export async function withResearchModel<T>(owner: string, run: (model: LanguageModel, label: string) => Promise<T>, credits: 1 | 2 = 1): Promise<T> {
  const config = researchConfig();
  if (!config.configured) throw new Error("The configured research provider has no API key.");
  await reserveTenantUsage(owner, "aiCredits", credits);
  const model: LanguageModel = config.provider === "groq" ? createGroq()(config.model)
    : config.provider === "openrouter" ? openRouter()(config.model, researchOpenRouterSettings(config.freeOnly))
    : config.model;
  return run(model, `${config.provider} · ${config.model}`);
}

export const SAFETY_RULES = `You are an assistant inside Adbibe's CRM (an AI-powered digital marketing agency).
Rules:
- Never invent facts about people or companies. Only state as "verified" what appears in the provided data or fetched page content.
- Clearly separate verified facts, assumptions, and recommendations.
- Never send messages or take actions yourself; you only draft and analyze. Humans approve high-impact actions.
- Be concise and specific.`;
