/**
 * Opt-in to Groq's *account-level* Free Plan without creating a new LLM engine.
 * Groq says Free Plan requests are rate limited instead of billed. The caller
 * must verify their account remains on that plan before confirming it here.
 * This is not a billing-account lookup and makes no guarantee on other plans.
 */
import { createMulmoScriptFromText } from "../../tools/create_mulmo_script_from_url.js";
import type { ScriptingParams } from "../../types/index.js";

export const GROQ_FREE_PLANNING_MODEL = "openai/gpt-oss-20b";
export const GROQ_FREE_PLAN_CONFIRMATION = "SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED";

export const assertGroqFreePlanConfigured = (env: Record<string, string | undefined>): void => {
  if (env[GROQ_FREE_PLAN_CONFIRMATION] !== "1") {
    throw new Error(`${GROQ_FREE_PLAN_CONFIRMATION}=1 is required after confirming the Groq organization is on the Free Plan`);
  }
  if (!(env.LLM_GROQ_API_KEY || env.GROQ_API_KEY)?.trim()) {
    throw new Error("A Groq API key is required (LLM_GROQ_API_KEY or GROQ_API_KEY)");
  }
};

/**
 * Reuse the exact GraphAI path from MulmoCast, pinning a known Groq Free Plan
 * model; no OpenAI/Gemini fallback or configurable provider/model.
 */
export const createMulmoScriptWithGroqFreePlan = async (text: string, params: Omit<ScriptingParams, "llm" | "llm_model">): Promise<string> => {
  assertGroqFreePlanConfigured(process.env);
  return createMulmoScriptFromText(text, {
    ...params,
    llm: "groq",
    llm_model: GROQ_FREE_PLANNING_MODEL,
  });
};
