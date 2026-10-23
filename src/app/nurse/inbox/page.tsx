"use client";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import NotificationInbox from "@/components/NotificationInbox";

export default function NurseInboxPage() {
  const t = useTranslations("shared.inbox");
  return (
    <NurseSubShell title={t("title")} description={t("subtitle")} icon={<Inbox className="w-5 h-5" />}>
      <NotificationInbox accent="rose" />
    </NurseSubShell>
  );
}
