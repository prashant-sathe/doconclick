/** A patient's name as shown publicly (reviews): first name + last initial —
 *  "Raj Sharma" → "Raj S.", "raj" → "Raj". Empty/missing → "Patient". */
export function publicName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Patient";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const first = cap(parts[0]);
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
