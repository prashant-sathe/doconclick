"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Trash2, AlertCircle } from "lucide-react";

const CONSULT_TYPES = ["CLINIC", "VIDEO", "HOME"] as const;
const APPLIES_TO = [
  { value: "APPOINTMENT", label: "Consultations" },
  { value: "DOCTOR_REGISTRATION", label: "Doctor registration" },
  { value: "DOCTOR_SUBSCRIPTION", label: "Doctor plan" },
] as const;

export interface CouponData {
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
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  redemptionCount?: number;
}

// A stored ISO datetime → the value shape <input type="datetime-local"> wants.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CouponForm({ coupon }: { coupon?: CouponData }) {
  const router = useRouter();
  const isEdit = !!coupon;

  const [code, setCode] = useState(coupon?.code ?? "");
  const [description, setDescription] = useState(coupon?.description ?? "");
  const [discountType, setDiscountType] = useState(coupon?.discountType ?? "PERCENT");
  const [discountValue, setDiscountValue] = useState(coupon ? String(coupon.discountValue) : "");
  const [maxDiscount, setMaxDiscount] = useState(coupon?.maxDiscount != null ? String(coupon.maxDiscount) : "");
  const [minAmount, setMinAmount] = useState(coupon?.minAmount ? String(coupon.minAmount) : "");
  const [appliesTo, setAppliesTo] = useState<string[]>(
    coupon?.appliesTo ? coupon.appliesTo.split(",").filter(Boolean) : ["APPOINTMENT"],
  );
  const [consultTypes, setConsultTypes] = useState<string[]>(
    coupon?.consultTypes ? coupon.consultTypes.split(",").filter(Boolean) : [],
  );
  const [maxRedemptions, setMaxRedemptions] = useState(
    coupon?.maxRedemptions != null ? String(coupon.maxRedemptions) : "",
  );
  const [perUserLimit, setPerUserLimit] = useState(coupon ? String(coupon.perUserLimit) : "1");
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(coupon?.expiresAt ?? null));
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const toggleType = (t: string) =>
    setConsultTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleApplies = (t: string) =>
    setAppliesTo((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const appliesToAppointments = appliesTo.includes("APPOINTMENT");

  const save = async () => {
    setSaving(true);
    setError("");
    const payload = {
      code,
      description: description.trim() || null,
      discountType,
      discountValue: Number(discountValue),
      maxDiscount: discountType === "PERCENT" && maxDiscount ? Number(maxDiscount) : null,
      minAmount: minAmount ? Number(minAmount) : 0,
      appliesTo: (appliesTo.length ? appliesTo : ["APPOINTMENT"]).join(","),
      consultTypes: appliesToAppointments ? consultTypes.join(",") : "",
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      perUserLimit: Number(perUserLimit),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      isActive,
    };
    const res = await fetch(isEdit ? `/api/admin/coupons/${coupon.id}` : "/api/admin/coupons", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      router.push("/admin/coupons");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not save the coupon.");
    }
  };

  const remove = async () => {
    if (!coupon) return;
    if (!confirm(`Delete coupon ${coupon.code}? This can't be undone.`)) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/admin/coupons/${coupon.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/admin/coupons");
      router.refresh();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not delete the coupon.");
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/admin/coupons" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Coupons
      </Link>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">
        {isEdit ? `Edit ${coupon.code}` : "New Coupon"}
      </h1>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className="input-label">Code</label>
          <input
            className="input-field font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="DIWALI20"
          />
          <p className="text-xs text-slate-400 mt-1">3–24 letters, digits, dashes or underscores.</p>
        </div>

        <div>
          <label className="input-label">Description (optional, shown to patients)</label>
          <input
            className="input-field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Diwali festive discount"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Discount type</label>
            <div className="flex gap-2">
              {["PERCENT", "FLAT"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDiscountType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    discountType === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t === "PERCENT" ? "% off" : "₹ off"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="input-label">{discountType === "PERCENT" ? "Percent" : "Amount (₹)"}</label>
            <input
              className="input-field"
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "PERCENT" ? "20" : "100"}
            />
          </div>
        </div>

        {discountType === "PERCENT" && (
          <div>
            <label className="input-label">Max discount (₹, optional cap)</label>
            <input
              className="input-field"
              type="number"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              placeholder="No cap"
            />
          </div>
        )}

        <div>
          <label className="input-label">Minimum amount (₹, optional)</label>
          <input
            className="input-field"
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className="input-label">Applies to</label>
          <div className="flex gap-2">
            {APPLIES_TO.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleApplies(o.value)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  appliesTo.includes(o.value)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Pick at least one. Defaults to consultations.</p>
        </div>

        {appliesToAppointments && (
          <div>
            <label className="input-label">Consultation types</label>
            <div className="flex gap-2">
              {CONSULT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    consultTypes.includes(t)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {t[0] + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">Leave all off to allow every consultation type.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Total uses (optional)</label>
            <input
              className="input-field"
              type="number"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <label className="input-label">Uses per patient</label>
            <input
              className="input-field"
              type="number"
              value={perUserLimit}
              onChange={(e) => setPerUserLimit(e.target.value)}
              placeholder="1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="input-label">Starts (optional)</label>
            <input
              className="input-field"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">Expires (optional)</label>
            <input
              className="input-field"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm font-medium text-slate-700">Active</span>
        </label>

        {error && (
          <span className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </span>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving} className="btn-primary flex-1 py-2.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create coupon"}
          </button>
          {isEdit && (
            <button
              onClick={remove}
              disabled={deleting}
              className="btn-secondary px-3 text-rose-600 hover:bg-rose-50"
              title="Delete coupon"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
        {isEdit && (coupon.redemptionCount ?? 0) > 0 && (
          <p className="text-xs text-slate-400">
            Used {coupon.redemptionCount} time(s) — to stop it, turn off “Active”. It can only be
            deleted while unused.
          </p>
        )}
      </div>
    </div>
  );
}
