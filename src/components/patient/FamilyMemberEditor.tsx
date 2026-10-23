"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  DependentFields, EMPTY_DEPENDENT_FORM, dependentFormBody, dependentToForm, type Dependent,
} from "@/components/patient/DependentForm";
import { mutate } from "@/lib/apiClient";
import { RELATIONS } from "@/lib/relations";

const FAMILY_HREF = "/patient/profile/family";
const FAMILY_RELATIONS = RELATIONS.filter((r) => r !== "Self");

// Add (no `id`) or edit/delete one saved family member — the
// /patient/profile/family/new and /…/family/[id] screens.
export default function FamilyMemberEditor({ id }: { id?: string }) {
  const router = useRouter();
  const t = useTranslations("patientAccount.family");
  const ts = useTranslations("patientAccount.shell");
  const td = useTranslations("booking.dependents");
  const tc = useTranslations("booking.common");

  const [form, setForm] = useState(EMPTY_DEPENDENT_FORM);
  const [relation, setRelation] = useState("");
  const [original, setOriginal] = useState<(Dependent & { vitalsCount: number }) | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [notFound, setNotFound] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/patients/me/dependents/${id}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        const d = (await r.json()) as Dependent & { vitalsCount: number };
        setOriginal(d);
        setForm(dependentToForm(d));
        setRelation(d.relation);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const touch = () => { setDirty(true); setSaved(false); };

  const save = async () => {
    if (!relation) { setError(t("errRelation")); return; }
    if (!form.name.trim()) { setError(td("errorName")); return; }
    setSaving(true);
    setError("");
    const r = await mutate<Dependent>(id ? `/api/patients/me/dependents/${id}` : "/api/patients/me/dependents", {
      method: id ? "PATCH" : "POST",
      body: { ...dependentFormBody(form), relation },
      fallback: ts("couldNotSave"),
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    setSaved(true);
    setDirty(false);
    setTimeout(() => router.push(FAMILY_HREF), 600);
  };

  const remove = async () => {
    setDeleting(true);
    const r = await mutate(`/api/patients/me/dependents/${id}`, { method: "DELETE", fallback: t("deleteFailed") });
    setDeleting(false);
    if (!r.ok) { setConfirmDelete(false); setError(r.error); return; }
    router.push(FAMILY_HREF);
  };

  if (notFound) {
    return (
      <ProfileSubShell title={t("editTitle")} icon={<Users className="w-5 h-5" />} tint="bg-violet-50 text-violet-600" backHref={FAMILY_HREF} backLabel={t("title")}>
        <p className="text-sm text-slate-500">{t("notFound")}</p>
        <Link href={FAMILY_HREF} className="tap-44-y inline-block text-sm font-semibold text-blue-600 hover:underline">{t("backToList")}</Link>
      </ProfileSubShell>
    );
  }

  return (
    <ProfileSubShell
      title={id ? t("editTitle") : t("addTitle")}
      description={id ? undefined : t("addDescription")}
      icon={<Users className="w-5 h-5" />}
      tint="bg-violet-50 text-violet-600"
      backHref={FAMILY_HREF}
      backLabel={t("title")}
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
      footer={id && original && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full flex items-center justify-center gap-2 py-3 mt-3 rounded-2xl bg-white border border-slate-100 shadow-sm text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> {t("delete")}
        </button>
      )}
    >
      <div>
        <label className="input-label">{t("relation")}</label>
        <select className="input-field" value={relation} onChange={(e) => { touch(); setRelation(e.target.value); }}>
          <option value="">{t("relationPlaceholder")}</option>
          {FAMILY_RELATIONS.map((r) => <option key={r} value={r}>{tc(`relation.${r}`)}</option>)}
        </select>
      </div>
      <DependentFields
        form={form}
        onChange={(next) => { touch(); setForm(next); }}
        namePlaceholder={t("namePlaceholder")}
        showLabels
      />

      {confirmDelete && original && (
        <ConfirmDialog
          icon={Trash2}
          title={t("deleteTitle", { name: original.name })}
          message={
            <>
              {t("deleteMessage")}
              {original.vitalsCount > 0 && <> {t("deleteVitals", { count: original.vitalsCount })}</>}
            </>
          }
          confirmLabel={t("deleteConfirm")}
          busyLabel={t("deleting")}
          tone="danger"
          busy={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </ProfileSubShell>
  );
}
