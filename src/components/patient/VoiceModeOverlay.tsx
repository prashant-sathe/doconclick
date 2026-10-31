"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Mic, MicOff, X, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderChatText } from "@/lib/chatMarkdown";

export type VoiceModeState = "listening" | "thinking" | "speaking" | "paused";

// The Health Assistant's hands-free voice mode (ChatGPT-style): a full-screen
// orb that grows with the patient's voice while listening, breathes while it
// thinks and pulses while it speaks. Tapping the orb sends now (listening),
// interrupts (speaking) or resumes (paused). The conversation itself carries
// on in the chat behind it, doctor/nurse cards included.
export default function VoiceModeOverlay({
  state, level, heard, question, reply, hasSuggestions, error, onOrb, onMute, onEnd,
}: {
  state: VoiceModeState;
  level: number;
  heard: boolean;
  question: string;
  reply: string;
  hasSuggestions: boolean;
  error: string | null;
  onOrb: () => void;
  onMute: () => void;
  onEnd: () => void;
}) {
  const t = useTranslations("patientAccount.assistant");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEnd(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnd]);

  const label = {
    listening: heard ? t("voiceModeHearing") : t("voiceModeListening"),
    thinking: t("voiceModeThinking"),
    speaking: t("voiceModeSpeaking"),
    paused: t("voiceModePaused"),
  }[state];
  const orbAction = state === "listening" ? t("voiceStop") : state === "speaking" ? t("voiceModeInterrupt") : state === "paused" ? t("voiceModeResume") : undefined;
  const paused = state === "paused";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("voiceMode")}
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{ paddingTop: "var(--safe-area-inset-top, env(safe-area-inset-top))", paddingBottom: "var(--safe-area-inset-bottom, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center justify-between px-4 sm:px-7 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></span>
          {t("voiceMode")}
        </div>
        <button type="button" onClick={onEnd} aria-label={t("voiceModeEnd")} className="tap-44 w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 min-h-0">
        <button
          type="button"
          onClick={onOrb}
          disabled={!orbAction}
          aria-label={orbAction ?? label}
          className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full focus-visible:outline-4 focus-visible:outline-blue-200 disabled:cursor-default"
        >
          <span
            aria-hidden
            className={cn("absolute inset-0 rounded-full gradient-primary blur-2xl transition-[transform,opacity] duration-150", paused ? "opacity-10" : "opacity-40")}
            style={{ transform: `scale(${state === "listening" ? 1 + level * 0.7 : 1})` }}
          />
          <span
            aria-hidden
            className={cn(
              "absolute inset-3 rounded-full gradient-primary shadow-2xl transition-transform duration-100",
              state === "speaking" && "voice-orb-speak",
              state === "thinking" && "voice-orb-think",
              paused && "opacity-40 grayscale",
            )}
            style={state === "listening" ? { transform: `scale(${1 + level * 0.18})` } : undefined}
          />
          <span aria-hidden className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),transparent_55%)]" />
        </button>

        <div className="text-center max-w-md w-full space-y-3" aria-live="polite">
          <p className="text-lg font-bold text-slate-800">{label}</p>
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : state === "listening" && !heard && !question ? (
            <p className="text-sm text-slate-500">{t("voiceModeHint")}</p>
          ) : null}
          {question && <p className="text-sm text-slate-500 italic line-clamp-2">“{question}”</p>}
          {reply && <p className="text-[15px] leading-relaxed text-slate-700 line-clamp-5 whitespace-pre-line">{renderChatText(reply)}</p>}
          {hasSuggestions && (
            <button type="button" onClick={onEnd} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold px-4 py-2 hover:bg-blue-100">
              {t("voiceModeSeeChat")} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-10 pb-8 pt-4">
        <button
          type="button"
          onClick={onMute}
          aria-pressed={paused}
          aria-label={paused ? t("voiceModeUnmute") : t("voiceModeMute")}
          className={cn("w-16 h-16 rounded-full flex items-center justify-center transition-colors", paused ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}
        >
          {paused ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button
          type="button"
          onClick={onEnd}
          aria-label={t("voiceModeEnd")}
          className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          <X className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
