// Lab test price + name matching — no imports, so the doctor's prescription
// editor (client) and the server use the very same rules.

/** What the patient pays for a test: b2bPrice × (1 + commission%), whole rupees. */
export function labTestPrice(t: { b2bPrice: number; commissionPercent: number }): number {
  return Math.round(t.b2bPrice * (1 + t.commissionPercent / 100));
}

/** Lower-cased, single-spaced — how a prescription row's name is matched to a catalogue test. */
export const labTestKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

// Only letters/digits — "Vit. B-12" and "vit b12" compare equal.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// How doctors commonly write a test (and the old built-in suggestion list),
// mapped to the price-list name. Used only when that name is in the
// catalogue; keys are squash()ed.
export const LAB_ALIASES: Record<string, string> = Object.fromEntries(
  ([
    [["cbc", "cbccompletebloodcount", "completebloodcount", "hemogram", "haemogram", "cbcwithesr"], "Complete Hemogram (CBC)"],
    [["lft", "liverfunctiontestlft", "liverfunctiontests"], "Liver Function Test"],
    [["kft", "rft", "kidneyfunctiontestkft", "renalfunctiontest", "kidneyfunctiontests"], "Kidney Function Test"],
    [["lipid", "lipidprofiletest", "fastinglipidprofile"], "Lipid Profile"],
    [["tft", "thyroidprofile", "thyroidprofilet3t4tsh", "t3t4tsh", "thyroidfunctiontest"], "Thyroid Profile-Total (T3, T4 & TSH Ultra-sensitive)"],
    [["ft3ft4tsh", "freethyroidprofile"], "Thyroid Profile-Free (FT3, FT4 & TSH)"],
    [["tsh"], "TSH Ultra Sensitive"],
    [["fbs", "bsf", "bloodsugarfasting", "fastingbloodsugar", "fastingbloodglucose", "glucosefasting"], "Blood Glucose Fasting"],
    [["rbs", "bsr", "bloodsugarrandom", "randombloodglucose"], "Random Blood Sugar"],
    [["hba1c", "glycosylatedhemoglobin", "glycatedhaemoglobin"], "HbA1C"],
    [["vitamind", "vitd", "vitd3", "25ohvitamind", "vitamind3"], "Vitamin D Total -25 Hydroxy"],
    [["vitaminb12", "vitb12", "b12"], "Vitamin B12 Cyanocobalamin"],
    [["urineroutine", "urinerm", "urineroutinemicroscopy", "urineexamination"], "Urine Routine & Microscopy"],
    [["stoolroutine", "stoolexamination"], "Stool Routine and Microscopic Examination"],
    [["esr"], "ESR Automated"],
    [["crp", "creactiveprotein"], "CRP"],
    [["hscrp"], "HsCRP High Sensitivity CRP"],
    [["widal", "widaltest"], "Widal Profile"],
    [["denguens1", "denguens1antigen", "ns1", "ns1antigen"], "Dengue NS1 Antigen Detection - Rapid Card"],
    [["denguepanel", "denguens1iggigm", "dengueprofile"], "Dengue Antigen NS1, IgG & IgM"],
    [["mp", "malaria", "malariaparasite", "mpsmear"], "Malaria Parasite detection by Smear Examination"],
    [["malariaantigen", "malariacard"], "Malarial Antigen, Vivax & Falciparum"],
    [["serumcreatinine", "screatinine", "creatinine"], "Creatinine, Serum"],
    [["uricacid", "serumuricacid"], "Uric Acid, Serum"],
    [["electrolytes", "serumelectrolytes"], "Electrolytes Profile"],
    [["platelets", "plateletcount"], "Platelet Count Thrombocyte count"],
    [["hb", "hemoglobin", "haemoglobin"], "Hemoglobin Hb"],
    [["bloodgroup", "bloodgrouping", "abo"], "Blood Group profile ABO & Rh Typing (manual), Blood"],
    [["sgpt", "alt"], "SGPT/ALT"],
    [["sgot", "ast"], "SGOT/AST"],
    [["ironstudies"], "Iron Studies With Ferritin"],
    [["urineculture"], "Culture & Sensitivity, Aerobic bacteria, Urine"],
    [["bloodculture"], "Culture & Sensitivity, Blood"],
    [["hiv", "hivrapid"], "HIV 1 & 2 - Rapid Card"],
    [["hbsag"], "Hepatitis B Virus (HBV) HBsAg - Screening Surface antigen"],
    [["betahcg", "bhcg"], "HCG Beta Subunit"],
    [["psa"], "PSA-total Prostate Specific Antigen, Total"],
  ] as [string[], string][]).flatMap(([keys, name]) => keys.map((k) => [k, name])),
);

/**
 * The catalogue test a prescription row means, or null. Deterministic and
 * conservative — a wrong match would charge the patient for the wrong test:
 *   1. the same name (case/spaces ignored, then punctuation ignored);
 *   2. a common shorthand from LAB_ALIASES;
 *   3. the abbreviation in a catalogue name's brackets ("CBC" → "Complete Hemogram (CBC)"),
 *      only when exactly one test has it;
 *   4. the abbreviation a name starts with ("AMH", "TPO"), only when unique.
 */
export function resolveLabTest<T extends { name: string }>(name: string, catalogue: T[]): T | null {
  const key = labTestKey(name);
  if (!key) return null;
  const exact = catalogue.find((t) => labTestKey(t.name) === key);
  if (exact) return exact;
  const sq = squash(name);
  if (!sq) return null;
  // …also without a trailing specimen ("CA-125" = "CA-125, Serum").
  const bare = (n: string) => squash(n.replace(/,\s*(serum|blood|urine|stool|sputum)\s*$/i, ""));
  const loose = catalogue.filter((t) => squash(t.name) === sq || bare(t.name) === sq);
  if (loose.length === 1) return loose[0];
  const alias = LAB_ALIASES[sq];
  if (alias) {
    const hit = catalogue.find((t) => labTestKey(t.name) === labTestKey(alias));
    if (hit) return hit;
  }
  const bracketed = catalogue.filter((t) => [...t.name.matchAll(/\(([^)]+)\)/g)].some((m) => squash(m[1]) === sq));
  if (bracketed.length === 1) return bracketed[0];
  if (bracketed.length > 1) return null;
  // 4. a leading abbreviation ("AMH" → "AMH (Mullerian…)"), again only when unique.
  const leading = catalogue.filter((t) => squash(t.name.split(/[\s(,-]/)[0] ?? "") === sq);
  return leading.length === 1 ? leading[0] : null;
}
