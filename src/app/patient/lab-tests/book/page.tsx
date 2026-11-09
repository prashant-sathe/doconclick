"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Loader2, Wallet, CreditCard, ArrowLeft, CheckCircle2, AlertCircle, MapPin, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import WalletTopUpModal from "@/components/patient/WalletTopUpModal";
import LoadError from "@/components/LoadError";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";
import { cn } from "@/lib/utils";
import { PIN_CODE, collectionDayLabel, collectionDays, labPin, openSlots, slotLabel } from "@/lib/labShare";
import { getCurrentPositionCompat } from "@/lib/platform";

// Leaflet touches window — load the map on the client only.
const LocationPickerMap = dynamic(() => import("@/components/LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-[260px] rounded-2xl" />,
});

interface Quote {
  appointmentId: string;
  patientName: string;
  tests: { id: string; name: string; instructions: string | null; labTest: { id: string; name: string; price: number } | null }[];
  openBooking: { id: string; status: string } | null;
  walletBalance: number;
  defaultAddress: string;
  defaultPinCode: string;
  mapCenter: { lat: number; lng: number } | null;
}

function BookLabTests() {
  const t = useTranslations("patient.labTests.book");
  const locale = formattingLocale(useLocale());
  const router = useRouter();
  const toast = useToast();
  const appointmentId = useSearchParams().get("appointmentId");
  const { data, error, reload, reloading } = useLoad<Quote>(appointmentId ? `/api/lab-bookings/quote?appointmentId=${encodeURIComponent(appointmentId)}` : null);

  const bookable = useMemo(() => {
    // One row per catalogue test, even if the doctor wrote it twice.
    const seen = new Set<string>();
    return (data?.tests ?? []).flatMap((r) => (r.labTest && !seen.has(r.labTest.id) && seen.add(r.labTest.id) ? [{ ...r.labTest, instructions: r.instructions }] : []));
  }, [data]);
  const notBookable = (data?.tests ?? []).filter((r) => !r.labTest);

  // null = untouched: everything bookable ticked, the profile address, and
  // the wallet preselected when it already covers the lot.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [pinCode, setPinCode] = useState<string | null>(null);
  // The exact spot the sample is collected from — the patient drops it themselves.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const useMyLocation = async () => {
    setLocating(true); setLocateError("");
    try {
      const pos = await getCurrentPositionCompat({ enableHighAccuracy: true, timeout: 15000 });
      const p = labPin(pos.coords.latitude, pos.coords.longitude);
      if (p) setPin(p); else setLocateError(t("locationOutside"));
    } catch {
      setLocateError(t("locationFailed"));
    } finally {
      setLocating(false);
    }
  };
  const days = useMemo(() => collectionDays(), []);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState("");
  const [methodChoice, setMethod] = useState<"WALLET" | "ONLINE" | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [topUp, setTopUp] = useState(false);

  const selectedIds = selected ?? new Set(bookable.map((b) => b.id));
  const addressValue = address ?? data?.defaultAddress ?? "";
  const pinValue = pinCode ?? data?.defaultPinCode ?? "";
  // Today only while it still has a slot open.
  const dayChoices = days.filter((d) => openSlots(d).length > 0);
  const dayValue = day ?? dayChoices[0] ?? "";
  const slots = dayValue ? openSlots(dayValue) : [];
  const slotValue = slots.includes(slot as (typeof slots)[number]) ? slot : "";
  const allTotal = bookable.reduce((s, b) => s + b.price, 0);
  const method = methodChoice ?? (data && allTotal > 0 && data.walletBalance >= allTotal ? "WALLET" : "ONLINE");
  const chosen = bookable.filter((b) => selectedIds.has(b.id));
  const total = chosen.reduce((s, b) => s + b.price, 0);
  const walletShort = method === "WALLET" && !!data && data.walletBalance < total;

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    if (!appointmentId || chosen.length === 0) return;
    setBusy(true); setSubmitError("");
    const res = await mutate<{ paymentSessionId?: string }>("/api/lab-bookings", {
      body: { appointmentId, labTestIds: chosen.map((c) => c.id), address: addressValue, pinCode: pinValue, lat: pin?.lat, lng: pin?.lng, collectionDate: dayValue, collectionSlot: slotValue, notes, paymentMethod: method },
    });
    if (!res.ok) { setBusy(false); setSubmitError(res.error); if (res.status === 409) reload(); return; }
    if (res.data.paymentSessionId) {
      // Cashfree sends them back to /patient/lab-tests, which confirms the payment.
      try {
        const { load: loadCashfree } = await import("@cashfreepayments/cashfree-js");
        // Same hardcoded mode as the other checkouts (NEXT_PUBLIC_ vars are baked in at build time).
        const cashfree = await loadCashfree({ mode: "production" });
        cashfree.checkout({ paymentSessionId: res.data.paymentSessionId, redirectTarget: "_self" });
      } catch {
        setBusy(false);
        router.push("/patient/lab-tests");
      }
      return;
    }
    setBusy(false);
    toast.success(t("booked"));
    router.push("/patient/lab-tests");
  };

  if (!appointmentId) {
    return <p className="text-sm text-slate-500">{t("missing")}</p>;
  }
  if (error && !data) return <LoadError error={error} onRetry={reload} retrying={reloading} />;
  if (!data) return <div className="skeleton h-64 rounded-2xl" />;

  if (data.openBooking) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-sm text-slate-700">{t("alreadyBooked")}</p>
        <Link href="/patient/lab-tests" className="tap-44-y btn-primary py-2 px-4 text-sm mt-4 inline-flex">{t("viewBookings")}</Link>
      </div>
    );
  }
  if (bookable.length === 0) {
    return <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-6 text-sm text-slate-500 text-center">{t("noneBookable")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t("forPatient")}</p>
        <p className="font-semibold text-slate-900">{data.patientName}</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t("testsTitle")}</p>
        <div className="divide-y divide-slate-100">
          {bookable.map((b) => (
            <label key={b.id} className="flex items-start gap-3 py-3 px-2 -mx-2 min-h-11 rounded-2xl hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 mt-0.5 accent-teal-600" checked={selectedIds.has(b.id)} onChange={() => toggle(b.id)} />
              <span className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-800 block">{b.name}</span>
                {b.instructions && <span className="text-xs text-slate-500 block">{b.instructions}</span>}
              </span>
              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">₹{b.price.toLocaleString(locale)}</span>
            </label>
          ))}
        </div>
        {notBookable.length > 0 && (
          <p className="text-xs text-slate-400 mt-2">{t("notBookable", { tests: notBookable.map((r) => r.name).join(", ") })}</p>
        )}
        <div className="flex justify-between items-center border-t border-slate-100 pt-3 mt-2">
          <span className="text-sm font-bold text-slate-700">{t("total")}</span>
          <span className="text-xl font-extrabold text-slate-900">₹{total.toLocaleString(locale)}</span>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-5 space-y-3">
        <div>
          <label className="input-label">{t("address")}</label>
          <textarea rows={2} className="input-field resize-none" maxLength={500} value={addressValue} onChange={(e) => setAddress(e.target.value)} placeholder={t("addressPlaceholder")} />
        </div>
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <label className="input-label mb-0">{t("mapLabel")} <span className="text-red-500">*</span></label>
            <button type="button" onClick={useMyLocation} disabled={locating} className="tap-44-y btn-secondary py-1.5 px-3 text-xs inline-flex">
              {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />} {t("useMyLocation")}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">{t("mapHint")}</p>
          <LocationPickerMap lat={pin?.lat ?? null} lng={pin?.lng ?? null} center={data.mapCenter} onChange={(lat, lng) => setPin(labPin(lat, lng))} height={260} />
          {pin ? (
            <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1.5"><MapPin className="w-3.5 h-3.5" />{t("locationSet", { coords: `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` })}</p>
          ) : (
            <p className="text-xs text-red-600 font-semibold mt-1.5">{t("locationMissing")}</p>
          )}
          {locateError && <p className="text-xs text-amber-700 mt-1">{locateError}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="input-label">{t("pinCode")}</label>
            <input className="input-field" inputMode="numeric" maxLength={6} value={pinValue} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))} placeholder="411001" />
          </div>
          <div>
            <label className="input-label">{t("collectionDay")}</label>
            <select className="input-field" value={dayValue} onChange={(e) => { setDay(e.target.value); setSlot(""); }}>
              {dayChoices.map((d) => <option key={d} value={d}>{collectionDayLabel(d, locale)}</option>)}
            </select>
          </div>
          <div>
            <label className="input-label">{t("timeSlot")}</label>
            <select className="input-field" value={slotValue} onChange={(e) => setSlot(e.target.value)}>
              <option value="">{t("pickSlot")}</option>
              {slots.map((k) => <option key={k} value={k}>{slotLabel(k)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="input-label">{t("notes")}</label>
          <input className="input-field" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPlaceholder")} />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100/80 shadow-sm p-5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t("payWith")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["WALLET", "ONLINE"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn("tap-44-y text-left rounded-2xl border px-4 py-3 flex items-start gap-3", method === m ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-300")}
            >
              {m === "WALLET" ? <Wallet className="w-5 h-5 text-teal-600 flex-shrink-0" /> : <CreditCard className="w-5 h-5 text-teal-600 flex-shrink-0" />}
              <span>
                <span className="text-sm font-semibold text-slate-800 block">{t(`method.${m}`)}</span>
                <span className="text-xs text-slate-500 block">
                  {m === "WALLET" ? t("walletBalance", { amount: data.walletBalance.toLocaleString(locale) }) : t("onlineHint")}
                </span>
              </span>
            </button>
          ))}
        </div>
        {walletShort && (
          <p className="text-xs text-amber-700 mt-3 flex items-center gap-1.5 flex-wrap">
            <AlertCircle className="w-3.5 h-3.5" />{t("walletShort", { amount: (total - data.walletBalance).toLocaleString(locale) })}
            <button type="button" onClick={() => setTopUp(true)} className="font-semibold underline">{t("addMoney")}</button>
          </p>
        )}
      </div>

      {submitError && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{submitError}</p>}

      <button
        onClick={submit}
        disabled={busy || chosen.length === 0 || walletShort || addressValue.trim().length < 5 || !PIN_CODE.test(pinValue) || !slotValue || !pin}
        className="tap-44-y btn-primary w-full py-3"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("submit", { amount: total.toLocaleString(locale), method })}
      </button>

      {topUp && <WalletTopUpModal onClose={() => { setTopUp(false); reload(); }} />}
    </div>
  );
}

export default function BookLabTestsPage() {
  const t = useTranslations("patient.labTests.book");
  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
        <Link href="/patient/appointments" className="text-sm text-slate-500 hover:text-teal-600 inline-flex items-center gap-1 mb-3"><ArrowLeft className="w-4 h-4" />{t("back")}</Link>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2 mb-1"><FlaskConical className="w-6 h-6 text-teal-600" />{t("title")}</h1>
        <p className="text-sm text-slate-500 mb-6">{t("subtitle")}</p>
        <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
          <BookLabTests />
        </Suspense>
      </div>
    </div>
  );
}
