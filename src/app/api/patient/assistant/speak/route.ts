import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOpenAIClient, VOICE_TTS_MODEL, VOICE_TTS_VOICE } from "@/lib/openai";
import { createRateLimiter } from "@/lib/rateLimit";
import { readJson } from "@/lib/routeGuards";
import { withErrorLocale, requestLanguage } from "@/lib/apiErrors";
import { APP_LANGUAGE_LABELS_EN } from "@/lib/appLanguage";
import { speakableText } from "@/lib/assistantVoice";

// Per patient — a reply is read once automatically and can be replayed.
const checkLimit = createRateLimiter(120, 60 * 60 * 1000);

// POST { text } — a Health Assistant reply read aloud (MP3), for the chat
// page's voice mode. Only the text of a reply is sent; nothing is stored.
export const POST = withErrorLocale(async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!checkLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
  }
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const text = typeof body.text === "string" ? speakableText(body.text) : "";
  if (!text) return NextResponse.json({ error: "Nothing to read out." }, { status: 400 });

  let client;
  try {
    client = getOpenAIClient();
  } catch {
    return NextResponse.json({ error: "Health Assistant is not configured." }, { status: 503 });
  }

  const language = APP_LANGUAGE_LABELS_EN[await requestLanguage()];
  try {
    const speech = await client.audio.speech.create({
      model: VOICE_TTS_MODEL,
      voice: VOICE_TTS_VOICE,
      input: text,
      response_format: "mp3",
      instructions: `You are a caring health assistant in India speaking to a patient. Speak warmly, calmly and clearly at a moderate pace, with natural ${language} pronunciation (Indian accent for any English words). Say helpline numbers such as 112 and 14416 digit by digit.`,
    });
    return new NextResponse(speech.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Health Assistant speech error:", err);
    return NextResponse.json({ error: "The reply couldn't be read out. You can still read it on screen." }, { status: 502 });
  }
});
