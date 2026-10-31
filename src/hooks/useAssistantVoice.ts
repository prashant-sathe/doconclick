"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_SECONDS } from "@/lib/assistantVoice";

// The Health Assistant's voice mode (src/lib/assistantVoice.ts): records a
// spoken question with MediaRecorder, has the server turn it into text, and
// reads replies aloud. One <audio> element is reused for every reply and is
// "unlocked" on the mic tap — iOS only lets audio play later, after a network
// round trip, if that element was first played inside a user gesture.

export type VoiceError = "blocked" | "unsupported" | "tooShort" | "playFailed" | { message: string };
type Phase = "idle" | "recording" | "transcribing";

const MIN_SECONDS = 0.6;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useAssistantVoice({ onTranscript, onError }: { onTranscript: (text: string) => void; onError: (e: VoiceError) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const speakSeq = useRef(0);
  // Latest callbacks without re-creating the recorder handlers.
  const handlers = useRef({ onTranscript, onError });
  useEffect(() => { handlers.current = { onTranscript, onError }; });

  const releaseMic = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  const stopSpeaking = useCallback(() => {
    speakSeq.current++;
    audio.current?.pause();
    setSpeakingKey(null);
    setLoadingKey(null);
  }, []);

  const unlockAudio = () => {
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    if (!el.src || el.src === SILENT_WAV) {
      el.src = SILENT_WAV;
      el.play().then(() => el.pause()).catch(() => {});
    }
  };

  const upload = async (blob: Blob) => {
    setPhase("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "question");
      const res = await fetch("/api/patient/assistant/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.text !== "string") throw new Error(data.error || "");
      handlers.current.onTranscript(data.text);
    } catch (err) {
      handlers.current.onError({ message: err instanceof Error ? err.message : "" });
    } finally {
      setPhase("idle");
    }
  };

  const start = async () => {
    if (phase !== "idle") return;
    stopSpeaking();
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      handlers.current.onError("unsupported");
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
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
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const duration = (Date.now() - startedAt.current) / 1000;
      releaseMic();
      recorder.current = null;
      if (cancelled.current) { setPhase("idle"); return; }
      if (duration < MIN_SECONDS || !chunks.current.length) {
        setPhase("idle");
        handlers.current.onError("tooShort");
        return;
      }
      void upload(new Blob(chunks.current, { type: rec.mimeType || type || "audio/webm" }));
    };
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start();
    setPhase("recording");
    ticker.current = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSeconds(Math.floor(s));
      if (s >= VOICE_MAX_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
  };

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const cancel = () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else { releaseMic(); setPhase("idle"); }
  };

  /** Reads `text` aloud; `key` identifies the bubble (for its play/stop button). */
  const speak = useCallback(async (text: string, key: string) => {
    stopSpeaking();
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const seq = ++speakSeq.current;
    setLoadingKey(key);
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
      el.onended = () => { if (seq === speakSeq.current) setSpeakingKey(null); };
      await el.play();
      setSpeakingKey(key);
    } catch (err) {
      if (seq === speakSeq.current) handlers.current.onError(err instanceof Error && err.message ? { message: err.message } : "playFailed");
    } finally {
      if (seq === speakSeq.current) setLoadingKey(null);
    }
  }, [stopSpeaking]);

  useEffect(() => () => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
  }, []);

  return { phase, seconds, start, stop, cancel, speak, stopSpeaking, speakingKey, loadingKey, unlockAudio };
}
