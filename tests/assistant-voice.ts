// Health Assistant voice mode (src/lib/assistantVoice.ts): the transcribe and
// speak routes (patients only; empty / unsupported / oversized recordings
// refused, errors in the cookie language) and real OpenAI round trips —
// a Marathi and a Kannada sentence spoken by TTS come back as text in that
// script. Then the page the way a patient uses it: Chromium's fake microphone
// plays a spoken WAV, the patient taps the mic, stops, the question appears
// as their message, the assistant replies and the reply is read aloud; and
// hands-free voice mode — it notices speech, stops at the pause, speaks the
// reply, listens again, and can be interrupted, muted and ended.
// Starts its own dev server (BASE_URL to use a running one) against the DB
// and OPENAI_API_KEY in .env; one throwaway patient. Costs a few cents.
//
//   npm run test:assistant-voice
import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import jwt from "jsonwebtoken";
import type { ChildProcess } from "child_process";
import { chromium } from "playwright";
import { prisma } from "../src/lib/prisma";
import { getOpenAIClient, VOICE_TTS_MODEL, VOICE_TTS_VOICE } from "../src/lib/openai";
import { speakableText, speechChunks, VOICE_MAX_BYTES } from "../src/lib/assistantVoice";
import { startDevServer } from "./devServer";

let BASE = process.env.BASE_URL ?? "";
const SECRET: string = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set (expected in .env)"); })();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!ok) failures++;
}

type U = { id: string; name: string; role: string; mobile: string };
const cookieFor = (u: U, lang = "en-IN") => `doconclick_token=${jwt.sign({ id: u.id, name: u.name, role: u.role, mobile: u.mobile, tv: 0 }, SECRET)}; doconclick_lang=${lang}`;
const transcribe = (cookie: string, blob: Blob | null) => {
  const form = new FormData();
  if (blob) form.append("audio", blob, "question");
  return fetch(`${BASE}/api/patient/assistant/transcribe`, { method: "POST", headers: cookie ? { Cookie: cookie } : {}, body: form });
};
const speak = (cookie: string, text: unknown) =>
  fetch(`${BASE}/api/patient/assistant/speak`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ text }) });

async function main() {
  check("speakableText drops the chat markdown", speakableText("**Fever** for *2 days* — see a `GP`\n- call 112") === "Fever for 2 days — see a GP\ncall 112", JSON.stringify(speakableText("**Fever** for *2 days* — see a `GP`\n- call 112")));

  const parts = speechChunks("ठीक आहे. तापासाठी जनरल फिजिशियन योग्य राहतील. मी तीन डॉक्टर शोधले आहेत, ते स्क्रीनवर आहेत. श्वास घ्यायला त्रास झाला तर 112 वर कॉल करा.");
  check("speechChunks: a short first part (a tiny opener joined), then the rest", parts.length === 2 && parts[0].startsWith("ठीक आहे. तापासाठी") && parts[0].length < 60, JSON.stringify(parts));

  let child: ChildProcess | null = null;
  if (!BASE) {
    const started = await startDevServer({ label: "dev", env: { FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    child = started.child;
    BASE = started.base;
  }

  const stamp = String(Date.now()).slice(-8);
  const patient = (await prisma.user.create({ data: { name: "Voice Patient", mobile: `6${stamp}1`, role: "PATIENT", termsAcceptedAt: new Date(), patientProfile: { create: { age: 40, gender: "Female" } } } })) as unknown as U;
  const doctor = (await prisma.user.create({ data: { name: "Voice Doctor", mobile: `6${stamp}2`, role: "DOCTOR", termsAcceptedAt: new Date(), doctorProfile: { create: { status: "APPROVED" } } } })) as unknown as U;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assistant-voice-"));

  try {
    // ── Guards ──
    const mp3Header = new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], { type: "audio/mpeg" });
    let r = await transcribe("", mp3Header);
    const asDoctor = await transcribe(cookieFor(doctor), mp3Header);
    check("transcribe: signed out / a doctor → 401", r.status === 401 && asDoctor.status === 401, `${r.status} ${asDoctor.status}`);
    r = await transcribe(cookieFor(patient), null);
    check("transcribe: no audio → 400", r.status === 400, `${r.status}`);
    r = await transcribe(cookieFor(patient), new Blob(["hello"], { type: "text/plain" }));
    check("transcribe: not audio → 415", r.status === 415, `${r.status}`);
    r = await transcribe(cookieFor(patient), new Blob([new Uint8Array(VOICE_MAX_BYTES + 1)], { type: "audio/webm" }));
    check("transcribe: over the size limit → 413", r.status === 413, `${r.status}`);
    r = await transcribe(cookieFor(patient, "mr-IN"), null);
    const mrError = String((await r.json()).error ?? "");
    check("transcribe: errors come back in the cookie language (mr-IN)", /[ऀ-ॿ]/.test(mrError), mrError);
    r = await speak(cookieFor(patient), "   ");
    const speakDoctor = await speak(cookieFor(doctor), "hello");
    check("speak: empty text → 400; a doctor → 401", r.status === 400 && speakDoctor.status === 401, `${r.status} ${speakDoctor.status}`);

    // ── Real round trips: speak a sentence, transcribe it back ──
    for (const [lang, sentence, script, word] of [
      ["mr-IN", "मला दोन दिवसांपासून ताप आहे आणि डोकं दुखतंय.", /[ऀ-ॿ]/, "ताप"],
      ["kn-IN", "ನನಗೆ ಎರಡು ದಿನಗಳಿಂದ ಜ್ವರ ಇದೆ ಮತ್ತು ತಲೆನೋವು ಇದೆ.", /[ಀ-೿]/, "ಜ್ವರ"],
    ] as const) {
      const t0 = Date.now();
      r = await speak(cookieFor(patient, lang), sentence);
      const audio = Buffer.from(await r.arrayBuffer());
      const isMp3 = audio.subarray(0, 3).toString() === "ID3" || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
      check(`speak (${lang}): MP3 back`, r.status === 200 && r.headers.get("content-type") === "audio/mpeg" && audio.length > 5000 && isMp3, `${r.status} ${r.headers.get("content-type")} ${audio.length} bytes, ${Date.now() - t0} ms`);
      const t1 = Date.now();
      r = await transcribe(cookieFor(patient, lang), new Blob([audio], { type: "audio/mpeg" }));
      const text = String((await r.json()).text ?? "");
      check(`transcribe (${lang}): the sentence comes back in its script`, r.status === 200 && script.test(text) && text.includes(word), `${r.status} "${text}" ${Date.now() - t1} ms`);
    }

    // ── Language: app in English, patient speaking Marathi ──
    {
      const res = await fetch(`${BASE}/api/patient/assistant`, {
        method: "POST",
        headers: { Cookie: cookieFor(patient, "en-IN"), "Content-Type": "application/json" },
        body: JSON.stringify({ voice: true, messages: [{ role: "user", content: "माझं BP थोडं high आहे, कोणत्या doctor ला दाखवू?" }] }),
      });
      const data = await res.json();
      const reply = (data.items ?? []).filter((i: { type?: string; role?: string }) => i.type === "message" && i.role === "assistant")
        .map((i: { content: { text?: string }[] }) => i.content.map((c) => c.text ?? "").join("")).join(" ");
      const devanagari = (reply.match(/[ऀ-ॿ]/g) ?? []).length, latin = (reply.match(/[A-Za-z]/g) ?? []).length;
      check("app in English + a Marathi question (mixed with English words) → the reply stays Marathi", res.status === 200 && devanagari > latin, `${devanagari} Devanagari / ${latin} Latin: ${reply.slice(0, 80)}`);
    }

    // ── The page, with a fake microphone playing a spoken question ──
    const wav = path.join(tmp, "question.wav");
    const spoken = await getOpenAIClient().audio.speech.create({
      model: VOICE_TTS_MODEL, voice: VOICE_TTS_VOICE, response_format: "wav",
      input: "मला दोन दिवसांपासून ताप आहे. कोणत्या डॉक्टरांना दाखवू?",
    });
    fs.writeFileSync(wav, Buffer.from(await spoken.arrayBuffer()));
    const browser = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`, "--autoplay-policy=no-user-gesture-required"],
    });
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.grantPermissions(["microphone"], { origin: BASE });
      const token = jwt.sign({ id: patient.id, name: patient.name, role: patient.role, mobile: patient.mobile, tv: 0 }, SECRET);
      await ctx.addCookies([{ name: "doconclick_token", value: token, url: BASE }, { name: "doconclick_lang", value: "mr-IN", url: BASE }]);
      const page = await ctx.newPage();
      page.on("response", (res) => { if (res.status() >= 400) console.log(`      (page got ${res.status()} from ${res.url()})`); });
      await page.goto(`${BASE}/patient/assistant`, { waitUntil: "load", timeout: 120000 });
      await page.getByRole("button", { name: "तुमचा प्रश्न बोला" }).click();
      await page.getByText(/ऐकत आहे…/).waitFor({ timeout: 10000 });
      check("tapping the mic starts recording (timer shown)", true, "ऐकत आहे…");
      await page.waitForTimeout(6000);
      await page.getByRole("button", { name: "थांबवा आणि पाठवा" }).click();
      const bubble = page.locator(".bg-primary-500").first();
      await bubble.waitFor({ timeout: 30000 });
      const question = (await bubble.textContent()) ?? "";
      check("the spoken question appears as the patient's message", /ताप/.test(question), question);
      // The reply is read out by itself: its Listen button turns into Stop
      // while the audio loads and plays.
      const speech = await page.waitForResponse((res) => res.url().endsWith("/api/patient/assistant/speak"), { timeout: 120000 });
      await page.waitForTimeout(500);
      const reply = (await page.locator(".rounded-bl-md").last().textContent()) ?? "";
      check("the assistant replies (in Marathi)", /[ऀ-ॿ]/.test(reply), reply.slice(0, 80));
      check("…and the reply is read aloud by itself (speak 200 MP3, its button shows Stop)", speech.status() === 200 && speech.headers()["content-type"] === "audio/mpeg" && (await page.getByRole("button", { name: "थांबवा" }).count()) > 0, `speak ${speech.status()} ${speech.headers()["content-type"]}`);
      await page.getByRole("button", { name: "थांबवा" }).first().click();
      check("Stop ends the playback", (await page.getByRole("button", { name: "ऐका" }).count()) > 0, "ऐका");
      await page.screenshot({ path: path.join(tmp, "assistant-voice.png") });
      console.log(`      screenshot: ${path.join(tmp, "assistant-voice.png")}`);
    } finally {
      await browser.close();
    }

    // ── Hands-free voice mode: no taps between speaking and the reply ──
    // A fresh browser; the mic stays open for the session, so the fake
    // microphone plays this once: the question, a long quiet (the pause that
    // ends the turn, then the reply), and a follow-up said over the reply.
    const followUp = await getOpenAIClient().audio.speech.create({
      model: VOICE_TTS_MODEL, voice: VOICE_TTS_VOICE, response_format: "wav",
      input: "थांबा, मला खोकला सुद्धा आहे. खोकल्यासाठी कोणत्या डॉक्टरांना दाखवू?",
    });
    const pcm = (buf: Buffer) => { const i = buf.indexOf("data"); return buf.subarray(i + 8); };
    const q = pcm(fs.readFileSync(wav)), f = pcm(Buffer.from(await followUp.arrayBuffer()));
    const silence = Buffer.alloc(24000 * 2 * 13); // 13 s at 24 kHz, 16-bit mono
    const body = Buffer.concat([q, silence, f, Buffer.alloc(24000 * 2 * 8)]);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.writeUInt32LE(36 + body.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24);
    header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(body.length, 40);
    const conversation = path.join(tmp, "conversation.wav");
    fs.writeFileSync(conversation, Buffer.concat([header, body]));
    const handsFree = await chromium.launch({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${conversation}%noloop`, "--autoplay-policy=no-user-gesture-required"],
    });
    try {
      const ctx = await handsFree.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.grantPermissions(["microphone"], { origin: BASE });
      const token = jwt.sign({ id: patient.id, name: patient.name, role: patient.role, mobile: patient.mobile, tv: 0 }, SECRET);
      await ctx.addCookies([{ name: "doconclick_token", value: token, url: BASE }, { name: "doconclick_lang", value: "mr-IN", url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/patient/assistant`, { waitUntil: "load", timeout: 120000 });
      await page.evaluate((key) => sessionStorage.removeItem(key), `doconclick:assistant-chat:${patient.id}`);
      await page.reload({ waitUntil: "load" });
      const overlay = page.getByRole("dialog", { name: "व्हॉइस मोड" });
      const status = overlay.locator("p.text-lg");
      await page.getByRole("button", { name: "व्हॉइस मोड" }).click();
      await overlay.waitFor({ timeout: 10000 });
      check("voice mode opens full-screen and listens straight away", /ऐकत आहे|बोला, ऐकत आहे/.test((await status.textContent()) ?? ""), (await status.textContent()) ?? "");
      await overlay.getByText("बोला, ऐकत आहे…").waitFor({ timeout: 15000 });
      check("…notices the patient speaking", true, "बोला, ऐकत आहे…");
      const transcribed = await page.waitForResponse((res) => res.url().endsWith("/api/patient/assistant/transcribe"), { timeout: 60000 });
      check("…and stops by itself when they pause (no tap), then transcribes", transcribed.status() === 200, `${transcribed.status()}`);
      const speech = await page.waitForResponse((res) => res.url().endsWith("/api/patient/assistant/speak"), { timeout: 120000 });
      await overlay.getByText(/बोलत आहे/).waitFor({ timeout: 30000 });
      const question = (await overlay.locator("p.italic").textContent()) ?? "";
      const reply = (await overlay.locator("p.line-clamp-5").textContent()) ?? "";
      check("the overlay shows the question and the reply, and speaks it", speech.status() === 200 && /ताप/.test(question) && /[ऀ-ॿ]/.test(reply), `"${question}" → "${reply.slice(0, 60)}"`);
      check("…a short spoken-style reply (voice mode: no list, no markdown)", reply.length < 400 && !/\*\*|^\s*-\s/m.test(reply), `${reply.length} chars`);
      await page.screenshot({ path: path.join(tmp, "voice-mode-speaking.png") });
      // The follow-up is said while the reply is playing: it stops the reply
      // and becomes the next question, without any tap.
      const t0 = Date.now();
      const second = await page.waitForResponse((res) => res.url().endsWith("/api/patient/assistant/transcribe"), { timeout: 60000 });
      const secondText = String((await second.json()).text ?? "");
      check("talking over the reply (barge-in) stops it and is heard as the next question", second.status() === 200 && /खोकला/.test(secondText), `${Date.now() - t0} ms later: "${secondText}"`);
      await overlay.getByText(/बोलत आहे/).waitFor({ timeout: 90000 });
      const reply2 = (await overlay.locator("p.line-clamp-5").textContent()) ?? "";
      check("…and the second answer is spoken too (a two-turn conversation, no taps)", /[ऀ-ॿ]/.test(reply2), reply2.slice(0, 70));
      await overlay.getByRole("button", { name: "मध्येच थांबवा" }).click();
      await overlay.getByText(/^(ऐकत आहे…|बोला, ऐकत आहे…)$/).waitFor({ timeout: 10000 });
      check("tapping the orb interrupts the reply and it listens again", true, (await status.textContent()) ?? "");
      await page.screenshot({ path: path.join(tmp, "voice-mode-listening.png") });
      await overlay.getByRole("button", { name: "म्यूट करा" }).click();
      check("Mute pauses listening", /थांबवले आहे/.test((await status.textContent()) ?? ""), (await status.textContent()) ?? "");
      await overlay.getByRole("button", { name: "व्हॉइस मोड बंद करा" }).first().click();
      await overlay.waitFor({ state: "detached", timeout: 5000 });
      const bubbles = await page.locator(".bg-primary-500").count();
      check("ending voice mode leaves the conversation in the chat", bubbles >= 2 && (await page.locator(".rounded-bl-md").count()) >= 1, `${bubbles} question(s)`);
      console.log(`      screenshots: ${path.join(tmp, "voice-mode-speaking.png")}, voice-mode-listening.png`);
    } finally {
      await handsFree.close();
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [patient.id, doctor.id] } } });
    child?.kill();
  }

  console.log(`\n${failures ? `✗ ${failures} check(s) failed` : "✓ All checks passed"}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
