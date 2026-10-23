"use client";
import { useState } from "react";
import { Receipt, Loader2, AlertCircle } from "lucide-react";
import { buildReceiptPdf, loadReceipt, receiptFileName, type ReceiptKind } from "@/lib/receiptPdf";
import { saveOrShareFile } from "@/lib/nativeDownload";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Downloads the PDF receipt for a paid appointment or a wallet top-up.
// `compact` is the small "Receipt" chip used inside wallet history rows.
export default function ReceiptDownloadButton({ kind, id, compact = false }: { kind: ReceiptKind; id: string; compact?: boolean }) {
  const t = useTranslations("patient.receiptDownload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await loadReceipt(kind, id);
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
    <div className={cn("flex flex-col gap-1", compact ? "items-end" : "items-start")}>
      <button
        onClick={download}
        disabled={busy}
        className={compact
          ? "inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-60 py-1"
          : "tap-44-y btn-secondary py-2 px-3 text-xs"}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
        {busy ? t("generating") : compact ? t("short") : t("download")}
      </button>
      {error && (
        <span className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}
