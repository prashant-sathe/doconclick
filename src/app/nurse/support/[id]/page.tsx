"use client";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { LifeBuoy } from "lucide-react";
import NurseSubShell from "@/components/nurse/NurseSubShell";
import ComplaintThread from "@/components/support/ComplaintThread";

export default function NurseSupportTicketPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("nurse.support");
  return (
    <NurseSubShell title={t("title")} icon={<LifeBuoy className="w-5 h-5" />}>
      <ComplaintThread id={id} backHref="/nurse/support" accent="rose" />
    </NurseSubShell>
  );
}
