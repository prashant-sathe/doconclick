"use client";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import PrescriptionDocument, { type PrescriptionData } from "./PrescriptionDocument";
import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import { buildPrescriptionPdf, loadPrescription, prescriptionFileName } from "@/lib/prescriptionPdf";
import { saveOrShareFile } from "@/lib/nativeDownload";
import { useTranslations } from "next-intl";

// "Download Prescription" opens the in-app preview; the PDF is downloaded
// from there.
export default function PrescriptionDownloadButton({
  appointmentId,
  patientId,
  data: providedData,
}: {
  appointmentId: string;
  patientId: string;
  // Pre-fetched prescription data — used by callers (e.g. the admin drawer)
  // that already loaded this data and can't hit the patient-only GET route.
  data?: PrescriptionData;
}) {
  const t = useTranslations("patient.prescriptionDownload");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PrescriptionData | null>(providedData ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    loadPrescription(appointmentId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [open, data, appointmentId]);

  const download = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildPrescriptionPdf(data, patientId);
      const fileName = prescriptionFileName(appointmentId);
      // `pdf.save()` is a no-op inside the Capacitor WebView — on native, write
      // the file out and open the OS share sheet instead.
      const handledNatively = await saveOrShareFile(fileName, pdf.output("datauristring").split(",")[1]);
      if (!handledNatively) pdf.save(fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary py-2 px-3 text-xs">
        <FileText className="w-3.5 h-3.5" /> {t("download")}
      </button>
      {open && (
        <DocumentPreviewModal
          title={t("previewTitle")}
          closeLabel={t("close")}
          downloadLabel={t("download")}
          generatingLabel={t("generating")}
          loadError={loadError}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
          onDownload={download}
        >
          {data && <PrescriptionDocument data={data} patientId={patientId} />}
        </DocumentPreviewModal>
      )}
    </>
  );
}
