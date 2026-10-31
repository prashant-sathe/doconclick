"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_SECONDS } from "@/lib/assistantVoice";

// The Health Assistant's voice (src/lib/assistantVoice.ts): records a spoken
// question with MediaRecorder, has the server turn it into text, and reads
// replies aloud. Two ways to record:
// - tap-to-dictate: the patient taps Stop;
// - hands-free (voice mode): a Web Audio level meter notices speech and stops
//   on its own after a pause, the way ChatGPT's voice mode does.
// One <audio> element is reused for every reply and is "unlocked" on the
// patient's tap — iOS only lets audio play later, after a network round trip,
// if that element was first played inside a user gesture.

export type VoiceError = "blocked" | "unsupported" | "tooShort" | "playFailed" | { message: string };
type Phase = "idle" | "recording" | "transcribing";

const MIN_SECONDS = 0.6;
// Hands-free: speech is a level clearly above the room's noise floor for a
// moment; the question ends after this much quiet, or never started.
const SPEECH_HOLD_MS = 200;
const END_SILENCE_MS = 1300;
const NO_SPEECH_MS = 20000;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

type Handlers = {
  onTranscript: (text: string) => void;
  onError: (e: VoiceError) => void;
  /** Hands-free only: nobody spoke for NO_SPEECH_MS, so listening stopped. */
  onIdle?: () => void;
};

export function useAssistantVoice(callbacks: Handlers) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0); // 0–1, hands-free mic level for the orb
  const [heard, setHeard] = useState(false); // hands-free: speech noticed this turn
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const starting = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const meter = useRef<{ source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const speakSeq = useRef(0);
  const speakDone = useRef<(() => void) | null>(null);
  // Latest callbacks without re-creating the recorder handlers.
  const handlers = useRef(callbacks);
  useEffect(() => { handlers.current = callbacks; });

  const releaseMic = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    meter.current?.source.disconnect();
    meter.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLevel(0);
  };

  const stopSpeaking = useCallback(() => {
    speakSeq.current++;
    audio.current?.pause();
    setSpeakingKey(null);
    setLoadingKey(null);
    speakDone.current?.();
    speakDone.current = null;
  }, []);

  /** Call inside the patient's tap: lets replies (and the level meter) start later. */
  const unlockAudio = useCallback(() => {
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    if (!el.src || el.src === SILENT_WAV) {
      el.src = SILENT_WAV;
      el.play().then(() => el.pause()).catch(() => {});
    }
    const Ctx = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (Ctx && !audioCtx.current) audioCtx.current = new Ctx();
    void audioCtx.current?.resume().catch(() => {});
  }, []);

  const upload = async (blob: Blob) => {
    setPhase("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "question");
      const res = await fetch("/api/patient/assistant/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.text !== "string") throw new Error(data.error || "");
      setPhase("idle");
      handlers.current.onTranscript(data.text);
    } catch (err) {
      setPhase("idle");
      handlers.current.onError({ message: err instanceof Error ? err.message : "" });
    }
  };

  const start = async ({ handsFree = false }: { handsFree?: boolean } = {}) => {
    if (recorder.current || starting.current) return;
    starting.current = true;
    try {
      stopSpeaking();
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        handlers.current.onError("unsupported");
        return;
      }
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        handlers.current.onError("blocked");
        return;
      }
      const type = recorderType();
      const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
      stream.current = media;
      recorder.current = rec;
      chunks.current = [];
      cancelled.current = false;

      // Hands-free: watch the level to notice speech and the pause after it.
      let speech = false, loudSince = 0, lastLoud = 0, noise = 0.01;
      const ctx = handsFree ? audioCtx.current : null;
      let samples: Float32Array<ArrayBuffer> | null = null;
      if (ctx) {
        const source = ctx.createMediaStreamSource(media);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        meter.current = { source, analyser };
        samples = new Float32Array(analyser.fftSize);
      }
      setHeard(false);

      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const duration = (Date.now() - startedAt.current) / 1000;
        releaseMic();
        recorder.current = null;
        if (cancelled.current) { setPhase("idle"); return; }
        if (handsFree && !speech) { setPhase("idle"); handlers.current.onIdle?.(); return; }
        if (duration < MIN_SECONDS || !chunks.current.length) {
          setPhase("idle");
          handlers.current.onError("tooShort");
          return;
        }
        void upload(new Blob(chunks.current, { type: rec.mimeType || type || "audio/webm" }));
      };
      startedAt.current = Date.now();
      setSeconds(0);
      rec.start(250);
      setPhase("recording");
      ticker.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startedAt.current;
        setSeconds(Math.floor(elapsed / 1000));
        const active = recorder.current?.state === "recording";
        if (elapsed >= VOICE_MAX_SECONDS * 1000 && active) { recorder.current!.stop(); return; }
        if (!meter.current || !samples || !active) return;
        meter.current.analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const rms = Math.sqrt(sum / samples.length);
        // The noise floor drifts down quickly and up slowly, so speech
        // doesn't raise it.
        noise = rms < noise ? noise * 0.7 + rms * 0.3 : noise * 0.995 + rms * 0.005;
        const threshold = Math.max(0.012, noise * 3);
        setLevel(Math.min(1, rms / Math.max(threshold * 4, 0.05)));
        if (rms > threshold) {
          if (!loudSince) loudSince = now;
          if (now - loudSince >= SPEECH_HOLD_MS && !speech) { speech = true; setHeard(true); }
          lastLoud = now;
        } else {
          loudSince = 0;
        }
        if (speech && now - lastLoud > END_SILENCE_MS) recorder.current!.stop();
        else if (!speech && elapsed > NO_SPEECH_MS) recorder.current!.stop();
      }, 100);
    } finally {
      starting.current = false;
    }
  };

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const cancel = () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else { releaseMic(); setPhase("idle"); }
  };

  /**
   * Reads `text` aloud; `key` identifies the bubble (for its play/stop
   * button). Resolves once playback ends, is stopped, or fails.
   */
  const speak = useCallback((text: string, key: string): Promise<void> => {
    stopSpeaking();
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const seq = ++speakSeq.current;
    setLoadingKey(key);
    return new Promise<void>((resolve) => {
      speakDone.current = resolve;
      const finish = () => { if (seq === speakSeq.current) { setSpeakingKey(null); speakDone.current = null; resolve(); } };
      (async () => {
        try {
          const res = await fetch("/api/patient/assistant/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "");
          const blob = await res.blob();
          if (seq !== speakSeq.current) return; // stopped or replaced meanwhile
          if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
          audioUrl.current = URL.createObjectURL(blob);
          el.src = audioUrl.current;
          el.onended = finish;
          await el.play();
          setSpeakingKey(key);
        } catch (err) {
          if (seq === speakSeq.current) {
            handlers.current.onError(err instanceof Error && err.message ? { message: err.message } : "playFailed");
            finish();
          }
        } finally {
          if (seq === speakSeq.current) setLoadingKey(null);
        }
      })();
    });
  }, [stopSpeaking]);

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    void audioCtx.current?.close().catch(() => {});
  }, []);

  return { phase, seconds, level, heard, start, stop, cancel, speak, stopSpeaking, speakingKey, loadingKey, unlockAudio };
}
