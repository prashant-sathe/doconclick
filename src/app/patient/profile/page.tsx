"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, MapPin, Droplets, Ruler, Weight, AlertTriangle, Pill,
  Scissors, PhoneCall, Camera, CheckCircle2, ArrowRight, Save, UploadCloud, User, Trash2,
  Wallet as WalletIcon, LifeBuoy,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { computeCompleteness, type PatientProfileData } from "@/lib/profileCompleteness";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import NotificationSettings from "@/components/NotificationSettings";
import ImageCropModal from "@/components/ImageCropModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import AddressAutocomplete from "@/components/patient/AddressAutocomplete";
import { CHRONIC_OPTIONS, BLOOD_GROUPS } from "@/lib/medicalOptions";
import { computeBMI, bmiCategoryClasses } from "@/lib/bmi";
import { isNative, getCurrentPositionCompat } from "@/lib/platform";

interface FormState {
  location: string;
  homeAddress: string;
  landmark: string;
  pinCode: string;
  bloodGroup: string;
  height: string;
  weight: string;
  allergies: string;
  chronicDiseases: string[];
  otherChronicText: string;
  medications: string;
  surgeries: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  photoUrl: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY_FORM: FormState = {
  location: "", homeAddress: "", landmark: "", pinCode: "", bloodGroup: "",
  height: "", weight: "", allergies: "", chronicDiseases: [], otherChronicText: "", medications: "",
  surgeries: "", emergencyContactName: "", emergencyContactPhone: "", photoUrl: "",
  lat: null, lng: null,
};

function CompletionRing({ percent }: { percent: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={percent === 100 ? "#10b981" : "#2563eb"}
          strokeWidth="8" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-extrabold text-slate-900">{percent}%</span>
      </div>
    </div>
  );
}

function PhotoUpload({ url, onUploaded }: { url: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (fileOrBlob: File | Blob) => {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", fileOrBlob, "photo.jpg");
    const res = await fetch("/api/patients/me/photo", { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      onUploaded(data.photoUrl);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/patients/me/photo", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      onUploaded("");
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not remove.");
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-200">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <User className="w-7 h-7 text-slate-300" />
        )}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <label className="btn-secondary py-1.5 px-3 text-xs cursor-pointer inline-flex">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {url ? "Replace Photo" : "Upload Photo"}
            <input type="file" accept="image/jpeg,image/png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
          </label>
          {url && (
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-60" title="Remove">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1.5">JPG or PNG, up to 5MB.</p>
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
      {confirmRemove && (
        <ConfirmDialog
          icon={Trash2}
          title="Remove profile photo?"
          message="You can upload a new one anytime."
          confirmLabel="Remove"
          busyLabel="Removing…"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => {
            await remove();
            setConfirmRemove(false);
          }}
        />
      )}
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={1}
          round
          onCancel={() => setPendingFile(null)}
          onConfirm={(blob) => { setPendingFile(null); upload(blob); }}
        />
      )}
    </div>
  );
}

export default function PatientProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [pinCodeError, setPinCodeError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/login?next=/patient/profile");
    if (!authLoading && user && user.role !== "PATIENT") router.push("/login");
  }, [authLoading, user, router]);

  // Load once per authenticated patient — keyed on user.id, not the whole
  // `user` object (AuthProvider re-polls every 30s and returns a fresh
  // reference; refetching would overwrite whatever the patient is typing).
  useEffect(() => {
    if (!user || user.role !== "PATIENT") return;
    let cancelled = false;
    fetch("/api/patients/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const p = d.patientProfile ?? {};
        setForm({
          location: p.location ?? "",
          homeAddress: p.homeAddress ?? "",
          landmark: p.landmark ?? "",
          pinCode: p.pinCode ?? "",
          bloodGroup: p.bloodGroup ?? "",
          height: p.height != null ? String(p.height) : "",
          weight: p.weight != null ? String(p.weight) : "",
          allergies: p.allergies ?? "",
          ...(() => {
            const loaded: string[] = p.chronicDiseases ? p.chronicDiseases.split(",").filter(Boolean) : [];
            const known = new Set(CHRONIC_OPTIONS);
            const custom = loaded.find((x) => !known.has(x));
            return {
              chronicDiseases: custom ? [...loaded.filter((x) => known.has(x)), "Other"] : loaded,
              otherChronicText: custom ?? "",
            };
          })(),
          medications: p.medications ?? "",
          surgeries: p.surgeries ?? "",
          emergencyContactName: p.emergencyContactName ?? "",
          emergencyContactPhone: p.emergencyContactPhone ?? "",
          photoUrl: p.photoUrl ?? "",
          lat: p.lat ?? null,
          lng: p.lng ?? null,
        });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const set = (k: keyof FormState, v: string) => { setSaved(false); setForm((f) => ({ ...f, [k]: v })); };
  const toggleChronic = (o: string) => {
    setSaved(false);
    setForm((f) => {
      const nowSelected = f.chronicDiseases.includes(o);
      return {
        ...f,
        chronicDiseases: nowSelected
          ? f.chronicDiseases.filter((x) => x !== o)
          : [...f.chronicDiseases, o],
        otherChronicText: o === "Other" && nowSelected ? "" : f.otherChronicText,
      };
    });
  };

  const [locatingGPS, setLocatingGPS] = useState(false);

  const getGPS = () => {
    if (!isNative() && !navigator.geolocation) return;
    setLocatingGPS(true);
    getCurrentPositionCompat()
      .then(async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        let pinCode: string | null = null;
        try {
          const res = await fetch(`/api/geocode/reverse?lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data.label) address = data.label;
          if (data.pinCode) pinCode = data.pinCode;
        } catch {
          // fall back to raw coordinates
        }
        setSaved(false);
        setForm((f) => ({
          ...f,
          location: address,
          homeAddress: address,
          pinCode: pinCode ?? f.pinCode,
          lat: latitude,
          lng: longitude,
        }));
        setLocatingGPS(false);
      })
      .catch(() => setLocatingGPS(false));
  };

  const bmi = computeBMI(Number(form.height), Number(form.weight));

  const serializedChronic = form.chronicDiseases
    .map((o) => (o === "Other" ? form.otherChronicText.trim() : o))
    .filter(Boolean)
    .join(",");

  const completenessInput: PatientProfileData = {
    location: form.location || null,
    homeAddress: form.homeAddress || null,
    pinCode: form.pinCode || null,
    bloodGroup: form.bloodGroup || null,
    height: form.height ? Number(form.height) : null,
    weight: form.weight ? Number(form.weight) : null,
    allergies: form.allergies || null,
    chronicDiseases: serializedChronic || null,
    emergencyContactName: form.emergencyContactName || null,
    emergencyContactPhone: form.emergencyContactPhone || null,
    photoUrl: form.photoUrl || null,
  };
  const completeness = computeCompleteness(completenessInput);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    if (!form.homeAddress.trim()) {
      setAddressError("Home address is required.");
      hasError = true;
    } else {
      setAddressError("");
    }
    if (!/^\d{6}$/.test(form.pinCode.trim())) {
      setPinCodeError("A valid 6-digit PIN code is required.");
      hasError = true;
    } else {
      setPinCodeError("");
    }
    if (hasError) return;
    setSaving(true);
    setSaveError("");
    const res = await fetch("/api/patients/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        chronicDiseases: serializedChronic,
        height: form.height || null,
        weight: form.weight || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveError(data.error ?? "Could not save your profile. Please try again.");
    }
  };

  if (authLoading || loading || !user) {
    return <div className="min-h-screen gradient-surface flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>;
  }

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Completion header */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 flex items-center gap-5">
          <CompletionRing percent={completeness.percent} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {completeness.percent === 100 ? "Your profile is complete!" : "Complete your health profile"}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {completeness.completedCount} of {completeness.totalCount} sections done
              {completeness.percent < 100 && " — helps doctors treat you faster."}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {completeness.items.filter((i) => !i.done).slice(0, 3).map((i) => (
                <span key={i.label} className="badge badge-warning">{i.label}</span>
              ))}
            </div>
          </div>
        </div>

        <Link
          href="/patient/wallet"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex items-center gap-3 hover:border-emerald-200 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <WalletIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">Wallet</p>
            <p className="text-xs text-slate-400">Add money, pay for appointments, view transactions</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        </Link>

        <Link
          href="/patient/support"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex items-center gap-3 hover:border-blue-200 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <LifeBuoy className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">Help &amp; Support</p>
            <p className="text-xs text-slate-400">Raise an issue and track its status</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        </Link>

        <div className="flex justify-end mb-6">
          <Link href="/patient/dashboard" className="btn-secondary gap-1.5 text-sm">
            Continue to Find a Doctor <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Address */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-500" /> Location & Address</h2>
            <div className="space-y-4">
              <div>
                <label className="input-label">Current Location</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AddressAutocomplete
                      placeholder="Search city, area or society…"
                      value={form.location}
                      onChange={(v) => set("location", v)}
                    />
                  </div>
                  <button type="button" onClick={getGPS} disabled={locatingGPS} className="btn-secondary flex-shrink-0 px-3 text-xs gap-1 self-start disabled:opacity-60">
                    {locatingGPS ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                    {locatingGPS ? "Locating…" : "GPS"}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">Tap GPS to fill your address from your current location.</p>
              </div>
              <div>
                <label className="input-label">Home Address <span className="text-red-500">*</span></label>
                <AddressAutocomplete
                  multiline
                  placeholder="Flat/House No., Street, Area, Society"
                  value={form.homeAddress}
                  onChange={(v) => set("homeAddress", v)}
                />
                {addressError && <p className="text-xs text-red-500 mt-1">{addressError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Landmark</label>
                  <input className="input-field" placeholder="e.g. Near Metro Station" value={form.landmark} onChange={(e) => set("landmark", e.target.value)} />
                </div>
                <div>
                  <label className="input-label">PIN Code <span className="text-red-500">*</span></label>
                  <input className="input-field" placeholder="400001" maxLength={6} value={form.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
                  {pinCodeError && <p className="text-xs text-red-500 mt-1">{pinCodeError}</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Medical Info */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Droplets className="w-4 h-4 text-red-500" /> Medical Information</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="input-label"><Droplets className="inline w-3.5 h-3.5 mr-1" />Blood Group</label>
                  <select className="input-field" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                    <option value="">Select…</option>
                    {BLOOD_GROUPS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="input-label"><Ruler className="inline w-3.5 h-3.5 mr-1" />Height (cm)</label>
                  <input type="number" className="input-field" placeholder="170" value={form.height} onChange={(e) => set("height", e.target.value)} />
                </div>
                <div>
                  <label className="input-label"><Weight className="inline w-3.5 h-3.5 mr-1" />Weight (kg)</label>
                  <input type="number" className="input-field" placeholder="70" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
                </div>
              </div>
              {bmi && (
                <div className={cn("rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-between", bmiCategoryClasses(bmi.category))}>
                  <span>BMI: {bmi.value}</span>
                  <span>{bmi.category}</span>
                </div>
              )}
              <div>
                <label className="input-label">Chronic Conditions</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CHRONIC_OPTIONS.map((o) => (
                    <button key={o} type="button" onClick={() => toggleChronic(o)}
                      className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        form.chronicDiseases.includes(o) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      )}>
                      {o}
                    </button>
                  ))}
                </div>
                {form.chronicDiseases.includes("Other") && (
                  <input
                    className="input-field mt-2"
                    placeholder="Please specify"
                    value={form.otherChronicText}
                    onChange={(e) => set("otherChronicText", e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="input-label"><AlertTriangle className="inline w-3.5 h-3.5 mr-1" />Known Allergies</label>
                <input className="input-field" placeholder="e.g. Penicillin, Dust, Peanuts (or 'None')" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Pill className="inline w-3.5 h-3.5 mr-1" />Current Medications (optional)</label>
                <input className="input-field" placeholder="e.g. Metformin 500mg" value={form.medications} onChange={(e) => set("medications", e.target.value)} />
              </div>
              <div>
                <label className="input-label"><Scissors className="inline w-3.5 h-3.5 mr-1" />Previous Surgeries (optional)</label>
                <input className="input-field" placeholder="e.g. Appendectomy 2018" value={form.surgeries} onChange={(e) => set("surgeries", e.target.value)} />
              </div>
            </div>
          </section>

          {/* Emergency Contact */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PhoneCall className="w-4 h-4 text-emerald-500" /> Emergency Contact</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Contact Name</label>
                <input className="input-field" placeholder="e.g. Priya Sharma" value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
              </div>
              <div>
                <label className="input-label">Mobile Number</label>
                <input className="input-field" placeholder="9800000000" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
              </div>
            </div>
          </section>

          {/* Photo */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Camera className="w-4 h-4 text-purple-500" /> Profile Photo</h2>
            <PhotoUpload url={form.photoUrl} onUploaded={(url) => set("photoUrl", url)} />
          </section>

          <NotificationSettings />

          {saveError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{saveError}</div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3.5 text-base">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Profile</>}
          </button>
        </form>
      </div>
    </div>
  );
}
