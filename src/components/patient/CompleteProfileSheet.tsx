"use client";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User, Calendar, X, Loader2, UserCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { patchPatientProfile } from "@/lib/usePatientProfile";
import { nameError } from "@/lib/validation";
import { GENDERS, ageFromDob, isValidAge, missingProfileFields, type MissingProfileField } from "@/lib/bookingProfile";

// Quick signup only asks for mobile + password, so the first booking is
// where name / date of birth / gender get collected. Booking pages call
// `gate.run(forDependent, continueBooking)`: if the profile is already
// complete the continuation runs straight away, otherwise this sheet asks
// for just the missing fields and continues the booking once saved.
//
// `gate.open(missing, continueBooking)` is the fallback for when the
// appointments API itself answers PROFILE_INCOMPLETE.
export function useBookingProfileGate() {
  const { refresh } = useAuth();
  const [missing, setMissing] = useState<MissingProfileField[] | null>(null);
  const continuation = useRef<(() => void) | null>(null);
  // Once a full check passes there's nothing left to collect this session.
  const knownComplete = useRef(false);

  const open = useCallback((fields: MissingProfileField[], onDone: () => void) => {
    knownComplete.current = false;
    continuation.current = onDone;
    setMissing(fields);
  }, []);

  const run = useCallback(async (forDependent: boolean, onDone: () => void) => {
    if (knownComplete.current) { onDone(); return; }
    let fields: MissingProfileField[] = [];
    try {
      const res = await fetch("/api/patients/me");
      if (res.ok) {
        const me = await res.json();
        fields = missingProfileFields(me.name, me.patientProfile, { forDependent });
        if (fields.length === 0 && !forDependent) knownComplete.current = true;
      }
    } catch {
      // Network hiccup — let the booking go ahead; the API enforces the
      // same rule and its PROFILE_INCOMPLETE answer reopens this sheet.
    }
    if (fields.length === 0) onDone();
    else open(fields, onDone);
  }, [open]);

  const close = () => { setMissing(null); continuation.current = null; };

  const sheet = missing && (
    <CompleteProfileSheet
      missing={missing}
      onCancel={close}
      onSaved={async () => {
        const next = continuation.current;
        close();
        await refresh();
        next?.();
      }}
    />
  );

  return { run, open, sheet };
}

function CompleteProfileSheet({
  missing,
  onCancel,
  onSaved,
}: {
  missing: MissingProfileField[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const needName = missing.includes("name");
  const needAge = missing.includes("age");
  const needGender = missing.includes("gender");

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const age = dob ? ageFromDob(dob) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (needName) {
      const err = nameError(name);
      if (err) { setError(err); return; }
    }
    if (needAge && (!dob || new Date(dob) > new Date() || !isValidAge(age))) {
      setError("Enter a valid date of birth.");
      return;
    }
    if (needGender && !gender) { setError("Select a gender."); return; }

    setSaving(true);
    try {
      if (needName) {
        const res = await fetch("/api/auth/name", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save your name.");
      }
      if (needAge || needGender) {
        await patchPatientProfile({
          ...(needAge ? { age } : {}),
          ...(needGender ? { gender } : {}),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={saving ? undefined : onCancel}>
      <form
        onSubmit={save}
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-900">Complete your profile</h3>
          </div>
          <button aria-label="Close" type="button" onClick={onCancel} disabled={saving} className="tap-44 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-5">The doctor needs these details for your consultation. You only have to do this once.</p>

        <div className="space-y-4">
          {needName && (
            <div>
              <label className="input-label"><User className="inline w-3.5 h-3.5 mr-1" />Full Name</label>
              <input autoFocus autoComplete="name" className="input-field" placeholder="John Doe" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
            </div>
          )}
          {needAge && (
            <div>
              <label className="input-label"><Calendar className="inline w-3.5 h-3.5 mr-1" />Date of Birth</label>
              <input type="date" max={new Date().toISOString().slice(0, 10)} className="input-field" value={dob} onChange={(e) => { setDob(e.target.value); setError(""); }} />
              {age != null && isValidAge(age) && <p className="text-xs text-slate-400 mt-1">Age: {age} years</p>}
            </div>
          )}
          {needGender && (
            <div>
              <label className="input-label">Gender</label>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => { setGender(g); setError(""); }}
                    className={`min-h-11 py-2.5 rounded-xl border text-sm font-semibold transition-all ${gender === g ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mt-4">{error}</div>}

        <button type="submit" disabled={saving} className="btn-primary w-full justify-center py-3 mt-5">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save & Continue"}
        </button>
      </form>
    </div>,
    document.body
  );
}
