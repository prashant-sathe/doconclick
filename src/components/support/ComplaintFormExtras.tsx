"use client";
import { useLocale, useTranslations } from "next-intl";
import { useLoad } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";

interface LinkableAppointment {
  id: string;
  scheduledAt: string;
  withName: string;
}

// The optional parts of the new-ticket form: which booking it's about (the
// user's own recent ones only — the server re-checks) and a callback number.
export default function ComplaintFormExtras({
  appointmentId, onAppointmentId, contactMobile, onContactMobile,
}: {
  appointmentId: string;
  onAppointmentId: (v: string) => void;
  contactMobile: string;
  onContactMobile: (v: string) => void;
}) {
  const t = useTranslations("shared.complaints");
  const locale = formattingLocale(useLocale());
  const { data } = useLoad<LinkableAppointment[]>("/api/complaints/appointments");
  const appointments = data ?? [];
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Kolkata" });

  return (
    <>
      {appointments.length > 0 && (
        <>
          <label className="input-label" htmlFor="complaint-booking">{t("linkLabel")}</label>
          <select
            id="complaint-booking"
            className="input-field mb-3"
            value={appointmentId}
            onChange={(e) => onAppointmentId(e.target.value)}
          >
            <option value="">{t("linkNone")}</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>{t("linkOption", { name: a.withName, date: when(a.scheduledAt) })}</option>
            ))}
          </select>
        </>
      )}
      <label className="input-label" htmlFor="complaint-contact">{t("contactLabel")}</label>
      <input
        id="complaint-contact"
        type="tel"
        inputMode="tel"
        className="input-field mb-4"
        placeholder={t("contactPlaceholder")}
        value={contactMobile}
        onChange={(e) => onContactMobile(e.target.value)}
        maxLength={16}
      />
    </>
  );
}
