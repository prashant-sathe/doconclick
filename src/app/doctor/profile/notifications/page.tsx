"use client";
import { Bell } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";
import { useTranslations } from "next-intl";

export default function DoctorNotificationSettingsPage() {
  const t = useTranslations("doctorAccount.notifications");
  return (
    <DoctorProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Bell className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
    >
      <NotificationSettings />
    </DoctorProfileSubShell>
  );
}
