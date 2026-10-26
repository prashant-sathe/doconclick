"use client";
import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import ReceiptDocument from "./ReceiptDocument";
import DocumentPreviewModal from "@/components/DocumentPreviewModal";
import { buildReceiptPdf, loadReceipt, receiptFileName, type ReceiptKind } from "@/lib/receiptPdf";
import type { ReceiptData } from "@/lib/receipts";
import { saveOrShareFile } from "@/lib/nativeDownload";
import { useTranslations } from "next-intl";

// "Download Receipt" opens the in-app preview of the receipt for a paid
// appointment or a wallet top-up; the PDF is downloaded from there.
// `compact` is the small "Receipt" chip used inside wallet history rows.
export default function ReceiptDownloadButton({ kind, id, compact = false }: { kind: ReceiptKind; id: string; compact?: boolean }) {
  const t = useTranslations("patient.receiptDownload");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    loadReceipt(kind, id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [open, data, kind, id]);

  const download = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildReceiptPdf(data);
      const fileName = receiptFileName(data);
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
      <button
        onClick={() => setOpen(true)}
        className={compact
          ? "inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 py-1"
          : "tap-44-y btn-secondary py-2 px-3 text-xs"}
      >
        <Receipt className="w-3.5 h-3.5" />
        {compact ? t("short") : t("download")}
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
          {data && <ReceiptDocument data={data} />}
        </DocumentPreviewModal>
      )}
    </>
  );
}
