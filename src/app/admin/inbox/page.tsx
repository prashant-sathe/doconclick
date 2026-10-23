"use client";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import NotificationInbox from "@/components/NotificationInbox";

export default function AdminInboxPage() {
  const t = useTranslations("shared.inbox");
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><Inbox className="w-5 h-5" /></span>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{t("subtitle")}</p>
        </div>
      </div>
      <NotificationInbox accent="blue" />
    </div>
  );
}
