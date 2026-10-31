import { NextResponse } from "next/server";
import { toFile } from "openai";
import { getAuthUser } from "@/lib/auth";
import { getOpenAIClient, VOICE_TRANSCRIBE_MODEL } from "@/lib/openai";
import { createRateLimiter } from "@/lib/rateLimit";
import { withErrorLocale, requestLanguage } from "@/lib/apiErrors";
import { VOICE_AUDIO_TYPES, VOICE_MAX_BYTES, baseAudioType } from "@/lib/assistantVoice";
import { APP_LANGUAGES } from "@/lib/appLanguage";

// Per patient — each spoken question is one of these, then one assistant turn
// (which has its own 30/hour limit), so this only needs to stop scripted use.
const checkLimit = createRateLimiter(60, 60 * 60 * 1000);

// POST multipart { audio } — the Health Assistant's voice input: a recorded
// question (src/lib/assistantVoice.ts) back as text, which the page then
// sends as an ordinary message. The audio goes to OpenAI and is not stored.
// Hinted with every app language, the patient's own first — people often
// speak a language other than the one the app is set to, and mix in English.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No recording was received. Please try again." }, { status: 400 });
  }
  const ext = VOICE_AUDIO_TYPES[baseAudioType(audio.type)];
  if (!ext) {
    return NextResponse.json({ error: "This recording format isn't supported." }, { status: 415 });
  }
  if (audio.size > VOICE_MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Please keep it under a minute." }, { status: 413 });
  }

  let client;
  try {
    client = getOpenAIClient();
  } catch {
    return NextResponse.json({ error: "Health Assistant is not configured." }, { status: 503 });
  }

  const own = await requestLanguage();
  const languages = [own, ...APP_LANGUAGES.filter((l) => l !== own)].map((l) => l.split("-")[0]);
  try {
    const result = await client.audio.transcriptions.create({
      model: VOICE_TRANSCRIBE_MODEL,
      file: await toFile(audio, `question.${ext}`, { type: baseAudioType(audio.type) }),
      languages,
      keywords: ["DocOnClick"],
    });
    const text = result.text.trim();
    if (!text) {
      return NextResponse.json({ error: "We couldn't hear anything. Please try again, closer to the phone." }, { status: 422 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.error("Health Assistant transcription error:", err);
    return NextResponse.json({ error: "We couldn't understand that recording. Please try again or type your question." }, { status: 502 });
  }
});
