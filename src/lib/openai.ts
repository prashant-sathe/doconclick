import OpenAI from "openai";

// Balanced cost/capability tier. Swap to "gpt-5.6-sol" (frontier, priciest)
// or "gpt-5.6-luna" (cheapest) here if usage data says otherwise.
export const ASSISTANT_MODEL = "gpt-5.6-terra";

export function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI is not configured (OPENAI_API_KEY missing)");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
