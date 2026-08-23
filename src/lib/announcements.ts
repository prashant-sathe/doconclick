export const AUDIENCES = ["DOCTOR", "PATIENT", "BOTH"];

export type AnnouncementButton = { label: string; url: string };

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
    if (!/^https?:\/\//.test(url) && !url.startsWith("/")) return null;
    cleaned.push({ label, url });
  }
  return cleaned;
}
