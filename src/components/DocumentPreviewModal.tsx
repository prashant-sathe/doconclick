"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { X, Download, Loader2, AlertCircle } from "lucide-react";

const DOC_W = 794; // A4 @ 96dpi — the width PrescriptionDocument / ReceiptDocument render at

// In-app preview of an A4 document (prescription, receipt) scaled to fit the
// modal, with a Download button. `children` is the document itself; pass
// nothing until it has loaded.
export default function DocumentPreviewModal({
  title, closeLabel, downloadLabel, generatingLabel, loadError, busy, error, onClose, onDownload, children,
}: {
  title: string;
  closeLabel: string;
  downloadLabel: string;
  generatingLabel: string;
  loadError: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDownload: () => void;
  children?: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [docH, setDocH] = useState(1123);
  const ready = !!children;

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
  }, [ready]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label={closeLabel}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-3 sm:p-4">
          <div ref={frameRef} className="w-full">
            {loadError ? (
              <p className="text-sm text-red-600 text-center py-10">{loadError}</p>
            ) : !ready ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : (
              <div style={{ height: docH * scale, width: DOC_W * scale }} className="mx-auto shadow-sm overflow-hidden">
                <div ref={docRef} style={{ width: DOC_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  {children}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 safe-bottom">
          {error && <p className="text-xs text-red-600 mb-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {error}</p>}
          <button type="button" onClick={onDownload} disabled={!ready || busy} className="btn-primary w-full justify-center py-2.5 text-sm">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {busy ? generatingLabel : downloadLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
