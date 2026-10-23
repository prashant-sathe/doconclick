"use client";
import { useEffect, useState } from "react";
import {
  FolderHeart, Plus, X, Loader2, FileText, FlaskConical, Pill, Scan, Syringe, Trash2, Download,
} from "lucide-react";
import ProfileSubShell from "@/components/patient/ProfileSubShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import { downloadOrShareUrl } from "@/lib/nativeDownload";
import { isNative } from "@/lib/platform";
import { prepareUpload, tooBigMessage } from "@/lib/compressImage";
import { useLocale, useTranslations } from "next-intl";
import { formattingLocale } from "@/lib/appLanguage";

interface PatientDocument {
  id: string;
  title: string;
  category: string;
  fileUrl: string;
  fileName: string | null;
  createdAt: string;
}

const CATEGORIES = ["Lab Report", "Prescription", "Scan/X-ray", "Vaccination", "Discharge Summary", "Other"];

// Stored category values stay English; these are their message keys.
const CATEGORY_KEY: Record<string, "labReport" | "prescription" | "scan" | "vaccination" | "discharge" | "other"> = {
  "Lab Report": "labReport",
  Prescription: "prescription",
  "Scan/X-ray": "scan",
  Vaccination: "vaccination",
  "Discharge Summary": "discharge",
  Other: "other",
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  "Lab Report": FlaskConical,
  Prescription: Pill,
  "Scan/X-ray": Scan,
  Vaccination: Syringe,
  "Discharge Summary": FileText,
  Other: FileText,
};

export default function HealthDocumentsPage() {
  const t = useTranslations("patientAccount.documents");
  const locale = formattingLocale(useLocale());
  const categoryLabel = (c: string) => (CATEGORY_KEY[c] ? t(`category.${CATEGORY_KEY[c]}`) : c);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/patients/me/documents")
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const onOpen = async (doc: PatientDocument) => {
    if (!isNative()) {
      window.open(doc.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDownloadingId(doc.id);
    try {
      await downloadOrShareUrl(doc.fileUrl, doc.fileName || `${doc.title}.pdf`);
    } catch {
      /* keep the list as-is */
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/patients/me/documents/${deleteTarget.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  return (
    <ProfileSubShell
      title={t("title")}
      description={t("description")}
      icon={<FolderHeart className="w-5 h-5" />}
      tint="bg-rose-50 text-rose-600"
      loading={loading}
    >
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="tap-44-y btn-secondary w-full justify-center py-2.5"
      >
        <Plus className="w-4 h-4" /> {t("add")}
      </button>

      {documents.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">{t("none")}</p>
      ) : (
        <div className="space-y-2.5">
          {documents.map((doc) => {
            const Icon = CATEGORY_ICON[doc.category] ?? FileText;
            return (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{doc.title}</p>
                  <p className="text-xs text-slate-400">
                    {categoryLabel(doc.category)} · {new Date(doc.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <button aria-label={t("viewAria", { title: doc.title })}
                  type="button"
                  onClick={() => onOpen(doc)}
                  disabled={downloadingId === doc.id}
                  className="tap-44 w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0"
                  title={t("viewTitle")}
                >
                  {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
                <button aria-label={t("removeAria", { title: doc.title })}
                  type="button"
                  onClick={() => setDeleteTarget(doc)}
                  className="tap-44 w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0"
                  title={t("remove")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onUploaded={(doc) => { setDocuments((prev) => [doc, ...prev]); setUploadOpen(false); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon={Trash2}
          title={t("confirmTitle")}
          message={t("confirmMessage", { title: deleteTarget.title })}
          confirmLabel={t("remove")}
          busyLabel={t("removing")}
          tone="danger"
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </ProfileSubShell>
  );
}

function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: (doc: PatientDocument) => void }) {
  const t = useTranslations("patientAccount.documents");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Other");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError(t("errTitle")); return; }
    if (!file) { setError(t("errFile")); return; }
    setBusy(true);
    setError("");
    const prepared = await prepareUpload(file).catch(() => null);
    if (!prepared) { setBusy(false); setError(t("errRead")); return; }
    const tooBig = tooBigMessage(prepared);
    if (tooBig) { setBusy(false); setError(tooBig); return; }
    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("category", category);
    fd.append("file", prepared, prepared.name);
    const res = await fetch("/api/patients/me/documents", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) {
      onUploaded(await res.json());
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("errUpload"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">{t("dialogTitle")}</h3>
          <button aria-label={t("close")} onClick={onClose} className="tap-44 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="input-label">{t("titleLabel")}</label>
        <input
          className="input-field mb-3"
          placeholder={t("titlePlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="input-label">{t("categoryLabel")}</label>
        <select className="input-field mb-3" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`category.${CATEGORY_KEY[c]}`)}</option>)}
        </select>

        <label className="input-label">{t("fileLabel")}</label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="input-field mb-3"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">{t("cancel")}</button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("uploading")}</> : t("upload")}
          </button>
        </div>
      </div>
    </div>
  );
}
