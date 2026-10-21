"use client";
import { useEffect, useState } from "react";
import { Users, UserPlus, Eye, EyeOff, KeyRound, Ban, RotateCcw, Loader2, Pencil, Trash2 } from "lucide-react";
import DoctorProfileSubShell from "@/components/doctor/DoctorProfileSubShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";

interface StaffAccount {
  userId: string;
  name: string;
  mobile: string;
  active: boolean;
  createdAt: string;
}

export default function DoctorStaffPage() {
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adding, setAdding] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  // The inline form open under one row: a new password, or a new name.
  const [panel, setPanel] = useState<{ id: string; kind: "reset" | "rename" } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const openPanel = (s: StaffAccount, kind: "reset" | "rename") => {
    setError("");
    if (panel?.id === s.userId && panel.kind === kind) { setPanel(null); return; }
    setPanel({ id: s.userId, kind });
    setResetPassword("");
    setNewName(s.name);
  };

  const load = () => {
    fetch("/api/doctor/staff")
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaff)
      .catch(() => setStaff([]));
  };
  useEffect(load, []);

  const addStaff = async () => {
    setError("");
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setAdding(true);
    const res = await fetch("/api/doctor/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mobile, password }),
    });
    setAdding(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not create this staff account.");
      return;
    }
    setName(""); setMobile(""); setPassword("");
    load();
  };

  const toggleActive = async (s: StaffAccount) => {
    setBusyId(s.userId);
    const res = await fetch(`/api/doctor/staff/${s.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    setBusyId(null);
    if (res.ok) load();
    else setError((await res.json().catch(() => ({}))).error ?? "Could not update this staff account.");
  };

  const submitRename = async (userId: string) => {
    setError("");
    setBusyId(userId);
    const res = await fetch(`/api/doctor/staff/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setBusyId(null);
    if (res.ok) {
      setPanel(null);
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not rename this staff account.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/doctor/staff/${deleteTarget.userId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      setPanel(null);
      load();
    } else {
      setDeleteTarget(null);
      setError((await res.json().catch(() => ({}))).error ?? "Could not delete this staff account.");
    }
  };

  const submitReset = async (userId: string) => {
    if (resetPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setError("");
    setBusyId(userId);
    const res = await fetch(`/api/doctor/staff/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    setBusyId(null);
    if (res.ok) {
      setPanel(null);
      setResetPassword("");
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not reset the password.");
    }
  };

  return (
    <DoctorProfileSubShell
      title="Staff Access"
      description="Give front-desk staff their own login to manage your appointment queue — accept, reject, and mark no-shows. They never see earnings, payouts, or your profile."
      icon={<Users className="w-5 h-5" />}
      tint="bg-cyan-50 text-cyan-600"
      loading={staff === null}
      error={error}
    >
      {staff && staff.length > 0 && (
        <div className="divide-y divide-slate-100 -mx-5 sm:-mx-6 -mt-1">
          {staff.map((s) => (
            <div key={s.userId} className="px-5 sm:px-6 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.mobile} · {s.active ? "Active" : "Revoked"}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openPanel(s, "rename")}
                    title="Rename"
                    aria-label={`Rename ${s.name}`}
                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openPanel(s, "reset")}
                    title="Reset password"
                    aria-label={`Reset password for ${s.name}`}
                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-50"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(s)}
                    disabled={busyId === s.userId}
                    title={s.active ? "Revoke access" : "Reactivate"}
                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === s.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : s.active ? <Ban className="w-4 h-4 text-red-500" /> : <RotateCcw className="w-4 h-4 text-emerald-500" />}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    title="Delete"
                    aria-label={`Delete ${s.name}`}
                    className="w-9 h-9 rounded-lg border border-slate-100 flex items-center justify-center text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {panel?.id === s.userId && panel.kind === "rename" && (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRename(s.userId); }}
                    placeholder="Full name"
                    className="input-field flex-1 text-sm"
                    autoFocus
                  />
                  <button onClick={() => submitRename(s.userId)} disabled={busyId === s.userId || !newName.trim() || newName.trim() === s.name} className="btn-primary py-2 px-3 text-xs disabled:opacity-60">
                    Save
                  </button>
                </div>
              )}
              {panel?.id === s.userId && panel.kind === "reset" && (
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="New password"
                    className="input-field flex-1 text-sm"
                  />
                  <button onClick={() => submitReset(s.userId)} disabled={busyId === s.userId} className="btn-primary py-2 px-3 text-xs">
                    Set
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={staff && staff.length > 0 ? "pt-4 mt-1 border-t border-slate-100" : ""}>
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4 text-slate-400" /> Add Staff
        </p>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="input-field w-full" />
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number" className="input-field w-full" />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a password"
              className="input-field w-full pr-10"
            />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={addStaff}
            disabled={adding || !name || !mobile || !password}
            className="btn-primary w-full justify-center py-2.5 disabled:opacity-60"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add Staff
          </button>
          <p className="text-xs text-slate-400">Share this mobile number and password with your staff member directly — they&apos;ll use it to sign in.</p>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          title={`Delete ${deleteTarget.name}?`}
          message="They're signed out everywhere and can't sign in again. Messages they sent stay in your patients' chats. To pause their access instead, use Revoke."
          confirmLabel="Delete"
          busyLabel="Deleting…"
          tone="danger"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </DoctorProfileSubShell>
  );
}
