"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  UserPlus, Phone, Loader2, Building2, Home, Video, Banknote, QrCode, CheckCircle2,
  AlertTriangle, Users, Plus, CalendarClock, Clock, UserCheck, ArrowLeft,
} from "lucide-react";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import PaymentQrPanel, { type PaymentLink } from "@/components/doctor/PaymentQrPanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadError from "@/components/LoadError";
import { useAuth } from "@/components/AuthProvider";
import { useLoad } from "@/lib/apiClient";
import { GENDERS } from "@/lib/bookingProfile";
import { RELATIONS } from "@/lib/relations";
import { normalizeMobile, isValidMobile } from "@/lib/validation";
import { todayIsoDateIst } from "@/lib/clinicAvailability";
import { addDaysYmd } from "@/lib/istDate";
import { cn, formatDoctorName } from "@/lib/utils";

type VisitType = "CLINIC" | "HOME" | "VIDEO";

interface Context {
  doctorId: string;
  doctorName: string;
  blocked: string | null;
  types: { type: VisitType; fee: number }[];
  clinics: { id: string; name: string; address: string | null; hasHours: boolean; openNow: boolean }[];
  horizonDays: number;
  // Set while the doctor owes too much platform fee on cash visits.
  cashBlocked: string | null;
}

interface Dependent { id: string; name: string; relation: string; age: number | null; gender: string | null }

type Lookup =
  | { state: "idle" }
  | { state: "loading"; mobile: string }
  | { state: "error"; mobile: string; error: string }
  | { state: "new"; mobile: string }
  | {
      state: "found";
      mobile: string;
      patient: {
        id: string; name: string; age: number | null; gender: string | null; known: boolean;
        allergies: string | null; homeAddress: string | null; landmark: string | null; pinCode: string | null;
        dependents: Dependent[]; visitsWithDoctor: number; lastVisitAt: string | null;
      };
    };

interface Booked {
  appointment: { id: string; patientLabel: string; consultType: VisitType; scheduledAt: string; timed: boolean; amount: number; paymentMethod: "CASH" | "ONLINE"; paymentStatus: string };
  patientCreated: boolean;
  payment: PaymentLink | null;
  // Nothing to pay (a ₹0 fee) — set on arrival, so a payment landing later
  // isn't mistaken for it.
  free?: boolean;
}

const TYPE_META: Record<VisitType, { label: string; icon: React.ElementType }> = {
  CLINIC: { label: "Clinic visit", icon: Building2 },
  HOME: { label: "Home visit", icon: Home },
  VIDEO: { label: "Video", icon: Video },
};

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function WalkInBookingPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "STAFF";
  const { data: ctx, error: ctxError, loading: ctxLoading, reload: reloadCtx, reloading: ctxReloading } =
    useLoad<Context>(user ? "/api/doctor/walk-in-appointments" : null, { fallback: "Couldn't load the booking form." });

  // ── Patient ──
  const [mobile, setMobile] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  // "SELF", a saved dependent's id, or "NEW" (a family member added now).
  const [who, setWho] = useState<string>("SELF");
  const [dep, setDep] = useState({ name: "", relation: "", age: "", gender: "" });

  // ── Visit ──
  const [consultType, setConsultType] = useState<VisitType | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [whenMode, setWhenMode] = useState<"NOW" | "LATER">("NOW");
  const [date, setDate] = useState(todayIsoDateIst());
  const [slotTime, setSlotTime] = useState<string | null>(null);
  const [freeTime, setFreeTime] = useState("");
  const [slots, setSlots] = useState<{ time: string; label: string }[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [address, setAddress] = useState({ address: "", landmark: "", pinCode: "" });
  const [symptoms, setSymptoms] = useState("");
  const [allergies, setAllergies] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "ONLINE">("CASH");
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Defaults once the doctor's setup is known.
  useEffect(() => {
    if (!ctx) return;
    // Seeding the form from the loaded settings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsultType((t) => t ?? ctx.types.find((x) => x.type === "CLINIC")?.type ?? ctx.types[0]?.type ?? null);
    setClinicId((c) => c ?? (ctx.clinics.find((x) => x.openNow) ?? ctx.clinics[0])?.id ?? null);
    if (ctx.cashBlocked) setPaymentMethod("ONLINE");
  }, [ctx]);

  // Look the number up as soon as it's a full mobile.
  const normalized = normalizeMobile(mobile);
  const mobileValid = isValidMobile(mobile);
  useEffect(() => {
    if (!mobileValid) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLookup({ state: "loading", mobile: normalized });
      try {
        const res = await fetch(`/api/doctor/patients/lookup?mobile=${normalized}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setLookup({ state: "error", mobile: normalized, error: d.error ?? "Couldn't look up this number." }); return; }
        if (!d.exists) { setLookup({ state: "new", mobile: normalized }); return; }
        setLookup({ state: "found", mobile: normalized, patient: d.patient });
        const p = d.patient as Extract<Lookup, { state: "found" }>["patient"];
        setAllergies(p.allergies ?? "");
        setAddress({ address: p.homeAddress ?? "", landmark: p.landmark ?? "", pinCode: p.pinCode ?? "" });
      } catch {
        if (!cancelled) setLookup({ state: "error", mobile: normalized, error: "Network error — check your connection and try again." });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mobileValid, normalized]);

  const onMobileChange = (v: string) => {
    setMobile(v);
    setLookup({ state: "idle" });
    setWho("SELF");
    setName(""); setAge(""); setGender("");
    setAllergies("");
    setAddress({ address: "", landmark: "", pinCode: "" });
    setFormError(null);
  };

  const found = lookup.state === "found" ? lookup.patient : null;
  const isNew = lookup.state === "new";
  const patientReady = !!found || isNew;
  const selectedClinic = ctx?.clinics.find((c) => c.id === clinicId) ?? null;
  const fee = ctx?.types.find((t) => t.type === consultType)?.fee ?? 0;
  const useSlotPicker = consultType === "CLINIC" && !!selectedClinic?.hasHours;

  // Free slots for a clinic visit later.
  useEffect(() => {
    if (!ctx || whenMode !== "LATER" || !useSlotPicker || !clinicId) return;
    let cancelled = false;
    // Clearing the previous day's slots while the new ones load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots(null); setSlotsError(null); setSlotTime(null);
    fetch(`/api/doctors/${ctx.doctorId}/slots?clinicId=${clinicId}&date=${date}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setSlotsError(d.error ?? "Couldn't load free slots."); setSlots([]); return; }
        setSlots(d.slots ?? []);
      })
      .catch(() => { if (!cancelled) { setSlotsError("Network error loading slots."); setSlots([]); } });
    return () => { cancelled = true; };
  }, [ctx, whenMode, useSlotPicker, clinicId, date]);

  const scheduledAt = useMemo(() => {
    if (whenMode === "NOW") return null;
    const time = useSlotPicker ? slotTime : freeTime;
    if (!time) return undefined; // not picked yet
    return new Date(`${date}T${time}:00+05:30`).toISOString();
  }, [whenMode, useSlotPicker, slotTime, freeTime, date]);

  // What's still missing, in the order the form asks for it.
  const holderNeedsName = isNew || (!!found && !found.name.trim());
  const holderNeedsAgeGender = who === "SELF" && (isNew || (!!found && (!found.age || !found.gender)));
  const problem = (() => {
    if (!patientReady) return "Enter the patient's mobile number.";
    if (holderNeedsName && name.trim().length < 2) return "Enter the patient's full name.";
    if (holderNeedsAgeGender && (!found?.age && !(Number(age) >= 1 && Number(age) <= 120))) return "Enter the patient's age.";
    if (holderNeedsAgeGender && !found?.gender && !gender) return "Select the patient's gender.";
    if (who === "NEW" && dep.name.trim().length < 2) return "Enter the family member's name.";
    if (who === "NEW" && !dep.relation) return "Select how they're related.";
    if (!consultType) return "Select the type of visit.";
    if (consultType === "CLINIC" && (ctx?.clinics.length ?? 0) > 0 && !clinicId) return "Select the clinic.";
    if (scheduledAt === undefined) return "Pick a time for the visit.";
    if (consultType === "HOME" && !address.address.trim()) return "Enter the address for the home visit.";
    if (symptoms.trim().length < 3) return "Enter the reason for the visit.";
    if (!consent) return "Confirm the patient agreed to share these details.";
    return null;
  })();

  const submit = useCallback(async (force = false) => {
    if (problem || !consultType) { setFormError(problem); return; }
    setSubmitting(true);
    setFormError(null);
    let res: Response;
    try {
      res = await fetch("/api/doctor/walk-in-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: normalized,
          name: holderNeedsName ? name.trim() : undefined,
          age: holderNeedsAgeGender && age ? Number(age) : undefined,
          gender: holderNeedsAgeGender && gender ? gender : undefined,
          dependentId: who !== "SELF" && who !== "NEW" ? who : undefined,
          newDependent: who === "NEW"
            ? { name: dep.name.trim(), relation: dep.relation, age: dep.age ? Number(dep.age) : null, gender: dep.gender || null }
            : undefined,
          consultType,
          clinicId: consultType === "CLINIC" ? clinicId : undefined,
          scheduledAt,
          symptoms: symptoms.trim(),
          allergies: allergies.trim() || null,
          visit: consultType === "HOME" ? address : undefined,
          paymentMethod,
          consentGiven: consent,
          force,
        }),
      });
    } catch {
      setSubmitting(false);
      setFormError("Network error — check your connection and try again.");
      return;
    }
    const d = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      if (d.code === "DUPLICATE_BOOKING") { setDuplicate(d.error); return; }
      setDuplicate(null);
      setFormError(d.error ?? "Booking failed. Please try again.");
      return;
    }
    setDuplicate(null);
    setBooked({ ...(d as Booked), free: (d as Booked).appointment.paymentStatus === "PAID" });
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [problem, consultType, normalized, holderNeedsName, name, holderNeedsAgeGender, age, gender, who, dep, clinicId, scheduledAt, symptoms, allergies, address, paymentMethod, consent]);

  const reset = () => {
    setBooked(null);
    onMobileChange("");
    setSymptoms("");
    setDep({ name: "", relation: "", age: "", gender: "" });
    setWhenMode("NOW");
    setSlotTime(null);
    setFreeTime("");
    setPaymentMethod(ctx?.cashBlocked ? "ONLINE" : "CASH");
    setConsent(false);
  };

  const dependents = found?.dependents ?? [];
  const today = todayIsoDateIst();
  const maxDate = ctx ? addDaysYmd(today, ctx.horizonDays) : today;

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div ref={topRef} className="max-w-2xl mx-auto px-4 sm:px-6 py-8 scroll-mt-20">
        <Link href="/doctor/dashboard" className="btn-ghost gap-1.5 text-sm mb-3 -ml-2"><ArrowLeft className="w-4 h-4" /> Dashboard</Link>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <UserPlus className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900">Walk-in / phone booking</h1>
            <p className="text-sm text-slate-500 truncate">
              Book a patient {ctx ? `with ${formatDoctorName(ctx.doctorName)}` : ""} — confirmed straight away
            </p>
          </div>
        </div>

        {ctxError && <LoadError error={ctxError} onRetry={reloadCtx} retrying={ctxReloading} hasData={!!ctx} />}
        {ctxLoading && !ctx && (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
        )}

        {ctx && ctx.blocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" /> {ctx.blocked}
          </div>
        )}
        {ctx && !ctx.blocked && ctx.types.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" />
            {isStaff ? "The doctor hasn't turned on any visit types yet." : "Turn on at least one visit type in Profile → Consultation settings first."}
          </div>
        )}

        {ctx && booked && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 text-lg">{booked.appointment.patientLabel} is booked</p>
                <p className="text-sm text-slate-500">
                  {TYPE_META[booked.appointment.consultType].label}
                  {booked.appointment.consultType === "CLINIC" && selectedClinic ? ` · ${selectedClinic.name}` : ""}
                  {" · "}{booked.appointment.timed ? fmtWhen(booked.appointment.scheduledAt) : "now, in today's queue"}
                </p>
              </div>
            </div>

            {booked.free ? (
              <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 font-semibold">No fee for this visit — nothing to collect.</p>
            ) : booked.appointment.paymentMethod === "CASH" ? (
              <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-4 py-3 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-slate-500" /> Collect <strong>₹{booked.appointment.amount}</strong> in cash at the visit.
              </p>
            ) : (
              <div className="border border-slate-100 rounded-2xl p-4">
                <PaymentQrPanel
                  appointmentId={booked.appointment.id}
                  amount={booked.appointment.amount}
                  patientMobile={normalized}
                  initialLink={booked.payment}
                  canSwitchToCash
                  onSwitchedToCash={() => setBooked((b) => (b ? { ...b, appointment: { ...b.appointment, paymentMethod: "CASH" } } : b))}
                />
              </div>
            )}

            {booked.patientCreated && (
              <p className="text-xs text-slate-500 mt-4">
                A DocOnClick account was made for {normalized}. If the patient signs up in the app with this number, they&apos;ll see this visit and their prescription there.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button type="button" onClick={reset} className="btn-primary justify-center py-3"><UserPlus className="w-4 h-4" /> Book another</button>
              <Link href="/doctor/dashboard" className="btn-secondary justify-center py-3">Go to queue</Link>
            </div>
          </div>
        )}

        {ctx && !booked && !ctx.blocked && ctx.types.length > 0 && (
          <div className="space-y-4">
            {/* 1 — Patient */}
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5"><Phone className="w-4 h-4 text-slate-400" /> Patient&apos;s mobile</h2>
              <div className="relative">
                <input
                  value={mobile}
                  onChange={(e) => onMobileChange(e.target.value)}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="10-digit mobile number"
                  className="input-field w-full text-base tracking-wide"
                  autoFocus
                />
                {lookup.state === "loading" && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />}
              </div>
              {mobile && !mobileValid && normalized.length >= 10 && <p className="text-xs text-red-500 mt-1.5">Enter a valid 10-digit Indian mobile number.</p>}
              {lookup.state === "error" && <p className="text-sm text-red-600 mt-2">{lookup.error}</p>}

              {found && (
                <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <UserCheck className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 text-sm">
                    <p className="font-bold text-slate-900">{found.name.trim() || "Registered patient (name not set)"}</p>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {[found.age ? `${found.age} yrs` : null, found.gender].filter(Boolean).join(" · ") || "Age/gender not set"}
                      {" · "}
                      {found.visitsWithDoctor > 0
                        ? `${found.visitsWithDoctor} past visit${found.visitsWithDoctor === 1 ? "" : "s"}${found.lastVisitAt ? `, last ${new Date(found.lastVisitAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : ""}`
                        : "first visit with this doctor"}
                    </p>
                  </div>
                </div>
              )}
              {isNew && (
                <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">New patient — an account is created for this number with the booking.</p>
              )}

              {(holderNeedsName || holderNeedsAgeGender) && (
                <div className="mt-3 space-y-2.5">
                  {holderNeedsName && (
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient's full name" className="input-field w-full" autoComplete="off" />
                  )}
                  {holderNeedsAgeGender && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {!found?.age && (
                        <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Age" className="input-field w-full" />
                      )}
                      {!found?.gender && (
                        <select value={gender} onChange={(e) => setGender(e.target.value)} className="input-field w-full">
                          <option value="">Gender</option>
                          {GENDERS.map((g) => <option key={g}>{g}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {patientReady && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Visit is for</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={who === "SELF"} onClick={() => setWho("SELF")}>{(found?.name.trim() || name.trim() || "Patient")} (self)</Chip>
                    {dependents.map((d) => (
                      <Chip key={d.id} active={who === d.id} onClick={() => setWho(d.id)}>{d.name} · {d.relation}</Chip>
                    ))}
                    <Chip active={who === "NEW"} onClick={() => setWho("NEW")}><Plus className="w-3.5 h-3.5" /> Family member</Chip>
                  </div>
                  {who === "NEW" && (
                    <div className="mt-3 grid grid-cols-2 gap-2.5">
                      <input value={dep.name} onChange={(e) => setDep({ ...dep, name: e.target.value })} placeholder="Their full name" className="input-field w-full col-span-2" autoComplete="off" />
                      <select value={dep.relation} onChange={(e) => setDep({ ...dep, relation: e.target.value })} className="input-field w-full">
                        <option value="">Relation</option>
                        {RELATIONS.filter((r) => r !== "Self").map((r) => <option key={r}>{r}</option>)}
                      </select>
                      <input value={dep.age} onChange={(e) => setDep({ ...dep, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="Age (optional)" className="input-field w-full" />
                      <select value={dep.gender} onChange={(e) => setDep({ ...dep, gender: e.target.value })} className="input-field w-full col-span-2">
                        <option value="">Gender (optional)</option>
                        {GENDERS.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </section>

            {patientReady && (
              <>
                {/* 2 — Visit */}
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="text-sm font-bold text-slate-800 mb-3">Visit</h2>
                  <div className={cn("grid gap-2", ctx.types.length === 3 ? "grid-cols-3" : ctx.types.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                    {ctx.types.map(({ type, fee }) => {
                      const { label, icon: Icon } = TYPE_META[type];
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { setConsultType(type); setSlotTime(null); }}
                          className={cn(
                            "rounded-xl border px-2 py-3 text-center transition-colors",
                            consultType === type ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Icon className="w-5 h-5 mx-auto mb-1" />
                          <span className="block text-xs font-bold">{label}</span>
                          <span className="block text-xs mt-0.5">₹{fee}</span>
                        </button>
                      );
                    })}
                  </div>

                  {consultType === "CLINIC" && ctx.clinics.length > 1 && (
                    <select value={clinicId ?? ""} onChange={(e) => { setClinicId(e.target.value); setSlotTime(null); }} className="input-field w-full mt-3">
                      {ctx.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}{c.openNow ? " · open now" : ""}</option>)}
                    </select>
                  )}
                  {consultType === "CLINIC" && ctx.clinics.length === 1 && (
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {ctx.clinics[0].name}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Chip active={whenMode === "NOW"} onClick={() => setWhenMode("NOW")} block><Clock className="w-3.5 h-3.5" /> Now (in queue)</Chip>
                    <Chip active={whenMode === "LATER"} onClick={() => setWhenMode("LATER")} block><CalendarClock className="w-3.5 h-3.5" /> Later</Chip>
                  </div>
                  {whenMode === "NOW" && consultType === "CLINIC" && selectedClinic && selectedClinic.hasHours && !selectedClinic.openNow && (
                    <p className="text-xs text-amber-700 mt-2">{selectedClinic.name} isn&apos;t in its posted hours right now — fine for a patient who&apos;s here.</p>
                  )}
                  {whenMode === "LATER" && (
                    <div className="mt-3 space-y-3">
                      <input type="date" value={date} min={today} max={maxDate} onChange={(e) => { setDate(e.target.value); setSlotTime(null); }} className="input-field w-full" />
                      {useSlotPicker ? (
                        slots === null ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading free slots…</div>
                        ) : slots.length === 0 ? (
                          <p className="text-sm text-slate-500">{slotsError ?? "No free slots at this clinic on that day."}</p>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-56 overflow-y-auto">
                            {slots.map((s) => (
                              <button
                                key={s.time}
                                type="button"
                                onClick={() => setSlotTime(s.time)}
                                className={cn(
                                  "rounded-lg border py-2 text-xs font-semibold",
                                  slotTime === s.time ? "border-teal-500 bg-teal-500 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )
                      ) : (
                        <input type="time" value={freeTime} onChange={(e) => setFreeTime(e.target.value)} step={600} className="input-field w-full" />
                      )}
                    </div>
                  )}

                  {consultType === "HOME" && (
                    <div className="mt-4 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-500">Visit address</p>
                      <textarea value={address.address} onChange={(e) => setAddress({ ...address, address: e.target.value })} rows={2} placeholder="House / flat, street, area" className="input-field w-full" />
                      <div className="grid grid-cols-2 gap-2.5">
                        <input value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} placeholder="Landmark (optional)" className="input-field w-full" />
                        <input value={address.pinCode} onChange={(e) => setAddress({ ...address, pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" placeholder="PIN code" className="input-field w-full" />
                      </div>
                    </div>
                  )}
                  {consultType === "VIDEO" && (
                    <p className="text-xs text-slate-500 mt-3">The patient joins the video call from the DocOnClick app, signed in with this number.</p>
                  )}
                </section>

                {/* 3 — Details */}
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2.5">
                  <h2 className="text-sm font-bold text-slate-800">Reason for visit</h2>
                  <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. Fever and cough for 3 days" className="input-field w-full" />
                  <input value={allergies} onChange={(e) => setAllergies(e.target.value)} maxLength={500} placeholder="Allergies, if any (optional)" className="input-field w-full" />
                </section>

                {/* 4 — Payment */}
                <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <h2 className="text-sm font-bold text-slate-800 mb-3">Payment · ₹{fee}</h2>
                  <div className="grid grid-cols-2 gap-2">
                    <PayOption active={paymentMethod === "CASH"} onClick={() => setPaymentMethod("CASH")} icon={Banknote} title="Cash" note={ctx.cashBlocked ? "Paused" : "Collect at the visit"} disabled={!!ctx.cashBlocked} />
                    <PayOption active={paymentMethod === "ONLINE"} onClick={() => setPaymentMethod("ONLINE")} icon={QrCode} title="Online" note="Patient scans a QR / link" />
                  </div>
                  {ctx.cashBlocked && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                      {ctx.cashBlocked}{!isStaff && <> <Link href="/doctor/earnings" className="font-semibold underline">Pay now</Link></>}
                    </p>
                  )}
                </section>

                <label className="flex items-start gap-2.5 px-1 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-teal-600" />
                  The patient agreed to book this visit and share these details with the doctor.
                </label>

                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {formError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={submitting}
                  className="btn-primary w-full justify-center py-3.5 text-base disabled:opacity-60"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : `Book ${whenMode === "NOW" ? "now" : "visit"} · ₹${fee} ${paymentMethod === "CASH" ? "cash" : "online"}`}
                </button>
                {problem && !formError && <p className="text-xs text-slate-400 text-center -mt-2">{problem}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {duplicate && (
        <ConfirmDialog
          icon={AlertTriangle}
          title="Already booked"
          message={duplicate}
          confirmLabel="Book anyway"
          busyLabel="Booking…"
          tone="warning"
          busy={submitting}
          onCancel={() => setDuplicate(null)}
          onConfirm={() => submit(true)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children, block }: { active: boolean; onClick: () => void; children: React.ReactNode; block?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors",
        block && "justify-center py-2.5 rounded-xl",
        active ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function PayOption({ active, onClick, icon: Icon, title, note, disabled }: { active: boolean; onClick: () => void; icon: React.ElementType; title: string; note: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        active ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:bg-slate-50"
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-sm font-bold", active ? "text-teal-700" : "text-slate-700")}><Icon className="w-4 h-4" /> {title}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{note}</span>
    </button>
  );
}
