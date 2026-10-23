"use client";
import LanguageSwitch from "@/components/LanguageSwitch";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import {
  Loader2, CheckCircle2, Circle, ShieldCheck, Clock, XCircle, Ban, Upload, FileText, MapPin,
  LocateFixed, Save, IndianRupee, Landmark, Stethoscope, LogOut, CreditCard, Lock, LifeBuoy, Bell, FileCheck, ChevronRight, CalendarOff, TicketPercent, X,
} from "lucide-react";
import { TimeOffManager } from "@/components/ProviderAway";
import { useAuth } from "@/components/AuthProvider";
import { NurseHeader, NurseMobileNav } from "@/components/nurse/NurseNav";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import { NURSE_QUALIFICATIONS } from "@/lib/nurseConstants";
import { GENDERS } from "@/lib/bookingProfile";
import { nurseChecklist } from "@/lib/nurseChecklist";
import { getCurrentPositionCompat } from "@/lib/platform";
import { prepareUpload, tooBigMessage } from "@/lib/compressImage";
import { parseAvailabilityString } from "@/lib/availability";
import { cn } from "@/lib/utils";
import { formattingLocale } from "@/lib/appLanguage";

type Service = { id: string; name: string; description: string | null; suggestedPrice: number; requiresPrescription: boolean; durationMinutes: number; kind?: string };
type Offering = { serviceId: string; price: number; service: Service };
type NurseProfile = {
  status: string; isVerified: boolean;
  photoUrl: string | null; qualification: string | null; councilRegNo: string | null; councilState: string | null;
  experience: number; gender: string | null; languages: string; bio: string | null; availability: string;
  radius: number; lat: number | null; lng: number | null; address: string | null; bankDetails: string | null;
  councilCertUrl: string | null; degreeCertUrl: string | null; kycDocUrl: string | null; policeVerifUrl: string | null;
  registrationFeePaid: boolean; subscriptionPaidUntil: string | null;
  services: Offering[];
};
type Me = {
  name: string; mobile: string;
  nurseProfile: NurseProfile;
  fees: { registrationFee: number; subscriptionFee: number };
  bookable: boolean;
};

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// Same "Mon, Tue 08:00–20:00" format the doctor's Available Timings page
// writes — structured so bookings can be checked against it.
function parseHours(availability: string | null | undefined) {
  const rows = parseAvailabilityString(availability);
  if (rows.length === 0) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as string[], from: "08:00", to: "20:00" };
  return { days: WEEK.filter((d) => rows.some((r) => r.dayOfWeek === d)) as string[], from: rows[0].fromTime, to: rows[0].toTime };
}

// Labels are message keys (messages/<locale>/nurse.json → profile.docs.<type>, <type>Hint).
const DOCS = [
  { type: "photo", field: "photoUrl" },
  { type: "councilCert", field: "councilCertUrl" },
  { type: "degreeCert", field: "degreeCertUrl" },
  { type: "kyc", field: "kycDocUrl" },
  { type: "policeVerif", field: "policeVerifUrl" },
] as const satisfies readonly { type: string; field: keyof NurseProfile }[];

const STATUS_CARD = {
  PENDING: { icon: Clock, tone: "bg-amber-50 border-amber-200 text-amber-800" },
  APPROVED: { icon: ShieldCheck, tone: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  REJECTED: { icon: XCircle, tone: "bg-red-50 border-red-200 text-red-800" },
  SUSPENDED: { icon: Ban, tone: "bg-red-50 border-red-200 text-red-800" },
} as const satisfies Record<string, { icon: React.ElementType; tone: string }>;
type StatusKey = keyof typeof STATUS_CARD;
// nurseChecklist() item keys (src/lib/nurseChecklist.ts) → profile.checklist.<key>.
const CHECKLIST_KEYS: readonly string[] = ["qualification", "council", "councilCert", "degreeCert", "kyc", "photo", "services", "location", "bank"] satisfies ChecklistKey[];
type ChecklistKey = "qualification" | "council" | "councilCert" | "degreeCert" | "kyc" | "photo" | "services" | "location" | "bank";
const isStatusKey = (s: string): s is StatusKey => s in STATUS_CARD;
const GENDER_KEYS = ["Male", "Female", "Other"] as const;
const isGenderKey = (g: string): g is (typeof GENDER_KEYS)[number] => (GENDER_KEYS as readonly string[]).includes(g);

function Section({ title, icon: Icon, id, children }: { title: string; icon: React.ElementType; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4 scroll-mt-20">
      <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4"><Icon className="w-4 h-4 text-rose-500" />{title}</h2>
      {children}
    </section>
  );
}

function SaveRow({ saving, saved, error, onSave }: { saving: boolean; saved: boolean; error: string; onSave: () => void }) {
  const t = useTranslations("nurse.profile.save");
  const tc = useTranslations("nurse.common");
  return (
    <div className="flex items-center gap-3 mt-4">
      <button type="button" onClick={onSave} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {tc("saving")}</> : <><Save className="w-4 h-4" /> {t("save")}</>}
      </button>
      {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {t("saved")}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

// One save-state per section, so saving services doesn't flash "Saved" on the bank card.
function useSaver() {
  const t = useTranslations("nurse.profile.save");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<Response>, onOk?: (data: unknown) => void) => {
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? t("failed")); return; }
      setSaved(true);
      onOk?.(data);
    } catch {
      setError(t("networkError"));
    } finally {
      setSaving(false);
    }
  };
  return { saving, saved, error, run };
}

function NurseProfileContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("nurse.profile");
  const tc = useTranslations("nurse.common");
  const locale = formattingLocale(useLocale());
  const [me, setMe] = useState<Me | null>(null);
  const [catalogue, setCatalogue] = useState<Service[]>([]);
  const [loadError, setLoadError] = useState("");

  const [details, setDetails] = useState({ qualification: "", councilRegNo: "", councilState: "", experience: "0", gender: "", languages: "", bio: "" });
  const [hours, setHours] = useState(parseHours(null));
  const [picked, setPicked] = useState<Record<string, string>>({}); // serviceId -> price
  const [loc, setLoc] = useState({ address: "", lat: null as number | null, lng: null as number | null, radius: 10 });
  const [bank, setBank] = useState({ bankName: "", bankAccount: "", ifsc: "" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [docError, setDocError] = useState("");
  const [locating, setLocating] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [payError, setPayError] = useState("");
  // A coupon previewed for the fee due now (registration first, then the
  // plan) — the fee-order route re-checks and reserves it at checkout.
  const [coupon, setCoupon] = useState<{ kind: "REGISTRATION" | "SUBSCRIPTION"; code: string; discountAmount: number; netAmount: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");

  const detailsSaver = useSaver();
  const servicesSaver = useSaver();
  const locSaver = useSaver();
  const bankSaver = useSaver();

  const load = useCallback(async () => {
    const [meRes, svcRes] = await Promise.all([fetch("/api/nurses/me"), fetch("/api/nurse-services")]);
    if (!meRes.ok) { setLoadError((await meRes.json().catch(() => ({}))).error ?? t("loadFailed")); return; }
    const data: Me = await meRes.json();
    setMe(data);
    setCatalogue(svcRes.ok ? await svcRes.json() : []);
    return data;
  }, [t]);

  // Form state is hydrated once per account (not on every reload of `me`),
  // so a background refresh never wipes unsaved edits.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!user || user.role !== "NURSE" || hydratedFor === user.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then((data) => {
      if (!data) return;
      const p = data.nurseProfile;
      setDetails({
        qualification: p.qualification ?? "", councilRegNo: p.councilRegNo ?? "", councilState: p.councilState ?? "",
        experience: String(p.experience ?? 0), gender: p.gender ?? "", languages: p.languages ?? "", bio: p.bio ?? "",
      });
      setHours(parseHours(p.availability));
      setPicked(Object.fromEntries(p.services.map((o) => [o.serviceId, String(o.price)])));
      setLoc({ address: p.address ?? "", lat: p.lat, lng: p.lng, radius: p.radius });
      // Same "Bank | Account | IFSC: X" format as the doctor's Bank Details page.
      if (p.bankDetails) {
        const [bankName, bankAccount, ifscPart] = p.bankDetails.split(" | ");
        setBank({ bankName: bankName ?? "", bankAccount: bankAccount ?? "", ifsc: (ifscPart ?? "").replace("IFSC: ", "") });
      }
      setHydratedFor(user.id);
    });
  }, [user, hydratedFor, load]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/nurse/profile");
  }, [authLoading, user, router]);

  if (authLoading || !user || (!me && !loadError)) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-rose-500" /></div>;
  }
  if (!me) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center p-6 text-center text-slate-500">{loadError}</div>;
  }

  const p = me.nurseProfile;
  const locked = p.isVerified;
  const checklist = nurseChecklist({ ...p, serviceCount: p.services.length });
  const statusKey: StatusKey = isStatusKey(p.status) ? p.status : "PENDING";
  const status = STATUS_CARD[statusKey];
  const StatusIcon = status.icon;
  const subActive = !!p.subscriptionPaidUntil && new Date(p.subscriptionPaidUntil).getTime() > now;
  const needsRegFee = me.fees.registrationFee > 0 && !p.registrationFeePaid;
  const needsSub = me.fees.subscriptionFee > 0 && !subActive;
  // The fee a coupon would go on: registration until it's paid, then the plan.
  const couponKind: "REGISTRATION" | "SUBSCRIPTION" | null = needsRegFee ? "REGISTRATION" : me.fees.subscriptionFee > 0 ? "SUBSCRIPTION" : null;
  const activeCoupon = coupon && coupon.kind === couponKind ? coupon : null;
  const feeLabel = (kind: "REGISTRATION" | "SUBSCRIPTION", fee: number) =>
    activeCoupon?.kind === kind ? `₹${activeCoupon.netAmount}` : `₹${fee}`;

  const saveDetails = () => {
    if (hours.days.length === 0) {
      return detailsSaver.run(async () => new Response(JSON.stringify({ error: t("details.pickDay") }), { status: 400 }));
    }
    if (hours.from === hours.to) {
      return detailsSaver.run(async () => new Response(JSON.stringify({ error: t("details.sameTime") }), { status: 400 }));
    }
    return detailsSaver.run(() => fetch("/api/nurses/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...details,
        experience: Number(details.experience) || 0,
        availability: `${hours.days.join(", ")} ${hours.from}–${hours.to}`,
      }),
    }), () => load());
  };

  const saveServices = () => {
    const services = Object.entries(picked).map(([serviceId, price]) => ({ serviceId, price: Number(price) }));
    return servicesSaver.run(() => fetch("/api/nurses/me/services", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ services }),
    }), () => load());
  };

  const saveLocation = () => {
    if (loc.lat == null || loc.lng == null) {
      return locSaver.run(async () => new Response(JSON.stringify({ error: t("area.pickAddress") }), { status: 400 }));
    }
    return locSaver.run(() => fetch("/api/nurses/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: loc.address, lat: loc.lat, lng: loc.lng, radius: loc.radius }),
    }), () => load());
  };

  const saveBank = () => bankSaver.run(() => fetch("/api/nurses/me", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bankDetails: bank.bankName || bank.bankAccount || bank.ifsc
        ? `${bank.bankName} | ${bank.bankAccount} | IFSC: ${bank.ifsc}`
        : null,
    }),
  }), () => load());

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true, timeout: 10000 });
      const { latitude, longitude } = pos.coords;
      // Turn the GPS fix into a real address so the admin (and the nurse) can
      // see where the base actually is — not just "Current location".
      const geo = await fetch(`/api/geocode/reverse?lat=${latitude}&lon=${longitude}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setLoc((l) => ({ ...l, lat: latitude, lng: longitude, address: geo?.label || l.address || "Current location" }));
    } catch {
      setDocError(t("area.locationFailed"));
    } finally {
      setLocating(false);
    }
  };

  const upload = async (type: string, original: File) => {
    setUploading(type); setDocError("");
    const file = await prepareUpload(original).catch(() => null);
    if (!file) { setUploading(null); setDocError(t("docs.readFailed")); return; }
    const tooBig = tooBigMessage(file);
    if (tooBig) { setUploading(null); setDocError(tooBig); return; }
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", file);
    const res = await fetch("/api/nurses/me/documents", { method: "POST", body: fd });
    setUploading(null);
    if (!res.ok) { setDocError((await res.json().catch(() => ({}))).error ?? t("docs.uploadFailed")); return; }
    load();
  };

  const applyCoupon = async (kind: "REGISTRATION" | "SUBSCRIPTION") => {
    if (!couponInput.trim()) return;
    setApplyingCoupon(true); setCouponError("");
    const res = await fetch("/api/coupons/validate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput.trim(), context: kind === "REGISTRATION" ? "NURSE_REGISTRATION" : "NURSE_SUBSCRIPTION" }),
    });
    const data = await res.json().catch(() => ({}));
    setApplyingCoupon(false);
    if (!res.ok) { setCouponError(data.error ?? t("fees.couponFailed")); return; }
    setCoupon({ kind, code: data.code, discountAmount: data.discountAmount, netAmount: data.netAmount });
    setCouponInput("");
  };

  const pay = async (kind: "REGISTRATION" | "SUBSCRIPTION") => {
    setPaying(kind); setPayError("");
    const code = coupon?.kind === kind ? coupon.code : undefined;
    const res = await fetch("/api/nurses/fee-order", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setPaying(null); setPayError(data.error ?? t("fees.startFailed")); return; }
    const { load: loadCashfree } = await import("@cashfreepayments/cashfree-js");
    // Hardcoded like the doctor/patient checkout (NEXT_PUBLIC_ vars are baked in at build time).
    const cashfree = await loadCashfree({ mode: "production" });
    cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: "_self" });
  };

  const togglePick = (s: Service) => {
    setPicked((cur) => {
      const next = { ...cur };
      if (s.id in next) delete next[s.id];
      else next[s.id] = String(s.suggestedPrice || "");
      return next;
    });
  };

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <NurseHeader />
      <NurseMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500">{me.name} · {me.mobile}</p>
        </div>

        {searchParams.get("payment") === "done" && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 text-blue-800 px-4 py-3 text-sm mb-4">
            {t("paymentSubmitted")}
          </div>
        )}

        {/* Status + checklist */}
        <div className={cn("rounded-2xl border px-4 py-4 mb-4", status.tone)}>
          <p className="font-bold flex items-center gap-2"><StatusIcon className="w-5 h-5" />{t(`status.${statusKey}.title`)}</p>
          <p className="text-sm mt-1 opacity-90">{t(`status.${statusKey}.body`)}</p>
          {p.status === "APPROVED" && !me.bookable && (
            <p className="text-sm mt-2 font-semibold">{t("cantBookUntilFee")}</p>
          )}
        </div>

        {!checklist.complete && (
          <Section title={t("checklistTitle", { done: checklist.doneCount, total: checklist.items.length })} icon={CheckCircle2}>
            <ul className="space-y-2">
              {checklist.items.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-sm">
                  {i.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-slate-300" />}
                  <span className={i.done ? "text-slate-400 line-through" : "text-slate-700"}>{CHECKLIST_KEYS.includes(i.key) ? t(`checklist.${i.key as ChecklistKey}`) : i.label}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(needsRegFee || needsSub || (me.fees.subscriptionFee > 0 && subActive)) && (
          <Section title={t("fees.title")} icon={CreditCard}>
            {needsRegFee && (
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t("fees.registration")}</p>
                  <p className="text-xs text-slate-500">
                    {activeCoupon?.kind === "REGISTRATION" && <span className="line-through mr-1.5">₹{me.fees.registrationFee}</span>}
                    {feeLabel("REGISTRATION", me.fees.registrationFee)}
                  </p>
                </div>
                <button onClick={() => pay("REGISTRATION")} disabled={!!paying} className="btn-primary py-2 px-4 text-sm">
                  {paying === "REGISTRATION" ? <Loader2 className="w-4 h-4 animate-spin" /> : t("fees.pay", { amount: activeCoupon?.kind === "REGISTRATION" ? activeCoupon.netAmount : me.fees.registrationFee })}
                </button>
              </div>
            )}
            {me.fees.subscriptionFee > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t("fees.subscription")}</p>
                  <p className="text-xs text-slate-500">
                    {activeCoupon?.kind === "SUBSCRIPTION" && <span className="line-through mr-1.5">₹{me.fees.subscriptionFee}</span>}
                    {activeCoupon?.kind === "SUBSCRIPTION" ? t("fees.firstMonth", { amount: activeCoupon.netAmount }) : t("fees.perMonth", { amount: me.fees.subscriptionFee })} ·{" "}
                    {subActive ? t("fees.activeUntil", { date: new Date(p.subscriptionPaidUntil!).toLocaleDateString(locale, { timeZone: "Asia/Kolkata" }) }) : t("fees.notActive")}
                  </p>
                </div>
                <button onClick={() => pay("SUBSCRIPTION")} disabled={!!paying || needsRegFee} className="btn-secondary py-2 px-4 text-sm">
                  {paying === "SUBSCRIPTION" ? <Loader2 className="w-4 h-4 animate-spin" /> : subActive && !activeCoupon ? t("fees.renew") : t("fees.pay", { amount: activeCoupon?.kind === "SUBSCRIPTION" ? activeCoupon.netAmount : me.fees.subscriptionFee })}
                </button>
              </div>
            )}
            {couponKind && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                {activeCoupon ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <TicketPercent className="w-4 h-4" /> {t("fees.couponOff", { code: activeCoupon.code, amount: activeCoupon.discountAmount })}
                    </span>
                    <button onClick={() => setCoupon(null)} className="text-emerald-700 hover:text-emerald-900" aria-label={t("fees.removeCoupon")}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1 uppercase"
                      placeholder={t(couponKind === "REGISTRATION" ? "fees.couponForRegistration" : "fees.couponForSubscription")}
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(couponKind); }}
                    />
                    <button onClick={() => applyCoupon(couponKind)} disabled={applyingCoupon || !couponInput.trim()} className="btn-secondary px-4 disabled:opacity-60">
                      {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : t("fees.apply")}
                    </button>
                  </div>
                )}
                {couponError && <p className="text-xs text-red-500 mt-1.5">{couponError}</p>}
              </div>
            )}
            {payError && <p className="text-sm text-red-600 mt-3">{payError}</p>}
          </Section>
        )}

        <Section title={t("details.title")} icon={Stethoscope}>
          {locked && <p className="text-xs text-slate-500 mb-3">{t("details.locked")}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="input-label">{t("details.qualification")}</label>
              <select disabled={locked} className="input-field" value={details.qualification} onChange={(e) => setDetails({ ...details, qualification: e.target.value })}>
                <option value="">{t("details.select")}</option>
                {NURSE_QUALIFICATIONS.map((q) => <option key={q}>{q}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">{t("details.councilRegNo")}</label>
              <input disabled={locked} className="input-field uppercase" placeholder={t("details.councilRegNoPlaceholder")} value={details.councilRegNo} onChange={(e) => setDetails({ ...details, councilRegNo: e.target.value })} />
            </div>
            <div>
              <label className="input-label">{t("details.councilState")}</label>
              <input disabled={locked} className="input-field" placeholder={t("details.councilStatePlaceholder")} value={details.councilState} onChange={(e) => setDetails({ ...details, councilState: e.target.value })} />
            </div>
            <div>
              <label className="input-label">{t("details.experience")}</label>
              <input type="number" min={0} max={60} inputMode="numeric" className="input-field" value={details.experience} onChange={(e) => setDetails({ ...details, experience: e.target.value })} />
            </div>
            <div>
              <label className="input-label">{t("details.gender")}</label>
              <select className="input-field" value={details.gender} onChange={(e) => setDetails({ ...details, gender: e.target.value })}>
                <option value="">{t("details.select")}</option>
                {GENDERS.map((g) => <option key={g} value={g}>{isGenderKey(g) ? tc(`gender.${g}`) : g}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">{t("details.languages")}</label>
              <input className="input-field" placeholder={t("details.languagesPlaceholder")} value={details.languages} onChange={(e) => setDetails({ ...details, languages: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="input-label">{t("details.hours")}</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {WEEK.map((d) => (
                  <button key={d} type="button"
                    onClick={() => setHours((h) => ({ ...h, days: h.days.includes(d) ? h.days.filter((x) => x !== d) : WEEK.filter((w) => w === d || h.days.includes(w)) }))}
                    className={cn("px-3 py-2 rounded-xl text-xs font-bold border", hours.days.includes(d) ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-600 border-slate-200")}>
                    {tc(`days.${d}`)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">{t("details.from")}</label>
                  <input type="time" className="input-field" value={hours.from} onChange={(e) => setHours((h) => ({ ...h, from: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">{t("details.to")}</label>
                  <input type="time" className="input-field" value={hours.to} onChange={(e) => setHours((h) => ({ ...h, to: e.target.value }))} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{t("details.hoursHint")}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="input-label">{t("details.about")}</label>
              <textarea rows={3} className="input-field" placeholder={t("details.aboutPlaceholder")} value={details.bio} onChange={(e) => setDetails({ ...details, bio: e.target.value })} />
            </div>
          </div>
          <SaveRow {...detailsSaver} onSave={saveDetails} />
        </Section>

        <Section title={t("docs.title")} icon={FileText}>
          <div className="space-y-3">
            {DOCS.map((d) => {
              const url = p[d.field] as string | null;
              const docLocked = locked && d.type !== "photo";
              return (
                <div key={d.type} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      {url ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                      {t(`docs.${d.type}`)}
                    </p>
                    <p className="text-xs text-slate-400">{t(`docs.${d.type}Hint`)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">{t("docs.view")}</a>}
                    {!docLocked && (
                      <label className={cn("btn-secondary py-1.5 px-3 text-xs cursor-pointer", uploading && "opacity-60 pointer-events-none")}>
                        {uploading === d.type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {url ? t("docs.replace") : t("docs.upload")}
                        <input
                          type="file"
                          className="hidden"
                          accept={d.type === "photo" ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(d.type, f); }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {docError && <p className="text-sm text-red-600 mt-3">{docError}</p>}
        </Section>

        <Section title={t("services.title")} icon={IndianRupee}>
          <p className="text-xs text-slate-500 mb-3">{t("services.hint")}</p>
          <div className="space-y-2">
            {catalogue.map((s) => {
              const on = s.id in picked;
              return (
                <div key={s.id} className={cn("rounded-xl border px-3 py-2.5 flex items-center gap-3", on ? "border-rose-200 bg-rose-50/40" : "border-slate-100")}>
                  <input type="checkbox" checked={on} onChange={() => togglePick(s)} className="w-4 h-4 accent-rose-500 flex-shrink-0" aria-label={s.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">
                      {s.kind === "SHIFT" ? t("services.shift", { hours: Math.round(s.durationMinutes / 60) }) : t("services.minutes", { minutes: s.durationMinutes })}{s.requiresPrescription ? ` · ${t("services.needsRx")}` : ""}
                    </p>
                  </div>
                  {on && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm text-slate-500">₹</span>
                      <input
                        type="number" min={1} inputMode="numeric"
                        className="input-field py-1.5 w-24 text-sm"
                        value={picked[s.id]}
                        onChange={(e) => setPicked({ ...picked, [s.id]: e.target.value })}
                        aria-label={t("services.priceLabel", { name: s.name })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <SaveRow {...servicesSaver} onSave={saveServices} />
        </Section>

        <Section title={t("area.title")} icon={MapPin}>
          <label className="input-label">{t("area.baseAddress")}</label>
          <AddressAutocomplete
            value={loc.address}
            onChange={(v) => setLoc((l) => ({ ...l, address: v }))}
            onSelect={(s) => setLoc((l) => ({ ...l, address: s.label, lat: s.lat, lng: s.lon }))}
            placeholder={t("area.placeholder")}
          />
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="mt-2 text-sm font-semibold text-blue-600 flex items-center gap-1.5">
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} {t("area.useCurrent")}
          </button>
          {loc.lat != null && loc.lng != null && (
            <p className="text-xs text-emerald-600 mt-1">{t("area.locationSet", { lat: loc.lat.toFixed(4), lng: loc.lng.toFixed(4) })}</p>
          )}
          <div className="mt-4">
            <label className="input-label">{t.rich("area.travelUpTo", { km: loc.radius, b: (c) => <strong>{c}</strong> })}</label>
            <input type="range" min={1} max={30} value={loc.radius} onChange={(e) => setLoc((l) => ({ ...l, radius: Number(e.target.value) }))} className="w-full accent-rose-500" />
          </div>
          <SaveRow {...locSaver} onSave={saveLocation} />
        </Section>

        <LanguageSwitch />

        {/* Linked from the dashboard's online/offline card (#time-off). */}
        <Section title={t("timeOff")} icon={CalendarOff} id="time-off">
          <TimeOffManager />
        </Section>

        {/* Linked from Earnings when a payout needs bank details (#bank). */}
        <Section title={t("bank.title")} icon={Landmark} id="bank">
          <p className="text-xs text-slate-500 mb-3">{t("bank.hint")}</p>
          <div className="space-y-4">
            <div>
              <label className="input-label">{t("bank.bankName")}</label>
              <input className="input-field" placeholder="HDFC Bank" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
            </div>
            <div>
              <label className="input-label">{t("bank.account")}</label>
              <input className="input-field" inputMode="numeric" placeholder="XXXX XXXX XXXX" value={bank.bankAccount} onChange={(e) => setBank({ ...bank, bankAccount: e.target.value })} />
            </div>
            <div>
              <label className="input-label">{t("bank.ifsc")}</label>
              <input className="input-field uppercase" placeholder="HDFC0001234" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <SaveRow {...bankSaver} onSave={saveBank} />
        </Section>

        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">{t("account.heading")}</p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50 mb-4">
          {[
            { href: "/nurse/security", label: t("account.security"), icon: Lock },
            { href: "/nurse/notifications", label: t("account.notifications"), icon: Bell },
            { href: "/nurse/support", label: t("account.support"), icon: LifeBuoy },
            { href: "/nurse/terms", label: t("account.terms"), icon: FileCheck },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
              <span className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
              <span className="text-sm font-semibold text-slate-800 flex-1">{label}</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </Link>
          ))}
        </div>

        <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-slate-100 shadow-sm text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
          <LogOut className="w-4 h-4" /> {t("signOut")}
        </button>
      </div>
    </div>
  );
}

export default function NurseProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen gradient-surface" />}>
      <NurseProfileContent />
    </Suspense>
  );
}
