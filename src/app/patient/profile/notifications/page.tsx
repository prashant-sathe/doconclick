"use client";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function NotificationSettingsPage() {
  return (
    <ProfileSubShell
      title="Notifications"
      description="Get alerts for appointment updates, doctor replies and wallet activity."
    >
      <NotificationSettings />
    </ProfileSubShell>
  );
}
