"use client";
import { Bell } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import NotificationSettings from "@/components/NotificationSettings";

export default function DoctorNotificationSettingsPage() {
  return (
    <DoctorProfileSubShell
      title="Notifications"
      description="Get alerts for new appointment requests, patient messages and payments."
      icon={<Bell className="w-5 h-5" />}
      tint="bg-amber-50 text-amber-500"
    >
      <NotificationSettings />
    </DoctorProfileSubShell>
  );
}
