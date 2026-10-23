"use client";
import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import LoadError from "@/components/LoadError";
import type { Dependent } from "@/components/patient/DependentForm";
import { useLoad } from "@/lib/apiClient";
import { RELATIONS } from "@/lib/relations";

// The family members a patient books for (PatientDependent) — list here, one
// screen each to add (/new) and to edit or delete (/[id]).
export default function FamilyMembersPage() {
  const t = useTranslations("patientAccount.family");
  const tc = useTranslations("booking.common");
  const { data, error, loading, reloading, reload } = useLoad<Dependent[]>("/api/patients/me/dependents", { fallback: t("loadFailed") });
  const members = data ?? [];

  const relationLabel = (r: string) => ((RELATIONS as readonly string[]).includes(r) ? tc(`relation.${r as (typeof RELATIONS)[number]}`) : r);
  const genderLabel = (g: string) => (g === "Male" || g === "Female" || g === "Other" ? tc(`gender.${g}`) : g);
  const summary = (d: Dependent) =>
    [relationLabel(d.relation), d.age != null ? t("age", { age: d.age }) : null, d.gender ? genderLabel(d.gender) : null, d.bloodGroup]
      .filter(Boolean)
      .join(" · ");

  const addButton = (
    <Link href="/patient/profile/family/new" className="btn-primary w-full justify-center py-3.5 text-base mt-5">
      <Plus className="w-4 h-4" /> {t("add")}
    </Link>
  );

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Users className="w-5 h-5" />}
      tint="bg-violet-50 text-violet-600"
      loading={loading}
      footer={!error || data ? addButton : null}
    >
      {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData={!!data} />}
      {!error && members.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-500">{t("empty")}</p>
          <p className="text-xs mt-1">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="-my-2 divide-y divide-slate-100">
          {members.map((d) => (
            <Link key={d.id} href={`/patient/profile/family/${d.id}`} className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-xl hover:bg-slate-50 transition-colors">
              <span className="w-10 h-10 rounded-full bg-violet-50 text-violet-600 font-bold flex items-center justify-center flex-shrink-0">
                {d.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 truncate">{d.name}</span>
                <span className="block text-xs text-slate-500 truncate">{summary(d)}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </ProfileSubShell>
  );
}
