"use client";
import { useState } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import type { PrescriptionData } from "./PrescriptionDocument";
import { buildPrescriptionPdf, loadPrescription, prescriptionFileName } from "@/lib/prescriptionPdf";
import { saveOrShareFile } from "@/lib/nativeDownload";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = providedData ?? await loadPrescription(appointmentId);
      const pdf = await buildPrescriptionPdf(data, patientId);
      const fileName = prescriptionFileName(appointmentId);
      // `pdf.save()` is a no-op inside the Capacitor WebView — on native, write
      // the file out and open the OS share sheet instead.
      const handledNatively = await saveOrShareFile(fileName, pdf.output("datauristring").split(",")[1]);
      if (!handledNatively) pdf.save(fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button onClick={download} disabled={busy} className="btn-secondary py-2 px-3 text-xs">
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" /> Download Prescription
          </>
        )}
      </button>
      {error && (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
