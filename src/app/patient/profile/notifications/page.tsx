"use client";
import { useEffect, useState } from "react";
import { Bell, CalendarClock } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";
import { usePatientProfile, patchPatientProfile } from "@/lib/usePatientProfile";
import { APPOINTMENT_REMINDER_LEADS, DEFAULT_REMINDER_LEADS, parseReminderLeads, type ReminderLead } from "@/lib/appointmentReminderLeads";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export default function NotificationSettingsPage() {
  const t = useTranslations("patientAccount.notifications");
  const ts = useTranslations("patientAccount.shell");
  const { profile, loading } = usePatientProfile();
  const [leads, setLeads] = useState<ReminderLead[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const stored = typeof profile.reminderLeadMinutes === "string" ? profile.reminderLeadMinutes : DEFAULT_REMINDER_LEADS;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeads(parseReminderLeads(stored));
  }, [profile]);

  const toggle = (lead: ReminderLead) => {
    setDirty(true);
    setSaved(false);
    setLeads((cur) => (cur.includes(lead) ? cur.filter((l) => l !== lead) : [...cur, lead]));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await patchPatientProfile({ reminderLeadMinutes: leads });
      setSaved(true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : ts("couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Bell className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
      loading={loading}
      saving={saving}
      saved={saved}
      dirty={dirty}
      error={error}
      onSave={save}
    >
      <NotificationSettings />

      {/* When to be reminded before a scheduled visit (src/lib/appointmentReminders.ts). */}
      <section className="border-t border-slate-100 pt-4">
        <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-blue-500" /> {t("remindersTitle")}
        </h2>
        <p className="text-sm text-slate-500 mb-4">{t("remindersHint")}</p>
        <div className="flex flex-wrap gap-2">
          {APPOINTMENT_REMINDER_LEADS.map((lead) => (
            <button
              key={lead}
              type="button"
              aria-pressed={leads.includes(lead)}
              onClick={() => toggle(lead)}
              className={cn("min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                leads.includes(lead) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}
            >
              {t(`lead.${lead}`)}
            </button>
          ))}
        </div>
        {leads.length === 0 && <p className="text-xs text-amber-600 mt-3">{t("remindersOff")}</p>}
      </section>
    </ProfileSubShell>
  );
}
