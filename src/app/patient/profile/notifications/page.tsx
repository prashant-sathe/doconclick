"use client";
import { Bell } from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function NotificationSettingsPage() {
  return (
    <ProfileSubShell
      title="Notifications"
      description="Get alerts for appointment updates, doctor replies and wallet activity."
      icon={<Bell className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
    >
      <NotificationSettings />
    </ProfileSubShell>
  );
}
