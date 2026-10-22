"use client";
import { useState } from "react";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { useLoad, mutate } from "@/lib/apiClient";
import { useToast } from "@/components/Toast";
import { formatProviderName } from "@/lib/utils";

interface Row {
  id: string; orderId: string; amount: number; cfPaymentId: string | null; paidAt: string | null;
  visits: number; doctorName: string; doctorMobile: string; providerRole: string;
}

// Doctors' platform-fee payments that arrived but couldn't be matched to
// their cash visits automatically (the visits were settled another way
// meanwhile). Hidden when there are none.
export default function DuesReviewPanel({ onResolved }: { onResolved?: () => void }) {
  const toast = useToast();
  const { data, reload } = useLoad<Row[]>("/api/admin/finance/dues-payments");
  const [busy, setBusy] = useState<string | null>(null);
  if (!data || data.length === 0) return null;

  const resolve = async (id: string) => {
    setBusy(id);
    const r = await mutate(`/api/admin/finance/dues-payments`, { method: "PATCH", body: { id } });
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Marked as resolved.");
    void reload();
    onResolved?.();
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mt-8">
      <h2 className="font-bold text-amber-900 mb-1 text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Doctor payments to review</h2>
      <p className="text-xs text-amber-800 mb-4">
        These doctors paid their platform fee online, but the visits it covered were settled another way before the money arrived, so it wasn&apos;t applied.
        Settle their visits below (the payment is money already received), or refund it, then mark it resolved.
      </p>
      <div className="space-y-2">
        {data.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-800">{formatProviderName(r.doctorName, r.providerRole)} · {r.doctorMobile}</p>
              <p className="text-xs text-slate-500">
                ₹{r.amount.toLocaleString("en-IN")} for {r.visits} visit{r.visits === 1 ? "" : "s"}
                {r.paidAt ? ` · paid ${new Date(r.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` : ""}
                {r.cfPaymentId ? ` · Cashfree ${r.cfPaymentId}` : ""}
              </p>
            </div>
            <button onClick={() => resolve(r.id)} disabled={busy === r.id} className="btn-secondary py-2 px-3 text-xs">
              {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Mark resolved
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
