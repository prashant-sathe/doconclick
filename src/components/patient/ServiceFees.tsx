import { Building2, Home, Video } from "lucide-react";
import { useTranslations } from "next-intl";

// One chip per service the doctor has switched on, each with its own fee — so
// a doctor who turned video off just shows clinic / home visit charges.
export default function ServiceFees({
  offersClinic,
  offersVideo,
  offersHomeVisit,
  consultFee,
  videoFee,
  homeVisitFee,
}: {
  offersClinic: boolean;
  offersVideo: boolean;
  offersHomeVisit: boolean;
  consultFee: number;
  videoFee: number;
  homeVisitFee: number;
}) {
  const t = useTranslations("patient.dashboard");
  const items = ([
    offersClinic && { key: "clinic", Icon: Building2, label: t("feeClinic"), fee: consultFee, cls: "text-slate-700 bg-slate-100" },
    offersVideo && { key: "video", Icon: Video, label: t("feeVideo"), fee: videoFee, cls: "text-blue-700 bg-blue-50" },
    offersHomeVisit && { key: "home", Icon: Home, label: t("feeHome"), fee: homeVisitFee, cls: "text-emerald-700 bg-emerald-50" },
  ] as const).filter((x) => x !== false);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map(({ key, Icon, label, fee, cls }) => (
        <span key={key} className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${cls}`}>
          <Icon className="w-3 h-3" /> {label} · ₹{fee}
        </span>
      ))}
    </div>
  );
}
