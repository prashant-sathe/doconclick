"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2, MapPin, Building2, Clock, Plus, Trash2, Save, CheckCircle2,
  Navigation, Image as ImageIcon, UploadCloud, ArrowRight, CalendarOff,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { isNative, getCurrentPositionCompat } from "@/lib/platform";
import DoctorHeader from "@/components/doctor/DoctorHeader";
import DoctorMobileNav from "@/components/doctor/DoctorMobileNav";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import LocationPickerMap from "@/components/LocationPickerMap";
import ImageCropModal from "@/components/ImageCropModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { todayIsoDateIst } from "@/lib/clinicAvailability";
import { prepareBlobUpload } from "@/lib/compressImage";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface Slot {
  dayOfWeek: string;
  fromTime: string;
  toTime: string;
}

interface SlotGroup {
  days: string[];
  fromTime: string;
  toTime: string;
}

interface ClinicForm {
  uid: string; // stable local key — survives the null→real id transition on save
  id: string | null; // null = not yet saved
  name: string;
  address: string;
  photoUrl: string | null;
  lat: number | null;
  lng: number | null;
  slotGroups: SlotGroup[];
  saving: boolean;
  saved: boolean;
  error: string;
}

interface ClinicApiShape {
  id: string;
  name: string;
  address: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  slots: Slot[];
}

function groupSlots(slots: Slot[]): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const slot of slots) {
    const existing = groups.find((g) => g.fromTime === slot.fromTime && g.toTime === slot.toTime);
    if (existing) existing.days.push(slot.dayOfWeek);
    else groups.push({ days: [slot.dayOfWeek], fromTime: slot.fromTime, toTime: slot.toTime });
  }
  return groups;
}

// Stable local key for a form row. crypto.randomUUID is only defined in a
// secure context (fails over a LAN IP), so fall back to a random string.
let uidCounter = 0;
function makeUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `uid-${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function newClinic(): ClinicForm {
  return {
    uid: makeUid(),
    id: null, name: "", address: "", photoUrl: null, lat: null, lng: null,
    slotGroups: [{ days: [], fromTime: "09:00", toTime: "18:00" }],
    saving: false, saved: false, error: "",
  };
}

function ClinicPhotoUpload({ url, onUploaded }: { url: string | null; onUploaded: (url: string) => void }) {
  const t = useTranslations("doctorAccount.clinics");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const upload = async (fileOrBlob: File | Blob) => {
    setBusy(true);
    setError("");
    const file = await prepareBlobUpload(fileOrBlob, "clinic-photo.jpg").catch(() => null);
    if (!file) { setBusy(false); setError(t("fileReadFailed")); return; }
    const form = new FormData();
    form.append("file", file, "clinic-photo.jpg");
    const res = await fetch("/api/doctors/me/clinics/photo", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      onUploaded(data.url);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? t("uploadFailed"));
    }
  };

  // Clinic photos aren't persisted server-side until the clinic itself is
  // saved (see the API route's comment), so "remove" is just clearing the
  // local field — no separate delete call needed.
  const remove = () => onUploaded("");

  return (
    <div>
      <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-2">
        {url ? (
          <Image src={url} alt={t("photoAlt")} fill sizes="100vw" className="object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1">
            <ImageIcon className="w-6 h-6" />
            <span className="text-xs text-slate-400">{t("noPhoto")}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer flex-shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
          {url ? t("replacePhoto") : t("uploadPhoto")}
          <input type="file" accept=".jpg,.jpeg,.png" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
        </label>
        {url && (
          <button type="button" onClick={remove} disabled={busy}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60 flex-shrink-0" title={t("remove")}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={16 / 9}
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => { setPendingFile(null); upload(blob); }}
        />
      )}
    </div>
  );
}

interface ClinicLeave {
  id: string;
  date: string; // "YYYY-MM-DD"
  reason: string | null;
}

// A live booking that falls on a leave day being added — the API returns
// these so the doctor confirms before they're cancelled and refunded.
interface AffectedBooking {
  id: string;
  patientName: string;
  scheduledAt: string;
  paid: boolean;
  refund: number;
}

// The bookings a leave day or a clinic removal would cancel, for the confirm dialogs.
function AffectedBookingList({ bookings, showDate = false }: { bookings: AffectedBooking[]; showDate?: boolean }) {
  const t = useTranslations("doctorAccount.clinics");
  const locale = formattingLocale(useLocale());
  const refundTotal = bookings.reduce((sum, b) => sum + b.refund, 0);
  return (
    <>
      <ul className="mt-3 max-h-48 overflow-y-auto space-y-1.5">
        {bookings.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
            <span className="font-semibold text-slate-700 truncate">{b.patientName}</span>
            <span className="text-slate-500 flex-shrink-0">
              {new Date(b.scheduledAt).toLocaleString(locale, {
                timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit",
                ...(showDate ? { day: "numeric", month: "short" } : {}),
              })}
              {b.paid ? ` · ${t("refund", { amount: b.refund })}` : ` · ${t("unpaid")}`}
            </span>
          </li>
        ))}
      </ul>
      {refundTotal > 0 && (
        <p className="mt-3 text-xs">{t("refundTotal", { amount: refundTotal })}</p>
      )}
    </>
  );
}

// "3 bookings cancelled and the patients notified. ₹900 refunded…"
function useCancelledNotice() {
  const t = useTranslations("doctorAccount.clinics");
  return (cancelledBookings: number, refundTotal: number) =>
    t("cancelled", { count: cancelledBookings }) + (refundTotal > 0 ? ` ${t("refunded", { amount: refundTotal })}` : "");
}

function formatLeaveDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
  });
}

// Per-clinic leave/holiday dates — closes booking on specific calendar dates
// despite the clinic's normal weekly hours. Persisted immediately on
// add/remove (unlike the rest of the clinic form) since there's nothing to
// "save" together with it — each date is its own row server-side.
function ClinicLeaveManager({ clinicId }: { clinicId: string }) {
  const t = useTranslations("doctorAccount.clinics");
  const locale = formattingLocale(useLocale());
  const cancelledNotice = useCancelledNotice();
  const [leaves, setLeaves] = useState<ClinicLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/doctors/me/clinics/${clinicId}/leaves`)
      .then((r) => (r.ok ? r.json() : { leaves: [] }))
      .then((data: { leaves: ClinicLeave[] }) => { if (!cancelled) setLeaves(data.leaves ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clinicId]);

  // First call without confirmBookingIds; if patients are booked that day
  // the API answers 409 LEAVE_HAS_BOOKINGS and we ask before cancelling them.
  const addLeave = async (confirmBookingIds?: string[]) => {
    if (!date) return;
    setAdding(true);
    setError("");
    setNotice("");
    const res = await fetch(`/api/doctors/me/clinics/${clinicId}/leaves`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason.trim() || undefined, confirmBookingIds }),
    });
    setAdding(false);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const { cancelledBookings, refundTotal, ...created } = body as ClinicLeave & { cancelledBookings: number; refundTotal: number };
      setLeaves((cur) => [...cur, created].sort((a, b) => a.date.localeCompare(b.date)));
      setDate("");
      setReason("");
      setAffected(null);
      if (cancelledBookings > 0) setNotice(cancelledNotice(cancelledBookings, refundTotal));
    } else if (res.status === 409 && body.code === "LEAVE_HAS_BOOKINGS") {
      setAffected(body.bookings);
    } else {
      setAffected(null);
      setError(body.error ?? t("addLeaveFailed"));
    }
  };

  const removeLeave = async (leaveId: string) => {
    setRemovingId(leaveId);
    const res = await fetch(`/api/doctors/me/clinics/${clinicId}/leaves/${leaveId}`, { method: "DELETE" });
    setRemovingId(null);
    if (res.ok) setLeaves((cur) => cur.filter((l) => l.id !== leaveId));
  };

  // IST, not the device's UTC date — the API rejects anything before today in IST.
  const todayIso = todayIsoDateIst();
  const maxIso = (() => {
    const [y, m, d] = todayIso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 365)).toISOString().slice(0, 10);
  })();

  return (
    <div>
      <label className="input-label flex items-center gap-1.5"><CalendarOff className="w-3.5 h-3.5" /> {t("leaveTitle")} <span className="text-slate-400 font-normal normal-case">{t("optional")}</span></label>
      <p className="text-xs text-slate-400 mt-1 mb-2">{t("leaveHint")}</p>

      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
      ) : (
        <>
          {leaves.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {leaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                  <span className="text-slate-700 font-semibold">
                    {formatLeaveDate(l.date, locale)}
                    {l.reason && <span className="text-slate-400 font-normal"> — {l.reason}</span>}
                  </span>
                  <button type="button" onClick={() => removeLeave(l.id)} disabled={removingId === l.id} aria-label={t("removeDate")}
                    className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 flex-shrink-0 disabled:opacity-60">
                    {removingId === l.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input type="date" className="input-field flex-1" min={todayIso} max={maxIso} value={date}
              onChange={(e) => { setDate(e.target.value); setError(""); setNotice(""); }} />
            <input type="text" className="input-field flex-1" placeholder={t("reasonOptional")} value={reason}
              onChange={(e) => setReason(e.target.value)} />
            <button type="button" onClick={() => addLeave()} disabled={!date || adding}
              className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 disabled:opacity-60">
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} {t("add")}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
          {notice && <p className="text-xs text-emerald-600 mt-1.5">{notice}</p>}
        </>
      )}

      {affected && (
        <ConfirmDialog
          icon={CalendarOff}
          title={t("leaveConfirmTitle", { count: affected.length, date: formatLeaveDate(date, locale) })}
          message={
            <>
              <p>{t("leaveConfirmBody")}</p>
              <AffectedBookingList bookings={affected} />
            </>
          }
          confirmLabel={t("leaveConfirm")}
          busyLabel={t("cancelling")}
          tone="danger"
          busy={adding}
          onCancel={() => setAffected(null)}
          onConfirm={() => addLeave(affected.map((b) => b.id))}
        />
      )}
    </div>
  );
}

function ClinicCard({ clinic, index, onChange, onSave, onDelete }: {
  clinic: ClinicForm;
  index: number;
  onChange: (next: ClinicForm) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("doctorAccount.clinics");
  const tDays = useTranslations("booking.common.days");
  const set = <K extends keyof ClinicForm>(key: K, value: ClinicForm[K]) =>
    onChange({ ...clinic, [key]: value, saved: false });

  const useCurrentLocation = () => {
    if (!isNative() && !navigator.geolocation) return;
    getCurrentPositionCompat().then((pos) => {
      onChange({
        ...clinic,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        address: clinic.address || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        saved: false,
      });
    });
  };

  const toggleDay = (groupIdx: number, day: string) => {
    const slotGroups = clinic.slotGroups.map((g, i) => {
      if (i !== groupIdx) return g;
      return { ...g, days: g.days.includes(day) ? g.days.filter((d) => d !== day) : [...g.days, day] };
    });
    set("slotGroups", slotGroups);
  };

  const updateGroup = (groupIdx: number, patch: Partial<SlotGroup>) => {
    set("slotGroups", clinic.slotGroups.map((g, i) => (i === groupIdx ? { ...g, ...patch } : g)));
  };

  const addGroup = () => set("slotGroups", [...clinic.slotGroups, { days: [], fromTime: "09:00", toTime: "18:00" }]);
  const removeGroup = (groupIdx: number) => set("slotGroups", clinic.slotGroups.filter((_, i) => i !== groupIdx));

  const hasAnySlot = clinic.slotGroups.some((g) => g.days.length > 0);
  const missingAddress = !clinic.address.trim();
  const missingLocation = clinic.lat == null || clinic.lng == null;
  const missingSlot = !hasAnySlot;
  const canSave = !missingAddress && !missingLocation && !missingSlot;

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 text-xs font-extrabold flex items-center justify-center flex-shrink-0">
            {index + 1}
          </span>
          <h3 className="font-bold text-slate-800 truncate">{clinic.name || t("newClinic")}</h3>
          {canSave ? (
            <span className="badge badge-success text-[10px] flex-shrink-0"><CheckCircle2 className="w-3 h-3" /> {t("ready")}</span>
          ) : (
            <span className="badge badge-warning text-[10px] flex-shrink-0">{t("incomplete")}</span>
          )}
        </div>
        <button type="button" onClick={onDelete} title={t("deleteClinicTitle")} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="input-label">{t("clinicName")} <span className="text-slate-400 font-normal normal-case">{t("optional")}</span></label>
        <input className="input-field" placeholder={t("clinicNamePlaceholder")} value={clinic.name}
          onChange={(e) => set("name", e.target.value)} />
        <p className="text-xs text-slate-400 mt-1">{t("clinicNameHint")}</p>
      </div>

      <div>
        <label className="input-label">{t("photo")} <span className="text-slate-400 font-normal normal-case">{t("optional")}</span></label>
        <ClinicPhotoUpload url={clinic.photoUrl} onUploaded={(url) => set("photoUrl", url)} />
      </div>

      <div>
        <label className="input-label">{t("address")} <span className="text-red-500">*</span></label>
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <AddressAutocomplete
              placeholder={t("addressPlaceholder")}
              value={clinic.address}
              onChange={(v) => set("address", v)}
              onSelect={(s) => onChange({ ...clinic, address: s.label, lat: s.lat, lng: s.lon, saved: false })}
            />
          </div>
          <button type="button" onClick={useCurrentLocation} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 self-start">
            <Navigation className="w-3.5 h-3.5" /> {t("useCurrent")}
          </button>
        </div>
        {missingAddress && (
          <p className="text-xs text-red-600 font-semibold mb-2">{t("addressRequired")}</p>
        )}
        <label className="input-label">{t("pinLocation")} <span className="text-red-500">*</span></label>
        <LocationPickerMap lat={clinic.lat} lng={clinic.lng}
          onChange={(lat, lng) => onChange({ ...clinic, lat, lng, saved: false })} height={220} />
        {clinic.lat != null && clinic.lng != null ? (
          <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1 mt-1.5">
            <MapPin className="w-3.5 h-3.5" /> {t("locationSet", { coords: `${clinic.lat.toFixed(4)}, ${clinic.lng.toFixed(4)}` })}
          </p>
        ) : (
          <p className="text-xs text-red-600 font-semibold mt-1.5">{t("noLocation")}</p>
        )}
      </div>

      <div>
        <label className="input-label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("availability")} <span className="text-red-500">*</span></label>
        {missingSlot && (
          <p className="text-xs text-red-600 font-semibold mt-1">{t("slotRequired")}</p>
        )}
        <div className="space-y-3 mt-2">
          {clinic.slotGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button key={d} type="button" onClick={() => toggleDay(groupIdx, d)}
                    className={cn("px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      group.days.includes(d) ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    )}>
                    {tDays(d)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="input-label">{t("from")}</label>
                  <input type="time" className="input-field" value={group.fromTime}
                    onChange={(e) => updateGroup(groupIdx, { fromTime: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="input-label">{t("to")}</label>
                  <input type="time" className="input-field" value={group.toTime}
                    onChange={(e) => updateGroup(groupIdx, { toTime: e.target.value })} />
                </div>
                {clinic.slotGroups.length > 1 && (
                  <button type="button" onClick={() => removeGroup(groupIdx)} aria-label={t("removeRange")}
                    className="text-red-400 hover:text-red-600 p-1.5 mt-4 rounded-lg hover:bg-red-50 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addGroup} className="btn-secondary mt-2.5 py-1.5 px-3 text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> {t("addRange")}
        </button>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {t("midnightHint")}
        </p>
      </div>

      {clinic.id && <ClinicLeaveManager clinicId={clinic.id} />}

      {clinic.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{clinic.error}</p>}

      <button type="button" disabled={!canSave || clinic.saving} onClick={onSave}
        className="btn-primary w-full justify-center py-2.5 text-sm">
        {clinic.saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("saving")}</> : clinic.saved ? <><CheckCircle2 className="w-4 h-4" /> {t("saved")}</> : <><Save className="w-4 h-4" /> {t("saveClinic")}</>}
      </button>
    </section>
  );
}

export default function DoctorClinicsPage() {
  const t = useTranslations("doctorAccount.clinics");
  const cancelledNotice = useCancelledNotice();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Set when the API says the clinic being deleted still has open bookings.
  const [deleteBookings, setDeleteBookings] = useState<AffectedBooking[] | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [pageNotice, setPageNotice] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/doctor/clinics");
    if (!authLoading && user && user.role !== "DOCTOR") router.push("/login");
  }, [authLoading, user, router]);

  // Load once per authenticated doctor. Keyed on user.id, NOT the whole `user`
  // object — AuthProvider re-polls every 30s and hands back a fresh `user`
  // reference each time, and refetching here would blow away any unsaved clinic
  // rows the doctor is still editing.
  useEffect(() => {
    if (!user || user.role !== "DOCTOR") return;
    let cancelled = false;
    fetch("/api/doctors/me/clinics")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClinicApiShape[]) => {
        if (cancelled) return;
        setClinics(data.map((c) => ({
          uid: makeUid(),
          id: c.id, name: c.name, address: c.address, photoUrl: c.photoUrl, lat: c.lat, lng: c.lng,
          slotGroups: c.slots.length ? groupSlots(c.slots) : [{ days: [], fromTime: "09:00", toTime: "18:00" }],
          saving: false, saved: false, error: "",
        })));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const updateAt = (idx: number, next: ClinicForm) =>
    setClinics((cur) => cur.map((c, i) => (i === idx ? next : c)));

  const addClinic = () => setClinics((cur) => [...cur, newClinic()]);

  // Returns true once the card is gone. A clinic with open bookings comes
  // back 409 CLINIC_HAS_BOOKINGS first; the dialog then lists them and the
  // second call (with their ids) cancels + refunds them and deletes it.
  const deleteClinic = async (idx: number, confirmBookingIds?: string[]) => {
    const clinic = clinics[idx];
    setDeleteError("");
    if (clinic.id) {
      const res = await fetch(`/api/doctors/me/clinics/${clinic.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmBookingIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.code === "CLINIC_HAS_BOOKINGS") {
        setDeleteBookings(body.bookings);
        return false;
      }
      if (!res.ok) {
        setDeleteBookings(null);
        setDeleteError(body.error ?? t("deleteFailed"));
        return false;
      }
      setPageNotice(body.cancelledBookings > 0 ? cancelledNotice(body.cancelledBookings, body.refundTotal) : "");
    }
    setClinics((cur) => cur.filter((_, i) => i !== idx));
    return true;
  };

  const closeDeleteDialog = () => {
    setDeleteIdx(null);
    setDeleteBookings(null);
    setDeleteError("");
  };

  // A brand-new, never-saved card (no `id` yet) is just an empty draft — no
  // confirmation needed to discard it. Only a clinic that's actually saved
  // (and therefore live on the patient-facing map) needs a confirm gate.
  const requestDeleteClinic = (idx: number) => {
    if (clinics[idx].id) setDeleteIdx(idx);
    else deleteClinic(idx);
  };

  const saveClinic = async (idx: number) => {
    const clinic = clinics[idx];
    updateAt(idx, { ...clinic, saving: true, error: "" });

    const slots: Slot[] = clinic.slotGroups.flatMap((g) =>
      g.days.map((dayOfWeek) => ({ dayOfWeek, fromTime: g.fromTime, toTime: g.toTime }))
    );
    const payload = {
      name: clinic.name.trim(), address: clinic.address.trim(),
      photoUrl: clinic.photoUrl, lat: clinic.lat, lng: clinic.lng, slots,
    };

    const res = clinic.id
      ? await fetch(`/api/doctors/me/clinics/${clinic.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        })
      : await fetch("/api/doctors/me/clinics", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });

    if (res.ok) {
      const saved: ClinicApiShape = await res.json();
      updateAt(idx, { ...clinic, id: saved.id, saving: false, saved: true, error: "" });
    } else {
      const err = await res.json().catch(() => ({}));
      updateAt(idx, { ...clinic, saving: false, saved: false, error: err.error ?? t("saveFailed") });
    }
  };

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
    </div>;
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <DoctorHeader />
      <DoctorMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {pageNotice && (
          <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{pageNotice}</p>
        )}

        <div className="space-y-6">
          {clinics.map((clinic, idx) => (
            <ClinicCard
              key={clinic.uid}
              clinic={clinic}
              index={idx}
              onChange={(next) => updateAt(idx, next)}
              onSave={() => saveClinic(idx)}
              onDelete={() => requestDeleteClinic(idx)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addClinic}
          className="w-full flex items-center justify-center gap-1.5 mt-6 py-3.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 text-sm font-semibold hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/50 transition-colors"
        >
          <Plus className="w-4 h-4" /> {t("addClinic")}
        </button>

        <div className="flex justify-end mt-6">
          <Link href="/doctor/dashboard" className={clinics.some((c) => c.id) ? "btn-primary gap-1.5 text-sm" : "btn-secondary gap-1.5 text-sm"}>
            {t("continue")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {deleteIdx !== null && (
        <ConfirmDialog
          icon={Trash2}
          title={deleteBookings
            ? t("deleteWithBookingsTitle", { count: deleteBookings.length, clinic: clinics[deleteIdx].name || t("thisClinic") })
            : t("deleteTitle", { clinic: clinics[deleteIdx].name || t("thisClinic") })}
          message={
            <>
              {deleteBookings ? (
                <>
                  <p>{t("deleteWithBookingsBody")}</p>
                  <AffectedBookingList bookings={deleteBookings} showDate />
                </>
              ) : (
                <p>{t("deleteBody")}</p>
              )}
              {deleteError && <p className="mt-3 text-xs text-red-600">{deleteError}</p>}
            </>
          }
          confirmLabel={deleteBookings ? t("deleteWithBookingsConfirm") : t("deleteConfirm")}
          busyLabel={t("deleting")}
          tone="danger"
          busy={deleting}
          onCancel={closeDeleteDialog}
          onConfirm={async () => {
            setDeleting(true);
            const gone = await deleteClinic(deleteIdx, deleteBookings?.map((b) => b.id));
            setDeleting(false);
            if (gone) closeDeleteDialog();
          }}
        />
      )}
    </div>
  );
}
