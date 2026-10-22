export const AUDIENCES = ["DOCTOR", "PATIENT", "BOTH"];

export type AnnouncementButton = { label: string; url: string };

/**
 * A button link that stays where it says: an absolute http(s) URL, or a path
 * on this site. "//evil.com" and "/\\evil.com" start with "/" but browsers
 * treat them as another host (protocol-relative), so they're rejected — as
 * is anything with whitespace or control characters a browser might strip.
 */
export function isSafeAnnouncementUrl(url: string): boolean {
  if (/[\s\u0000-\u001f]/.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch {
    return false;
  }
}

/** A same-site path the app can router.push() (not a protocol-relative URL). */
export function isInternalPath(url: string): boolean {
  return url.startsWith("/") && isSafeAnnouncementUrl(url);
}

// Returns the cleaned button list, or null if the input is invalid.
export function validateButtons(buttons: unknown): AnnouncementButton[] | null {
  if (buttons == null) return [];
  if (!Array.isArray(buttons) || buttons.length > 2) return null;
  const cleaned: AnnouncementButton[] = [];
  for (const b of buttons) {
    if (!b || typeof b !== "object") return null;
    const label = String((b as AnnouncementButton).label ?? "").trim();
    const url = String((b as AnnouncementButton).url ?? "").trim();
    if (!label || !url) return null;
    if (!isSafeAnnouncementUrl(url)) return null;
    cleaned.push({ label, url });
  }
  return cleaned;
}
