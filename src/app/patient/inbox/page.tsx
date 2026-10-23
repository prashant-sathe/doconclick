"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import NotificationInbox from "@/components/NotificationInbox";

export default function PatientInboxPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations("shared.inbox");

  useEffect(() => {
    if (!loading && (!user || user.role !== "PATIENT")) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "PATIENT") {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Inbox className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
            <p className="text-slate-500 text-sm">{t("subtitle")}</p>
          </div>
        </div>
        <NotificationInbox accent="blue" />
      </div>
    </div>
  );
}
