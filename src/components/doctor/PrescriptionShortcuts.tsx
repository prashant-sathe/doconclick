"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, History, Loader2, Settings2, Star, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";
import { FREQUENCY_OPTIONS, DURATION_OPTIONS } from "@/lib/medicalOptions";
import { medicineAllergyMatches, medicineSuggestions } from "@/lib/medicineCatalog";
import { cn } from "@/lib/utils";

// Prescription-editor shortcuts for the doctor's Complete Visit form (FP1-8):
// medicine autocomplete (built-in list + the doctor's favourites), favourite
// medicines, named templates, "repeat last prescription" and an advisory
// allergy warning. They only fill the form — saving still goes through
// POST /api/appointments/[id]/complete and its prescription-lock rules.

/** A medicine row as the Complete Visit form edits it ("Other" + free text for custom values). */
export interface EditorMedicineRow {
  name: string;
  dosage: string;
  frequency: string;
  frequencyOther: string;
  duration: string;
  durationOther: string;
  instructions: string;
}
export interface EditorTestRow {
  name: string;
  instructions: string;
}
export type SavedMedicine = { name: string; dosage: string; frequency: string; duration: string; instructions: string | null };
type SavedTest = { name: string; instructions: string | null };
type Favourite = SavedMedicine & { id: string };
type Template = { id: string; name: string; medicines: SavedMedicine[]; tests: SavedTest[] };
type Context = { allergies: string[]; lastPrescription: { appointmentId: string; date: string; medicines: SavedMedicine[]; tests: SavedTest[] } | null };

const pick = (options: string[], value: string) =>
  !value ? { v: "", other: "" } : options.includes(value) && value !== "Other" ? { v: value, other: "" } : { v: "Other", other: value };

/** A saved medicine as an editor row. */
export function rowFromMedicine(m: SavedMedicine): EditorMedicineRow {
  const f = pick(FREQUENCY_OPTIONS, m.frequency ?? "");
  const d = pick(DURATION_OPTIONS, m.duration ?? "");
  return { name: m.name, dosage: m.dosage ?? "", frequency: f.v, frequencyOther: f.other, duration: d.v, durationOther: d.other, instructions: m.instructions ?? "" };
}

/** An editor row as the values saved on the prescription. */
export function medicineFromRow(m: EditorMedicineRow): SavedMedicine {
  return {
    name: m.name,
    dosage: m.dosage,
    frequency: m.frequency === "Other" ? m.frequencyOther.trim() : m.frequency,
    duration: m.duration === "Other" ? m.durationOther.trim() : m.duration,
    instructions: m.instructions,
  };
}

const testRow = (t: SavedTest): EditorTestRow => ({ name: t.name, instructions: t.instructions ?? "" });
const key = (name: string) => name.trim().toLowerCase();

/** Loads the doctor's favourites/templates and this visit's allergies + last prescription. */
export function usePrescriptionKit(appointmentId: string) {
  const favLoad = useLoad<{ favourites: Favourite[] }>("/api/doctor/prescription-favourites");
  const tplLoad = useLoad<{ templates: Template[] }>("/api/doctor/prescription-templates");
  const ctxLoad = useLoad<Context>(`/api/appointments/${appointmentId}/prescription-context`);
  const favourites = useMemo(() => favLoad.data?.favourites ?? [], [favLoad.data]);
  return {
    favourites,
    setFavourites: (next: Favourite[]) => favLoad.setData({ favourites: next }),
    templates: tplLoad.data?.templates ?? [],
    setTemplates: (next: Template[]) => tplLoad.setData({ templates: next }),
    allergies: ctxLoad.data?.allergies ?? [],
    lastPrescription: ctxLoad.data?.lastPrescription ?? null,
    suggestions: useMemo(() => medicineSuggestions(favourites.map((f) => f.name)), [favourites]),
  };
}
export type PrescriptionKit = ReturnType<typeof usePrescriptionKit>;

/** <datalist> for the medicine-name inputs (free text still allowed). */
export function MedicineDatalist({ id, kit }: { id: string; kit: PrescriptionKit }) {
  return (
    <datalist id={id}>
      {kit.suggestions.map((o) => <option key={o} value={o} />)}
    </datalist>
  );
}

/** Filled star = this medicine is a favourite; tap to save it (with this row's values) or remove it. */
export function FavouriteStar({ row, kit }: { row: EditorMedicineRow; kit: PrescriptionKit }) {
  const t = useTranslations("doctor.prescriptionKit");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!row.name.trim()) return null;
  const fav = kit.favourites.find((f) => key(f.name) === key(row.name));
  const toggle = async () => {
    setBusy(true);
    if (fav) {
      const res = await mutate(`/api/doctor/prescription-favourites/${fav.id}`, { method: "DELETE" });
      if (res.ok) kit.setFavourites(kit.favourites.filter((f) => f.id !== fav.id));
      else toast.error(res.error);
    } else {
      const res = await mutate<{ favourite: Favourite }>("/api/doctor/prescription-favourites", { body: medicineFromRow(row) });
      if (res.ok) {
        kit.setFavourites([...kit.favourites.filter((f) => key(f.name) !== key(res.data.favourite.name)), res.data.favourite].sort((a, b) => key(a.name).localeCompare(key(b.name))));
        toast.success(t("favouriteSaved"));
      } else toast.error(res.error);
    }
    setBusy(false);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="flex-shrink-0 min-w-[44px] min-h-[44px] -my-1.5 flex items-center justify-center text-amber-500 hover:text-amber-600 disabled:opacity-50"
      aria-label={fav ? t("removeFavourite") : t("addFavourite")}
      title={fav ? t("removeFavourite") : t("addFavourite")}
    >
      <Star className={cn("w-3.5 h-3.5", fav && "fill-current")} />
    </button>
  );
}

/** Advisory line under a medicine row when it may clash with the patient's allergies. */
export function RowAllergyWarning({ name, kit }: { name: string; kit: PrescriptionKit }) {
  const t = useTranslations("doctor.prescriptionKit");
  const hits = useMemo(() => (kit.allergies.length ? medicineAllergyMatches(name, kit.allergies) : []), [name, kit.allergies]);
  if (!hits.length) return null;
  return (
    <p role="alert" className="col-span-2 sm:col-span-6 flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700">
      <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {t("rowAllergy", { list: hits.join(", ") })}
    </p>
  );
}

/**
 * Above the medicine rows: the patient's allergies on record, repeat last,
 * templates (use / save / delete) and favourite chips (tap to add a row).
 */
export function PrescriptionToolbar({ kit, medicines, tests, onReplace, onAddMedicine }: {
  kit: PrescriptionKit;
  medicines: EditorMedicineRow[];
  tests: EditorTestRow[];
  onReplace: (medicines: EditorMedicineRow[], tests: EditorTestRow[]) => void;
  onAddMedicine: (row: EditorMedicineRow) => void;
}) {
  const t = useTranslations("doctor.prescriptionKit");
  const locale = formattingLocale(useLocale());
  const toast = useToast();
  const [pending, setPending] = useState<{ medicines: SavedMedicine[]; tests: SavedTest[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingOpen, setSavingOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasItems = medicines.some((m) => m.name.trim()) || tests.some((r) => r.name.trim());
  const apply = (set: { medicines: SavedMedicine[]; tests: SavedTest[] }) => {
    onReplace(
      set.medicines.length ? set.medicines.map(rowFromMedicine) : [rowFromMedicine({ name: "", dosage: "", frequency: "", duration: "", instructions: null })],
      set.tests.length ? set.tests.map(testRow) : [{ name: "", instructions: "" }],
    );
    setPending(null);
  };
  const offer = (set: { medicines: SavedMedicine[]; tests: SavedTest[] }) => (hasItems ? setPending(set) : apply(set));

  const saveTemplate = async () => {
    setSaving(true);
    const res = await mutate<{ template: Template }>("/api/doctor/prescription-templates", {
      body: { name: templateName, medicines: medicines.filter((m) => m.name.trim()).map(medicineFromRow), tests: tests.filter((r) => r.name.trim()) },
    });
    setSaving(false);
    if (!res.ok) { toast.error(res.error); return; }
    const saved = res.data.template;
    kit.setTemplates([...kit.templates.filter((x) => x.id !== saved.id), saved].sort((a, b) => key(a.name).localeCompare(key(b.name))));
    toast.success(t("templateSaved", { name: saved.name }));
    setTemplateName("");
    setSavingOpen(false);
  };
  const remove = async (kind: "favourite" | "template", id: string) => {
    setBusyId(id);
    const res = await mutate(`/api/doctor/prescription-${kind === "favourite" ? "favourites" : "templates"}/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) { toast.error(res.error); return; }
    if (kind === "favourite") kit.setFavourites(kit.favourites.filter((f) => f.id !== id));
    else kit.setTemplates(kit.templates.filter((x) => x.id !== id));
  };
  const replacesExisting = kit.templates.some((x) => key(x.name) === key(templateName));
  const last = kit.lastPrescription;

  return (
    <div className="space-y-2 mb-2">
      {kit.allergies.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">{t("allergiesOnRecord")}</span> {kit.allergies.join(", ")}
            <span className="block text-[11px] text-amber-700 mt-0.5">{t("allergyNote")}</span>
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {last && (
          <button type="button" onClick={() => offer(last)} className="btn-secondary min-h-[44px] py-1 px-2.5 text-xs inline-flex items-center gap-1">
            <History className="w-3.5 h-3.5" />
            {t("repeatLast", { date: new Date(last.date).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) })}
          </button>
        )}
        {kit.templates.length > 0 && (
          <select
            className="input-field text-xs py-1.5 w-auto min-h-[44px]"
            value=""
            aria-label={t("useTemplate")}
            onChange={(e) => { const tpl = kit.templates.find((x) => x.id === e.target.value); if (tpl) offer(tpl); }}
          >
            <option value="">{t("useTemplate")}</option>
            {kit.templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setSavingOpen((o) => !o)}
          disabled={!hasItems}
          title={!hasItems ? t("saveTemplateNeedsItems") : undefined}
          className="min-h-[44px] text-xs text-teal-700 font-semibold inline-flex items-center gap-1 hover:underline disabled:opacity-50 disabled:no-underline"
        >
          <BookmarkPlus className="w-3.5 h-3.5" /> {t("saveAsTemplate")}
        </button>
        {(kit.favourites.length > 0 || kit.templates.length > 0) && (
          <button type="button" onClick={() => setManage((m) => !m)} className="min-h-[44px] text-xs text-slate-500 font-semibold inline-flex items-center gap-1 hover:underline">
            <Settings2 className="w-3.5 h-3.5" /> {manage ? t("doneManaging") : t("manage")}
          </button>
        )}
      </div>

      {savingOpen && hasItems && (
        <div className="bg-white rounded-lg border border-slate-200 p-2 space-y-1">
          <div className="flex gap-1.5">
            <input
              className="input-field text-xs py-1.5 flex-1"
              placeholder={t("templateNamePlaceholder")}
              maxLength={60}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <button type="button" onClick={saveTemplate} disabled={saving || !templateName.trim()} className="btn-primary min-h-[44px] py-1.5 px-3 text-xs disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("save")}
            </button>
          </div>
          {replacesExisting && <p className="text-[11px] text-amber-700">{t("replacesTemplate")}</p>}
        </div>
      )}

      {kit.favourites.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("favourites")}>
          {kit.favourites.map((f) => (
            <span key={f.id} className="inline-flex items-center rounded-full border border-amber-200 bg-white text-xs text-slate-700">
              <button type="button" onClick={() => onAddMedicine(rowFromMedicine(f))} className="min-h-[44px] px-2.5 inline-flex items-center gap-1" title={t("addFavouriteRow")}>
                <Star className="w-3 h-3 text-amber-500 fill-current" /> {f.name}
              </button>
              {manage && (
                <button type="button" onClick={() => remove("favourite", f.id)} disabled={busyId === f.id} className="min-h-[44px] min-w-[44px] pr-1 text-slate-400 hover:text-red-500 disabled:opacity-50" aria-label={t("removeFavouriteNamed", { name: f.name })}>
                  <X className="w-3 h-3 mx-auto" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {manage && kit.templates.length > 0 && (
        <ul className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
          {kit.templates.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 px-2.5 py-1 text-xs text-slate-700">
              <span className="truncate">{x.name} <span className="text-slate-400">· {t("templateCounts", { medicines: x.medicines.length, tests: x.tests.length })}</span></span>
              <button type="button" onClick={() => remove("template", x.id)} disabled={busyId === x.id} className="min-h-[44px] min-w-[44px] px-2 text-red-500 font-semibold hover:underline disabled:opacity-50">
                {t("deleteTemplate")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          icon={History}
          tone="warning"
          title={t("replaceTitle")}
          message={t("replaceBody")}
          confirmLabel={t("replace")}
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
