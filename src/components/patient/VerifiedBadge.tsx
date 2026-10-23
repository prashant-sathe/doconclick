import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";

export default function VerifiedBadge({ className = "" }: { className?: string }) {
  const t = useTranslations("patient.badges");
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 ${className}`}>
      <BadgeCheck className="w-3.5 h-3.5 fill-emerald-100 text-emerald-600" />
      {t("verified")}
    </span>
  );
}
