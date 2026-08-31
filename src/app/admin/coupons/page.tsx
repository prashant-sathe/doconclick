"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TicketPercent, Plus } from "lucide-react";

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  minAmount: number;
  appliesTo: string;
  consultTypes: string | null;
  maxRedemptions: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  redemptionCount: number;
  confirmedCount: number;
  totalDiscountGiven: number;
}

function discountLabel(c: CouponRow): string {
  if (c.discountType === "PERCENT") {
    return `${c.discountValue}% off${c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ""}`;
  }
  return `₹${c.discountValue} off`;
}

const APPLIES_LABEL: Record<string, string> = {
  APPOINTMENT: "Consultations",
  DOCTOR_REGISTRATION: "Doctor reg.",
  DOCTOR_SUBSCRIPTION: "Doctor plan",
};

function appliesLabel(c: CouponRow): string {
  const parts = (c.appliesTo || "APPOINTMENT").split(",").filter(Boolean);
  return parts.map((p) => APPLIES_LABEL[p] ?? p).join(", ");
}

function windowLabel(c: CouponRow): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (c.startsAt && c.expiresAt) return `${fmt(c.startsAt)} – ${fmt(c.expiresAt)}`;
  if (c.expiresAt) return `until ${fmt(c.expiresAt)}`;
  if (c.startsAt) return `from ${fmt(c.startsAt)}`;
  return "no expiry";
}

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/coupons")
      .then((r) => r.json())
      .then((d) => { setCoupons(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Coupons</h1>
          <p className="text-slate-500 text-sm mt-1">
            Discount codes patients can apply at payment. The platform absorbs the discount —
            doctors are always paid their full fee.
          </p>
        </div>
        <Link href="/admin/coupons/new" className="btn-primary py-2.5 px-4">
          <Plus className="w-4 h-4" /> New Coupon
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <TicketPercent className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No coupons yet.
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => (
            <Link
              key={c.id}
              href={`/admin/coupons/${c.id}`}
              className="block bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-slate-200 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-slate-900">{c.code}</span>
                    <span className={c.isActive ? "badge badge-success" : "badge badge-gray"}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {discountLabel(c)}
                    {` · ${appliesLabel(c)}`}
                    {c.minAmount > 0 && ` · min ₹${c.minAmount}`}
                    {c.consultTypes && ` · ${c.consultTypes}`}
                    {" · "}{windowLabel(c)}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400 flex-shrink-0">
                  <div>
                    {c.confirmedCount} used
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                  </div>
                  {c.totalDiscountGiven > 0 && (
                    <div className="text-slate-400">₹{Math.round(c.totalDiscountGiven)} given</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
