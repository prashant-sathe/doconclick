"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_SECONDS, speechChunks } from "@/lib/assistantVoice";

// The Health Assistant's voice (src/lib/assistantVoice.ts): records a spoken
// question with MediaRecorder, has the server turn it into text, and reads
// replies aloud. Two ways to record:
// - tap-to-dictate: the patient taps Stop; the mic is opened per question;
// - hands-free (voice mode): the mic stays open for the whole session and a
//   Web Audio level meter notices speech, ends the question after a pause,
//   and — while a reply is playing — notices the patient talking over it
//   (barge-in), the way ChatGPT's voice mode does.
// Replies are spoken sentence by sentence, the next one fetched while the
// current one plays, so the first words start sooner. One <audio> element is
// reused and "unlocked" on the patient's tap — iOS only lets audio play later,
// after a network round trip, if that element was first played in a gesture.

export type VoiceError = "blocked" | "unsupported" | "tooShort" | "playFailed" | { message: string };
type Phase = "idle" | "recording" | "transcribing";

const MIN_SECONDS = 0.6;
const TICK_MS = 100;
// Speech = a level clearly above the room's noise floor for a moment; the
// question ends after this much quiet (or never started).
const SPEECH_HOLD_MS = 200;
const END_SILENCE_MS = 1000;
const NO_SPEECH_MS = 20000;
// Barge-in needs a louder, longer sound — the reply itself leaks into the mic
// (echo cancellation removes most of it).
const BARGE_HOLD_MS = 300;
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

type Handlers = {
  onTranscript: (text: string) => void;
  onError: (e: VoiceError) => void;
  /** Hands-free: nobody spoke for NO_SPEECH_MS, so listening stopped. */
  onIdle?: () => void;
  /** Hands-free: the patient started talking over a reply. */
  onBargeIn?: () => void;
};

type Session = { stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer>; timer: ReturnType<typeof setInterval> };

export function useAssistantVoice(callbacks: Handlers) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0); // 0–1, hands-free mic level for the orb
  const [heard, setHeard] = useState(false); // hands-free: speech noticed this turn
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const dictation = useRef<MediaStream | null>(null); // tap-to-dictate's own mic
  const session = useRef<Session | null>(null); // hands-free mic, open all session
  const vad = useRef({ mode: "off" as "off" | "listen" | "barge", speech: false, loudSince: 0, lastLoud: 0, noise: 0.01 });
  // The current recording's own state, so a discarded one can't be uploaded
  // by a late onstop after the next has begun.
  const take = useRef<{ cancelled: boolean } | null>(null);
  const startedAt = useRef(0);
  const unmounted = useRef(false);
  const starting = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const speakSeq = useRef(0);
  const speakDone = useRef<(() => void) | null>(null);
  const playWait = useRef<(() => void) | null>(null);
  // Latest callbacks without re-creating the recorder handlers.
  const handlers = useRef(callbacks);
  useEffect(() => { handlers.current = callbacks; });

  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  const stopSpeaking = useCallback(() => {
    speakSeq.current++;
    audio.current?.pause();
    if (vad.current.mode === "barge") vad.current.mode = "off";
    setSpeakingKey(null);
    setLoadingKey(null);
    playWait.current?.();
    playWait.current = null;
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

  // The hands-free meter, every TICK_MS for the whole session.
  const tick = () => {
    const s = session.current;
    if (!s) return;
    s.analyser.getFloatTimeDomainData(s.samples);
    let sum = 0;
    for (const v of s.samples) sum += v * v;
    const rms = Math.sqrt(sum / s.samples.length);
    const v = vad.current;
    const now = Date.now();
    if (v.mode === "barge") {
      const threshold = Math.max(0.04, v.noise * 6);
      if (rms > threshold) {
        // Record from the first loud moment, so the start of what they say
        // isn't lost while it's confirmed as speech.
        if (!v.loudSince) { v.loudSince = now; if (!recorder.current) record(s.stream, true); }
        if (now - v.loudSince >= BARGE_HOLD_MS) {
          Object.assign(v, { mode: "listen", speech: true, lastLoud: now, loudSince: 0 });
          setHeard(true);
          setPhase("recording");
          handlers.current.onBargeIn?.();
        }
      } else if (v.loudSince) {
        v.loudSince = 0; // a cough or a clatter — not speech
        if (recorder.current && take.current) { take.current.cancelled = true; recorder.current.stop(); }
      }
      return;
    }
    // The noise floor drifts down quickly and up slowly, so speech doesn't
    // raise it (not updated during a reply, which would).
    v.noise = rms < v.noise ? v.noise * 0.7 + rms * 0.3 : v.noise * 0.995 + rms * 0.005;
    if (v.mode !== "listen") { setLevel(0); return; }
    const threshold = Math.max(0.012, v.noise * 3);
    setLevel(Math.min(1, rms / Math.max(threshold * 4, 0.05)));
    if (rms > threshold) {
      if (!v.loudSince) v.loudSince = now;
      if (now - v.loudSince >= SPEECH_HOLD_MS && !v.speech) { v.speech = true; setHeard(true); }
      v.lastLoud = now;
    } else v.loudSince = 0;
    const rec = recorder.current;
    if (rec?.state !== "recording") return;
    if (v.speech && now - v.lastLoud > END_SILENCE_MS) rec.stop();
    else if (!v.speech && now - startedAt.current > NO_SPEECH_MS) rec.stop();
  };

  const getMic = async (): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch {
      return null;
    }
  };

  const openSession = async (): Promise<Session | null> => {
    if (session.current) return session.current;
    const ctx = audioCtx.current;
    const stream = await getMic();
    if (!stream || !ctx) { stream?.getTracks().forEach((t) => t.stop()); return null; }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    session.current = { stream, source, analyser, samples: new Float32Array(analyser.fftSize), timer: setInterval(tick, TICK_MS) };
    return session.current;
  };

  /** Hands-free: releases the microphone (mute / end of voice mode). */
  const closeMic = () => {
    const s = session.current;
    if (!s) return;
    clearInterval(s.timer);
    s.source.disconnect();
    s.stream.getTracks().forEach((t) => t.stop());
    session.current = null;
    vad.current.mode = "off";
    setLevel(0);
  };

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

  // Starts a recording on `media`; on stop it's uploaded, discarded, or
  // reported as too short / silent.
  function record(media: MediaStream, handsFree: boolean) {
    const type = recorderType();
    const rec = new MediaRecorder(media, type ? { mimeType: type } : undefined);
    const mine = { cancelled: false };
    const parts: Blob[] = [];
    recorder.current = rec;
    take.current = mine;
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      const duration = (Date.now() - startedAt.current) / 1000;
      const spoke = vad.current.speech;
      if (recorder.current === rec) {
        recorder.current = null;
        stopTicker();
        if (vad.current.mode === "listen") vad.current.mode = "off";
        setLevel(0);
      }
      if (!handsFree) { dictation.current?.getTracks().forEach((t) => t.stop()); dictation.current = null; }
      if (mine.cancelled || unmounted.current) { setPhase((p) => (p === "recording" ? "idle" : p)); return; }
      if (handsFree && !spoke) { setPhase("idle"); handlers.current.onIdle?.(); return; }
      if (duration < MIN_SECONDS || !parts.length) {
        setPhase("idle");
        handlers.current.onError("tooShort");
        return;
      }
      void upload(new Blob(parts, { type: rec.mimeType || type || "audio/webm" }));
    };
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(250);
    stopTicker();
    ticker.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setSeconds(Math.floor(elapsed / 1000));
      if (elapsed >= VOICE_MAX_SECONDS * 1000 && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
  }

  const start = async ({ handsFree = false }: { handsFree?: boolean } = {}) => {
    if (recorder.current || starting.current) return;
    starting.current = true;
    try {
      stopSpeaking();
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        handlers.current.onError("unsupported");
        return;
      }
      let media: MediaStream | null;
      if (handsFree) media = (await openSession())?.stream ?? null;
      else media = dictation.current = await getMic();
      if (!media) { handlers.current.onError("blocked"); return; }

      Object.assign(vad.current, { mode: handsFree ? "listen" : "off", speech: false, loudSince: 0, lastLoud: 0 });
      setHeard(false);
      record(media, handsFree);
      setPhase("recording");
    } finally {
      starting.current = false;
    }
  };

  const stop = () => { if (recorder.current?.state === "recording") recorder.current.stop(); };
  const cancel = () => {
    if (take.current) take.current.cancelled = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else {
      stopTicker();
      dictation.current?.getTracks().forEach((t) => t.stop());
      dictation.current = null;
      setPhase("idle");
    }
  };

  /**
   * Reads `text` aloud; `key` identifies the bubble (for its play/stop
   * button). With `bargeIn` (hands-free), talking over it calls onBargeIn.
   * Resolves once playback ends, is stopped, or fails.
   */
  const speak = useCallback((text: string, key: string, { bargeIn = false }: { bargeIn?: boolean } = {}): Promise<void> => {
    stopSpeaking();
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const seq = ++speakSeq.current;
    const parts = speechChunks(text);
    setLoadingKey(key);
    const fetchPart = (part: string) => {
      const p = fetch("/api/patient/assistant/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: part }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "");
        return res.blob();
      });
      p.catch(() => {}); // a part fetched ahead may never be awaited
      return p;
    };
    return new Promise<void>((resolve) => {
      speakDone.current = resolve;
      const finish = () => {
        if (seq !== speakSeq.current) return;
        if (vad.current.mode === "barge") vad.current.mode = "off";
        setSpeakingKey(null);
        setLoadingKey(null);
        speakDone.current = null;
        resolve();
      };
      (async () => {
        try {
          // The next part is fetched while the current one plays.
          const pending: (Promise<Blob> | undefined)[] = parts.map((p, i) => (i < 2 ? fetchPart(p) : undefined));
          for (let i = 0; i < parts.length; i++) {
            const blob = await (pending[i] ?? fetchPart(parts[i]));
            if (i + 2 < parts.length) pending[i + 2] ??= fetchPart(parts[i + 2]);
            if (seq !== speakSeq.current) return;
            if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
            audioUrl.current = URL.createObjectURL(blob);
            el.src = audioUrl.current;
            const ended = new Promise<void>((r) => { playWait.current = r; el.onended = () => r(); });
            await el.play();
            if (i === 0) {
              setLoadingKey(null);
              setSpeakingKey(key);
              if (bargeIn && session.current) Object.assign(vad.current, { mode: "barge", loudSince: 0 });
            }
            await ended;
            if (seq !== speakSeq.current) return;
          }
          finish();
        } catch (err) {
          if (seq === speakSeq.current) {
            handlers.current.onError(err instanceof Error && err.message ? { message: err.message } : "playFailed");
            finish();
          }
        }
      })();
    });
  }, [stopSpeaking]);

  useEffect(() => () => {
    unmounted.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTicker();
    dictation.current?.getTracks().forEach((t) => t.stop());
    const s = session.current;
    if (s) { clearInterval(s.timer); s.source.disconnect(); s.stream.getTracks().forEach((t) => t.stop()); }
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    void audioCtx.current?.close().catch(() => {});
  }, []);

  return { phase, seconds, level, heard, start, stop, cancel, closeMic, speak, stopSpeaking, speakingKey, loadingKey, unlockAudio };
}
