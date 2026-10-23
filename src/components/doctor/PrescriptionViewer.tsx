"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Download, Loader2, MessageCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import PrescriptionDocument, { type PrescriptionData } from "@/components/patient/PrescriptionDocument";
import { buildPrescriptionPdf, loadPrescription, prescriptionFileName } from "@/lib/prescriptionPdf";
import { saveOrShareFile } from "@/lib/nativeDownload";
import { isNative } from "@/lib/platform";
import { formatDoctorName } from "@/lib/utils";
import { useTranslations } from "next-intl";

const DOC_W = 794; // PrescriptionDocument's A4 width

// Whether to hand the PDF to the share sheet: phone/tablet browsers, where
// WhatsApp is on it. Desktop Chrome/Safari can share files too, but their
// sheet rarely offers WhatsApp, so a desktop gets download + WhatsApp chat.
// Checked up front — synchronously, while the tap still counts as a user
// gesture for window.open below.
function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return false;
  try {
    return navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
}

// The doctor's view of a consultation's e-prescription — exactly the document
// the patient gets (PrescriptionDocument: letterhead, reg. no., signature) —
// with Download and "Send on WhatsApp". On a phone, sharing attaches the PDF
// itself (share sheet → WhatsApp); on a desktop it downloads the PDF and
// opens the patient's WhatsApp chat to attach it in.
export default function PrescriptionViewer({ appointmentId, patientId, onClose, justCompleted = false }: {
  appointmentId: string;
  patientId: string;
  onClose: () => void;
  /** Opened straight after completing the consultation. */
  justCompleted?: boolean;
}) {
  const t = useTranslations("doctor.prescriptionViewer");
  const tc = useTranslations("doctor.common");
  const [data, setData] = useState<PrescriptionData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [docH, setDocH] = useState(1123);

  useEffect(() => {
    let cancelled = false;
    loadPrescription(appointmentId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [appointmentId]);

  // Fit the A4 page to the modal's width.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      setScale(Math.min(1, frame.clientWidth / DOC_W));
      if (docRef.current) setDocH(docRef.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    if (docRef.current) ro.observe(docRef.current);
    return () => ro.disconnect();
  }, [data]);

  const pdfFor = async () => buildPrescriptionPdf(data!, patientId);
  const fileName = prescriptionFileName(appointmentId);

  const download = async () => {
    if (!data) return;
    setBusy("download"); setError(null); setHint(null);
    try {
      const pdf = await pdfFor();
      if (!(await saveOrShareFile(fileName, pdf.output("datauristring").split(",")[1]))) pdf.save(fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pdfFailed"));
    } finally {
      setBusy(null);
    }
  };

  const message = data
    ? t("message", { name: data.relation !== "Self" && data.patientName ? data.patientName : data.accountHolderName, doctor: formatDoctorName(data.doctorName) })
    : "";

  const share = async () => {
    if (!data) return;
    setBusy("share"); setError(null); setHint(null);
    const native = isNative();
    const sheet = !native && canShareFiles();
    // Desktop: open the chat tab now, while the tap is still a user gesture.
    const chat = !native && !sheet ? window.open("", "_blank") : null;
    try {
      const pdf = await pdfFor();
      if (native) {
        await saveOrShareFile(fileName, pdf.output("datauristring").split(",")[1]);
        return;
      }
      if (sheet) {
        const file = new File([pdf.output("blob")], fileName, { type: "application/pdf" });
        try {
          await navigator.share({ files: [file], title: t("shareTitle"), text: message });
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") throw e;
        }
        return;
      }
      pdf.save(fileName);
      const url = `https://wa.me/${data.patientMobile && /^\d{10}$/.test(data.patientMobile) ? `91${data.patientMobile}` : ""}?text=${encodeURIComponent(message)}`;
      if (chat) chat.location.href = url;
      else window.open(url, "_blank");
      setHint(t("downloadedHint"));
    } catch (e) {
      chat?.close();
      setError(e instanceof Error ? e.message : t("shareFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("dialogLabel")}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            {justCompleted && (
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mb-0.5"><CheckCircle2 className="w-3.5 h-3.5" /> {t("completed")}</p>
            )}
            <h2 className="font-bold text-slate-900">{t("title")}</h2>
            <p className="text-xs text-slate-500">{t("subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 flex-shrink-0" aria-label={tc("close")}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-3 sm:p-4">
          <div ref={frameRef} className="w-full">
          {loadError ? (
            <p className="text-sm text-red-600 text-center py-10">{loadError}</p>
          ) : !data ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : (
            <div style={{ height: docH * scale, width: DOC_W * scale }} className="mx-auto shadow-sm overflow-hidden" aria-label={t("documentLabel")}>
              <div ref={docRef} style={{ width: DOC_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <PrescriptionDocument data={data} patientId={patientId} />
              </div>
            </div>
          )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 safe-bottom">
          {error && <p className="text-xs text-red-600 mb-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          {hint && <p className="text-xs text-slate-600 mb-2">{hint}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={download} disabled={!data || !!busy} className="btn-secondary justify-center py-2.5 text-sm">
              {busy === "download" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {t("download")}
            </button>
            <button type="button" onClick={share} disabled={!data || !!busy} className="btn-primary justify-center py-2.5 text-sm">
              {busy === "share" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} {t("sendWhatsApp")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
