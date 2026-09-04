"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ImagePlus, Loader2, Plus, Trash2, AlertCircle, X,
  Send, Check, Users, Stethoscope, UserCircle,
} from "lucide-react";

type ButtonRow = { label: string; url: string };

interface AnnouncementDetail {
  id: string;
  title: string;
  message: string;
  bannerImageUrl: string | null;
  buttons: ButtonRow[] | null;
  audience: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  totalRecipients: number;
  seenCount: number;
}

const AUDIENCE_OPTIONS = [
  { value: "PATIENT", label: "Patients" },
  { value: "DOCTOR", label: "Doctors" },
  { value: "BOTH", label: "Both" },
];

const AUDIENCE_ICON: Record<string, typeof Users> = {
  DOCTOR: Stethoscope,
  PATIENT: UserCircle,
  BOTH: Users,
};

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [announcement, setAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("PATIENT");
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [buttons, setButtons] = useState<ButtonRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const load = () => {
    fetch(`/api/admin/announcements/${id}`)
      .then((r) => r.json())
      .then((a: AnnouncementDetail) => {
        setAnnouncement(a);
        setTitle(a.title);
        setMessage(a.message);
        setAudience(a.audience);
        setBannerImageUrl(a.bannerImageUrl);
        setButtons(a.buttons ?? []);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [id]);

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/announcements/upload-banner", { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      const { url } = await res.json();
      setBannerImageUrl(url);
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not upload banner image.");
    }
  };

  const addButton = () => {
    if (buttons.length >= 2) return;
    setButtons([...buttons, { label: "", url: "" }]);
  };
  const updateButton = (i: number, field: keyof ButtonRow, value: string) => {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));
  };
  const removeButton = (i: number) => setButtons(buttons.filter((_, idx) => idx !== i));

  const saveDraft = async () => {
    setError("");
    if (!title.trim() || !message.trim()) {
      setError("Title and message are required.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, audience, bannerImageUrl, buttons }),
    });
    setSaving(false);
    if (res.ok) {
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Could not save changes.");
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/admin/announcements");
    } else {
      setDeleteOpen(false);
    }
  };

  const confirmSend = async () => {
    setSending(true);
    setSendError("");
    const res = await fetch(`/api/admin/announcements/${id}/send`, { method: "POST" });
    setSending(false);
    if (res.ok) {
      setSendOpen(false);
      load();
    } else {
      setSendError((await res.json().catch(() => ({}))).error ?? "Could not send announcement.");
    }
  };

  if (loading || !announcement) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
        <div className="skeleton h-8 w-64 rounded-lg mb-6" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    );
  }

  const isDraft = announcement.status === "DRAFT";
  const AudienceIcon = AUDIENCE_ICON[announcement.audience] ?? Users;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <Link href="/admin/announcements" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Announcements
      </Link>

      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{isDraft ? "Edit Draft" : "Announcement"}</h1>
        <span className={isDraft ? "badge badge-gray" : "badge badge-success"}>{isDraft ? "Draft" : "Sent"}</span>
      </div>

      {!isDraft && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6 flex items-center gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sent</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">
              {new Date(announcement.sentAt!).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Audience</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5 inline-flex items-center gap-1.5">
              <AudienceIcon className="w-3.5 h-3.5" />
              {AUDIENCE_OPTIONS.find((o) => o.value === announcement.audience)?.label}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Delivered</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{announcement.totalRecipients}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Seen</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">{announcement.seenCount}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <label className="input-label">Title</label>
          {isDraft ? (
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} />
          ) : (
            <p className="text-slate-800 font-semibold">{announcement.title}</p>
          )}
        </div>

        <div>
          <label className="input-label">Message</label>
          {isDraft ? (
            <textarea className="input-field" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          ) : (
            <p className="text-slate-600 whitespace-pre-wrap">{announcement.message}</p>
          )}
        </div>

        {(isDraft || announcement.bannerImageUrl) && (
          <div>
            <label className="input-label">Banner Image</label>
            {bannerImageUrl ? (
              <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerImageUrl} alt="Banner" className="w-full h-full object-cover" />
                {isDraft && (
                  <button
                    onClick={() => setBannerImageUrl(null)}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              isDraft && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center gap-2 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors"
                >
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  <span className="text-sm font-medium">{uploading ? "Uploading…" : "Upload banner (JPG/PNG, max 5MB)"}</span>
                </button>
              )
            )}
            {isDraft && (
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleBannerChange} className="hidden" />
            )}
          </div>
        )}

        {isDraft && (
          <div>
            <label className="input-label">Send To</label>
            <div className="flex gap-2">
              {AUDIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAudience(opt.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    audience === opt.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(isDraft || (announcement.buttons && announcement.buttons.length > 0)) && (
          <div>
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">Action Buttons</label>
              {isDraft && buttons.length < 2 && (
                <button onClick={addButton} className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add button
                </button>
              )}
            </div>
            <div className="space-y-2 mt-2">
              {(isDraft ? buttons : announcement.buttons ?? []).map((b, i) => (
                <div key={i} className="flex gap-2 items-start">
                  {isDraft ? (
                    <>
                      <input
                        className="input-field flex-1"
                        placeholder="Label, e.g. Book Now"
                        value={b.label}
                        onChange={(e) => updateButton(i, "label", e.target.value)}
                      />
                      <input
                        className="input-field flex-1"
                        placeholder="URL, e.g. /patient/dashboard"
                        value={b.url}
                        onChange={(e) => updateButton(i, "url", e.target.value)}
                      />
                      <button onClick={() => removeButton(i)} className="p-2.5 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className="badge badge-gray">{b.label} → {b.url}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <span className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </span>
        )}

        {isDraft && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setDeleteOpen(true)}
              className="btn-secondary py-2.5 px-4 text-red-500 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <button onClick={saveDraft} disabled={saving} className="btn-secondary py-2.5 px-4 flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setSendOpen(true)} className="btn-primary py-2.5 px-4 flex-1">
              <Send className="w-4 h-4" /> Send
            </button>
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-800">Delete this draft?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">This will permanently remove this draft announcement. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <Send className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800">Send this announcement?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              It will go out immediately to all <span className="font-semibold text-slate-700">{AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label.toLowerCase()}</span> as a popup, notification, and push alert. This cannot be undone.
            </p>
            {sendError && (
              <p className="text-xs text-red-500 flex items-center gap-1 mb-3">
                <AlertCircle className="w-3 h-3" /> {sendError}
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setSendOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmSend} disabled={sending} className="btn-primary flex-1">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Sending…" : "Send Now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
