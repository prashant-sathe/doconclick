// Synthesizes a short two-tone beep via the Web Audio API — no audio asset
// needed. Browsers suspend a fresh AudioContext until it's resumed inside a
// direct user gesture (click/keydown/touch), so a single shared context is
// created once and unlocked on first interaction — created any later (e.g.
// from inside a setInterval poll callback) it would just play silently.
let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      sharedCtx = new AudioContextClass();
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

// Call once, from a real user gesture handler (click/keydown/touchstart), to
// unlock audio playback for the rest of the session.
export function unlockAudio() {
  const ctx = getContext();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

function beep() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };
    tone(880, 0, 0.12);
    tone(1108, 0.14, 0.16);
  } catch {
    // Best-effort only.
  }
}

const RING_INTERVAL_MS = 1800;
const RING_MAX_MS = 60000;

// Rings repeatedly (like an incoming call) until stopped, capped at 60s so it
// never rings forever if the doctor genuinely isn't there. Returns a stop
// function — call it as soon as the doctor acknowledges the notification
// (opens the bell, clicks the toast, or it auto-dismisses).
export function startRingingAlert(): () => void {
  beep();
  const interval = setInterval(beep, RING_INTERVAL_MS);
  const timeout = setTimeout(() => clearInterval(interval), RING_MAX_MS);
  return () => {
    clearInterval(interval);
    clearTimeout(timeout);
  };
}
