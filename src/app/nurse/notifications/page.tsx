"use client";
import { Bell } from "lucide-react";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function NurseNotificationSettingsPage() {
  return (
    <NurseSubShell title="Notifications" description="Get alerts for new visit requests, patient messages and payments." icon={<Bell className="w-5 h-5" />}>
      <NotificationSettings />
    </NurseSubShell>
  );
}
