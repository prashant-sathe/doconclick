"use client";
import { Bell } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";
import { useTranslations } from "next-intl";

export default function NotificationSettingsPage() {
  const t = useTranslations("patientAccount.notifications");
  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<Bell className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
    >
      <NotificationSettings />
    </ProfileSubShell>
  );
}
