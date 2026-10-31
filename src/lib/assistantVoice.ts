// Limits for the Health Assistant's voice mode — shared by the transcribe /
// speak routes and the chat page (client-safe; the OpenAI calls live in the
// routes). A question is recorded in the browser, transcribed, and sent as an
// ordinary text turn; the reply to a spoken question is read back aloud.

export const VOICE_MAX_SECONDS = 60;
// ~60 s of Opus/AAC is well under 1 MB; the headroom covers WAV from
// browsers that can't record compressed audio.
export const VOICE_MAX_BYTES = 6 * 1024 * 1024;
export const VOICE_SPEAK_MAX_CHARS = 4000; // TTS input limit is 4096

/** Container types MediaRecorder produces across Chrome/Android, Safari/iOS and Firefox. */
export const VOICE_AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/aac": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** "audio/webm;codecs=opus" → "audio/webm". */
export const baseAudioType = (type: string) => type.split(";")[0].trim().toLowerCase();

/** A reply as it should be read aloud: the chat's light markdown removed. */
export function speakableText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, VOICE_SPEAK_MAX_CHARS);
}
