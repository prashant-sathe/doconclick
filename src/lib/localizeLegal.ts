import type { LegalSection } from "@/lib/legalContent";

// Swaps the English words in the legal sections for the active language's text
// (messages/<locale>/legal.json, keys tos.sN.heading / tos.sN.pM). The English
// legalContent.ts only supplies the structure; tests/i18n.ts guards the drift.
// `t` is the translator for the "legal" namespace.
export function localizeLegal(
  group: "tos" | "privacy",
  sections: LegalSection[],
  t: (key: never) => string,
): LegalSection[] {
  const text = (key: string) => t(key as never);
  return sections.map((s, i) => ({
    heading: text(`${group}.s${i + 1}.heading`),
    body: s.body.map((_, j) => text(`${group}.s${i + 1}.p${j + 1}`)),
  }));
}
