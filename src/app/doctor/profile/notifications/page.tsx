"use client";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function DoctorNotificationSettingsPage() {
  return (
    <DoctorProfileSubShell
      title="Notifications"
      description="Get alerts for new appointment requests, patient messages and payments."
    >
      <NotificationSettings />
    </DoctorProfileSubShell>
  );
}
