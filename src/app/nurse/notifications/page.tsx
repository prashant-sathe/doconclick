"use client";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function NurseNotificationSettingsPage() {
  const t = useTranslations("nurse.notifications");
  return (
    <NurseSubShell title={t("title")} description={t("description")} icon={<Bell className="w-5 h-5" />}>
      <NotificationSettings />
    </NurseSubShell>
  );
}
