"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import CouponForm, { type CouponData } from "@/components/admin/CouponForm";

export default function EditCouponPage() {
  const { id } = useParams<{ id: string }>();
  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/coupons/${id}`)
      .then(async (r) => {
        if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? "Coupon not found."); return; }
        setCoupon(await r.json());
      })
      .catch(() => setError("Could not load this coupon."));
  }, [id]);

  if (error) {
    return <div className="p-4 sm:p-6 lg:p-8 text-slate-400">{error}</div>;
  }
  if (!coupon) {
    return <div className="p-4 sm:p-6 lg:p-8 flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }
  return <CouponForm coupon={coupon} />;
}
