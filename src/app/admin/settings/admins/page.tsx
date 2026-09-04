"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "@/components/AuthProvider";

interface AdminRow {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  createdAt: string;
}

export default function AdminAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = () => {
    fetch("/api/admin/admins")
      .then((r) => r.json())
      .then((d) => { setAdmins(Array.isArray(d) ? d : []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mobile, email, password }),
    });
    setAdding(false);
    if (res.ok) {
      setName(""); setMobile(""); setEmail(""); setPassword("");
      load();
    } else {
      setAddError((await res.json().catch(() => ({}))).error ?? "Could not create admin.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/admins/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setDeleteTarget(null);
      load();
    } else {
      setDeleteError((await res.json().catch(() => ({}))).error ?? "Could not remove admin.");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Settings
        </Link>
        <h1 className="text-2xl font-extrabold text-slate-900">Admin Users</h1>
        <p className="text-slate-500 text-sm mt-1">Create and manage accounts with full access to this admin panel.</p>
      </div>

      <form onSubmit={addAdmin} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="input-label">Full Name</label>
            <input className="input-field" placeholder="e.g. Priya Sharma" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Mobile Number</label>
            <input className="input-field" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Email (optional)</label>
            <input className="input-field" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Password</label>
            <input className="input-field" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        {addError && (
          <span className="text-sm text-red-500 flex items-center gap-1 mb-3">
            <AlertCircle className="w-3.5 h-3.5" /> {addError}
          </span>
        )}
        <button type="submit" disabled={adding || !name.trim() || !mobile.trim() || !password.trim()} className="btn-primary py-2.5 px-4">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Admin
        </button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No admin accounts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{a.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {a.name} {a.id === user?.id && <span className="badge badge-gray ml-1">You</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{a.mobile}{a.email ? ` · ${a.email}` : ""}</div>
                  </div>
                </div>
                {a.id !== user?.id && (
                  <button
                    onClick={() => { setDeleteTarget(a); setDeleteError(""); }}
                    className="btn-secondary py-1.5 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          title={`Remove ${deleteTarget.name}?`}
          message={
            <>
              They will immediately lose access to the admin panel.
              {deleteError && (
                <span className="block text-red-500 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {deleteError}
                </span>
              )}
            </>
          }
          confirmLabel="Remove Admin"
          busyLabel="Removing…"
          tone="danger"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
