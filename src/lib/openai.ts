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

// Health Assistant voice (src/app/api/patient/assistant/transcribe + speak).
// gpt-transcribe takes a list of likely languages, which suits Indian speech
// that mixes the app language with English words.
export const VOICE_TRANSCRIBE_MODEL = "gpt-transcribe";
export const VOICE_TTS_MODEL = "gpt-4o-mini-tts";
export const VOICE_TTS_VOICE = "marin";
