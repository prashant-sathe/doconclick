// Prescription-editor helpers that run in the browser and on the server:
// a small built-in list of common Indian generic medicines for the
// medicine-name autocomplete (a suggestion list only — any free-text name is
// still accepted), and an advisory drug-allergy check against the allergy
// text the patient gave (booking snapshot + profile). The check only warns;
// it never blocks saving, and it can't be exhaustive — it knows the generics
// below, a handful of common brands and the main cross-reacting drug groups.

export const MEDICINE_SUGGESTIONS = [
  // Pain / fever
  "Paracetamol 500 mg", "Paracetamol 650 mg", "Paracetamol syrup 250 mg/5 ml", "Ibuprofen 400 mg",
  "Ibuprofen + Paracetamol 400/325 mg", "Diclofenac 50 mg", "Aceclofenac 100 mg", "Aceclofenac + Paracetamol 100/325 mg",
  "Mefenamic acid 500 mg", "Naproxen 250 mg", "Etoricoxib 90 mg", "Tramadol 50 mg", "Aspirin 75 mg",
  // Antibiotics
  "Amoxicillin 500 mg", "Amoxicillin + Clavulanic acid 625 mg", "Azithromycin 500 mg", "Azithromycin 250 mg",
  "Cefixime 200 mg", "Cefuroxime 500 mg", "Cefpodoxime 200 mg", "Cephalexin 500 mg", "Ciprofloxacin 500 mg",
  "Ofloxacin 200 mg", "Levofloxacin 500 mg", "Norfloxacin 400 mg", "Doxycycline 100 mg", "Metronidazole 400 mg",
  "Ornidazole 500 mg", "Nitrofurantoin 100 mg", "Cotrimoxazole (Sulfamethoxazole + Trimethoprim) 800/160 mg",
  "Clarithromycin 500 mg", "Linezolid 600 mg",
  // Antifungal / antiviral / antiparasitic
  "Fluconazole 150 mg", "Itraconazole 100 mg", "Terbinafine 250 mg", "Acyclovir 400 mg", "Valacyclovir 500 mg",
  "Albendazole 400 mg", "Ivermectin 12 mg",
  // Allergy / cold / cough
  "Cetirizine 10 mg", "Levocetirizine 5 mg", "Fexofenadine 120 mg", "Montelukast 10 mg",
  "Montelukast + Levocetirizine 10/5 mg", "Chlorpheniramine 4 mg", "Phenylephrine + Chlorpheniramine + Paracetamol",
  "Dextromethorphan syrup", "Ambroxol syrup 30 mg/5 ml", "Salbutamol inhaler 100 mcg",
  "Budesonide + Formoterol inhaler", "Levosalbutamol nebules",
  // Stomach
  "Pantoprazole 40 mg", "Omeprazole 20 mg", "Rabeprazole 20 mg", "Esomeprazole 40 mg", "Famotidine 20 mg",
  "Domperidone 10 mg", "Pantoprazole + Domperidone 40/30 mg", "Ondansetron 4 mg", "Antacid gel (Aluminium + Magnesium hydroxide)",
  "Oral rehydration salts (ORS)", "Loperamide 2 mg", "Racecadotril 100 mg", "Lactulose syrup", "Bisacodyl 5 mg",
  "Dicyclomine 20 mg", "Drotaverine 40 mg", "Probiotic (Saccharomyces boulardii)",
  // Diabetes
  "Metformin 500 mg", "Metformin 1000 mg", "Glimepiride 1 mg", "Glimepiride 2 mg", "Gliclazide 80 mg",
  "Sitagliptin 100 mg", "Vildagliptin 50 mg", "Teneligliptin 20 mg", "Dapagliflozin 10 mg", "Empagliflozin 10 mg",
  "Voglibose 0.3 mg", "Insulin glargine", "Insulin regular (human)",
  // Heart / blood pressure / cholesterol
  "Amlodipine 5 mg", "Telmisartan 40 mg", "Losartan 50 mg", "Olmesartan 20 mg", "Telmisartan + Amlodipine 40/5 mg",
  "Metoprolol 25 mg", "Atenolol 50 mg", "Bisoprolol 5 mg", "Ramipril 5 mg", "Enalapril 5 mg",
  "Hydrochlorothiazide 12.5 mg", "Furosemide 40 mg", "Spironolactone 25 mg", "Atorvastatin 10 mg", "Atorvastatin 20 mg",
  "Rosuvastatin 10 mg", "Clopidogrel 75 mg", "Isosorbide mononitrate 20 mg",
  // Thyroid / hormones / steroids
  "Levothyroxine 50 mcg", "Levothyroxine 100 mcg", "Prednisolone 10 mg", "Methylprednisolone 8 mg", "Dexamethasone 4 mg",
  "Deflazacort 6 mg",
  // Vitamins / supplements
  "Vitamin D3 60000 IU", "Calcium + Vitamin D3", "Methylcobalamin 1500 mcg", "Vitamin B complex", "Folic acid 5 mg",
  "Ferrous sulphate + Folic acid", "Zinc 20 mg", "Multivitamin",
  // Neuro / psych / sleep
  "Amitriptyline 10 mg", "Pregabalin 75 mg", "Gabapentin 300 mg", "Escitalopram 10 mg", "Sertraline 50 mg",
  "Alprazolam 0.25 mg", "Clonazepam 0.5 mg", "Levetiracetam 500 mg", "Betahistine 16 mg", "Cinnarizine 25 mg",
  // Skin / eye / ear (topical)
  "Mupirocin ointment 2%", "Clotrimazole cream 1%", "Fusidic acid cream 2%", "Betamethasone cream 0.1%",
  "Calamine lotion", "Permethrin cream 5%", "Moxifloxacin eye drops 0.5%", "Carboxymethylcellulose eye drops",
  "Ciprofloxacin ear drops",
  // Others
  "Tamsulosin 0.4 mg", "Thiocolchicoside 4 mg", "Chlorzoxazone + Paracetamol", "Tranexamic acid 500 mg",
] as const;

/** The autocomplete list: the doctor's favourites first, then the built-in list, no duplicates. */
export function medicineSuggestions(favouriteNames: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...favouriteNames, ...MEDICINE_SUGGESTIONS]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

// ── Drug-allergy warning ──

// Common Indian brands → the generic they contain, so "allergic to Augmentin"
// or a medicine typed as "Dolo 650" still matches.
const BRAND_GENERICS: Record<string, string[]> = {
  dolo: ["paracetamol"], crocin: ["paracetamol"], calpol: ["paracetamol"], metacin: ["paracetamol"],
  combiflam: ["ibuprofen", "paracetamol"], brufen: ["ibuprofen"], voveran: ["diclofenac"], hifenac: ["aceclofenac"],
  zerodol: ["aceclofenac"], meftal: ["mefenamic"], disprin: ["aspirin"], ecosprin: ["aspirin"],
  augmentin: ["amoxicillin"], moxclav: ["amoxicillin"], clavam: ["amoxicillin"], mox: ["amoxicillin"], novamox: ["amoxicillin"],
  azee: ["azithromycin"], azithral: ["azithromycin"], zifi: ["cefixime"], taxim: ["cefixime"], ceftum: ["cefuroxime"],
  ciplox: ["ciprofloxacin"], cifran: ["ciprofloxacin"], oflox: ["ofloxacin"], zenflox: ["ofloxacin"], norflox: ["norfloxacin"],
  levoflox: ["levofloxacin"], flagyl: ["metronidazole"], metrogyl: ["metronidazole"], septran: ["sulfamethoxazole"],
  bactrim: ["sulfamethoxazole"], doxy: ["doxycycline"], pan: ["pantoprazole"], omez: ["omeprazole"], razo: ["rabeprazole"],
  allegra: ["fexofenadine"], montair: ["montelukast"], okacet: ["cetirizine"], glycomet: ["metformin"], amaryl: ["glimepiride"],
  thyronorm: ["levothyroxine"], eltroxin: ["levothyroxine"], wysolone: ["prednisolone"], emeset: ["ondansetron"],
};

// Drug groups where an allergy to one member (or the group) means caution with
// the others. `triggers` are words that name the group in allergy text.
const ALLERGY_GROUPS: { group: string; triggers: string[]; members: string[] }[] = [
  { group: "penicillin", triggers: ["penicillin", "beta lactam", "betalactam"], members: ["penicillin", "amoxicillin", "ampicillin", "cloxacillin", "piperacillin", "benzathine"] },
  { group: "cephalosporin", triggers: ["cephalosporin"], members: ["cefixime", "cefuroxime", "cefpodoxime", "ceftriaxone", "cefadroxil", "cephalexin", "cefalexin", "cefotaxime", "cefdinir"] },
  { group: "sulfa", triggers: ["sulfa", "sulpha", "sulfonamide", "sulphonamide"], members: ["sulfamethoxazole", "sulphamethoxazole", "cotrimoxazole", "co trimoxazole", "sulfasalazine"] },
  { group: "nsaid", triggers: ["nsaid", "nsaids", "anti inflammatory"], members: ["aspirin", "ibuprofen", "diclofenac", "aceclofenac", "naproxen", "mefenamic", "ketorolac", "etoricoxib", "piroxicam", "nimesulide", "indomethacin"] },
  { group: "macrolide", triggers: ["macrolide"], members: ["azithromycin", "clarithromycin", "erythromycin", "roxithromycin"] },
  { group: "quinolone", triggers: ["quinolone", "fluoroquinolone"], members: ["ciprofloxacin", "ofloxacin", "levofloxacin", "norfloxacin", "moxifloxacin"] },
  { group: "tetracycline", triggers: ["tetracycline"], members: ["tetracycline", "doxycycline", "minocycline"] },
];

const NO_ALLERGY = new Set(["none", "nil", "no", "na", "n a", "nka", "nkda", "no known allergies", "no known allergy", "no allergies", "no allergy", "not known", "unknown"]);

// Words in allergy text that say nothing about which drug ("sulfa drugs", "rash from tablets").
const FILLER = new Set(["drug", "drugs", "tablet", "tablets", "medicine", "medicines", "cream", "syrup", "injection", "drops",
  "allergy", "allergic", "allergies", "reaction", "rash", "group", "family", "class", "based", "severe", "mild"]);

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z]+/g, " ").trim()} `;

/** The text plus the generics of any brand named in it, padded for whole-word checks. */
function expand(text: string): string {
  const n = norm(text);
  const extra = Object.entries(BRAND_GENERICS).filter(([brand]) => n.includes(` ${brand} `)).flatMap(([, g]) => g);
  return extra.length ? `${n}${extra.join(" ")} ` : n;
}

/** The separate allergies in free text ("Penicillin, dust; sulfa drugs"), minus "none"-style answers. */
export function allergyTerms(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    for (const raw of (text ?? "").split(/[,;\n/&]|\band\b/i)) {
      const term = raw.trim();
      const key = norm(term).trim();
      if (!key || NO_ALLERGY.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(term);
    }
  }
  return out;
}

/**
 * The patient's allergies (from `allergyTerms`) that this medicine may clash
 * with — the same drug (by name or brand), or one in the same group. Empty
 * when nothing matches. Advisory only.
 */
export function medicineAllergyMatches(medicineName: string, allergies: string[]): string[] {
  const med = expand(medicineName);
  if (!med.trim()) return [];
  return allergies.filter((term) => {
    const allergy = expand(term);
    // Same drug: a 4+ letter word of the allergy (or its brand's generic) appears in the medicine.
    const words = allergy.trim().split(" ").filter((w) => w.length >= 4 && !FILLER.has(w));
    if (words.some((w) => med.includes(` ${w}`))) return true;
    // Same group: the allergy names the group or a member, and the medicine contains a member.
    return ALLERGY_GROUPS.some((g) => {
      const allergyHit = [...g.triggers, ...g.members].some((w) => allergy.includes(` ${w}`));
      return allergyHit && g.members.some((m) => med.includes(` ${m}`));
    });
  });
}
