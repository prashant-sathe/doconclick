"use client";
import { useEffect, useRef, useState } from "react";
import {
  User, Camera, Loader2, Trash2, Lock, Eye, EyeOff, Check, AlertCircle, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation";
import EditableName from "@/components/EditableName";
import ImageCropModal from "@/components/ImageCropModal";
import ConfirmDialog from "@/components/ConfirmDialog";

function AvatarEditor({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const upload = async (blob: Blob) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    const res = await fetch("/api/admin/me/photo", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onChange((await res.json()).photoUrl ?? "");
  };

  const remove = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/me/photo", { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChange("");
  };

  const onAvatarClick = () => {
    if (url) setMenuOpen((v) => !v);
    else inputRef.current?.click();
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onAvatarClick}
        className="relative w-16 h-16 rounded-full block overflow-hidden bg-slate-100 border border-slate-200"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <User className="w-7 h-7 text-slate-300 absolute inset-0 m-auto" />
        )}
        <span className="absolute bottom-0 inset-x-0 h-6 bg-black/35 flex items-center justify-center">
          {busy ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <Camera className="w-3 h-3 text-white" />}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }}
      />
      {menuOpen && (
        <div className="absolute left-0 top-full mt-2 z-20 w-44 rounded-xl bg-white border border-slate-100 shadow-lg py-1 overflow-hidden">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 text-left"
          >
            <Camera className="w-4 h-4 text-slate-400" /> Change photo
          </button>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setConfirmRemove(true); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 text-left"
          >
            <Trash2 className="w-4 h-4" /> Remove photo
          </button>
        </div>
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
          onConfirm={async () => { await remove(); setConfirmRemove(false); }}
        />
      )}
    </div>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);

    if (res.ok) {
      setPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not update your password.");
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">
          <Lock className="w-5 h-5" />
        </div>
        <h2 className="font-bold text-slate-800">Change Password</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="input-label">New Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="input-field pr-11"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); setSuccess(false); }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="input-label">Confirm Password</label>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            className="input-field"
            placeholder="Repeat password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(""); setSuccess(false); }}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1.5 mb-3">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-600 flex items-center gap-1.5 mb-3">
          <Check className="w-3.5 h-3.5" /> Password updated.
        </p>
      )}

      <button type="submit" disabled={saving || !password || !confirmPassword} className="btn-primary py-2.5 px-4">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saving ? "Saving…" : "Update Password"}
      </button>
    </form>
  );
}

export default function AdminProfile() {
  const { user, refresh } = useAuth();
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => { setPhotoUrl(d?.photoUrl ?? ""); setLoading(false); });
  }, []);

  if (!user) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your own admin account.</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center gap-4">
          {loading ? (
            <div className="skeleton w-16 h-16 rounded-full flex-shrink-0" />
          ) : (
            <AvatarEditor url={photoUrl} onChange={setPhotoUrl} />
          )}
          <div className="min-w-0">
            <EditableName name={user.name} onSaved={refresh} />
            <p className="text-sm text-slate-500 mt-0.5">{user.mobile}</p>
          </div>
        </div>

        <ChangePassword />

        <div className="flex items-start gap-2.5 text-xs text-slate-400 px-1">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Changes here apply only to your own account. To manage other admins, go to Settings → Admin Users.
        </div>
      </div>
    </div>
  );
}
