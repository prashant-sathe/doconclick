"use client";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, Loader2, AlertCircle } from "lucide-react";
import PrescriptionDocument, { type PrescriptionData } from "./PrescriptionDocument";

export default function PrescriptionDownloadButton({
  appointmentId,
  patientId,
}: {
  appointmentId: string;
  patientId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    let container: HTMLDivElement | null = null;
    let root: ReturnType<typeof createRoot> | null = null;
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/prescription`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not load prescription");
      }
      const data: PrescriptionData = await res.json();

      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.zIndex = "-1";
      document.body.appendChild(container);

      root = createRoot(container);
      root.render(<PrescriptionDocument data={data} patientId={patientId} />);

      // Wait a full commit + paint cycle before snapshotting the off-screen node.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const target = container.firstElementChild as HTMLElement;
      const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });

      // JPEG (not PNG) keeps the file small — a flat, mostly-white document
      // compresses far better as JPEG than as lossless PNG.
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      // Ignore sub-millimeter residuals from floating-point rounding so content
      // that fits exactly one page doesn't spill a near-empty trailing page.
      while (heightLeft > 1) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }

      pdf.save(`Prescription-${appointmentId}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      root?.unmount();
      container?.remove();
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
