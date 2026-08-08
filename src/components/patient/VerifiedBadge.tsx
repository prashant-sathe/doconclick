import { BadgeCheck } from "lucide-react";

export default function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 ${className}`}>
      <BadgeCheck className="w-3.5 h-3.5 fill-emerald-100 text-emerald-600" />
      Verified
    </span>
  );
}
