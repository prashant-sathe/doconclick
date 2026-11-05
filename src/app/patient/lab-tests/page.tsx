"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FlaskConical, MapPin, Wallet, CreditCard, Info, XCircle, FileText, Download, Eye, Loader2, CheckCircle2, AlertCircle, CalendarClock } from "lucide-react";
import { addressWithPin, collectionDayLabel, slotLabel } from "@/lib/labShare";
import { useLocale, useTranslations } from "next-intl";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import LoadError from "@/components/LoadError";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { mutate, useLoad } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";
import { downloadOrShareUrl } from "@/lib/nativeDownload";
import { cn } from "@/lib/utils";

type Status = "PENDING_PAYMENT" | "REQUESTED" | "CONFIRMED" | "SAMPLE_COLLECTED" | "COMPLETED" | "CANCELLED";
interface LabBooking {
  id: string;
  patientName: string;
  address: string;
  pinCode: string | null;
  collectionDate: string | null;
  collectionSlot: string | null;
  notes: string | null;
  totalAmount: number;
  paymentMethod: "WALLET" | "ONLINE";
  paymentStatus: "PENDING" | "PAID" | "REFUNDED";
  status: Status;
  adminNote: string | null;
  cancelledBy: string | null;
  createdAt: string;
  items: { id: string; name: string; price: number }[];
  reports: { id: string; fileUrl: string; fileName: string | null; createdAt: string }[];
}

const STATUS_BADGE: Record<Status, string> = {
  PENDING_PAYMENT: "badge-warning",
  REQUESTED: "badge-info",
  CONFIRMED: "badge-info",
  SAMPLE_COLLECTED: "badge-purple",
  COMPLETED: "badge-success",
  CANCELLED: "badge-gray",
};
const STEPS = ["REQUESTED", "CONFIRMED", "SAMPLE_COLLECTED", "COMPLETED"] as const;
const fileHref = (url: string, name: string | null, inline: boolean) =>
  `/api/files/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name || "lab-report")}${inline ? "&disposition=inline" : ""}`;

async function openCheckout(paymentSessionId: string) {
  const { load: loadCashfree } = await import("@cashfreepayments/cashfree-js");
  // Same hardcoded mode as the other checkouts (NEXT_PUBLIC_ vars are baked in at build time).
  const cashfree = await loadCashfree({ mode: "production" });
  cashfree.checkout({ paymentSessionId, redirectTarget: "_self" });
}

/** Back from Cashfree: the webhook usually beats us, else verify asks the gateway. */
function useReturnFromCheckout(onDone: () => void) {
  const params = useSearchParams();
  // Read once: clearing ?labOrder from the URL below changes useSearchParams,
  // which must not cancel the confirmation that's already running.
  const [ret] = useState(() => ({ orderId: params.get("labOrder"), bookingId: params.get("booking") }));
  const [state, setState] = useState<"checking" | "paid" | "credited" | "pending" | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    const { orderId, bookingId } = ret;
    if (!orderId || !bookingId) return;
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    // Starting the post-checkout confirmation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("checking");
    (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        const res = await mutate<{ status: string }>(`/api/lab-bookings/${bookingId}/verify`, { body: { orderId } });
        if (cancelled) return;
        if (res.ok && (res.data.status === "PAID" || res.data.status === "CREDITED")) {
          setState(res.data.status === "PAID" ? "paid" : "credited");
          onDoneRef.current();
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (!cancelled) { setState("pending"); onDoneRef.current(); }
    })();
    return () => { cancelled = true; };
  }, [ret]);
  return state;
}

function LabTestsList() {
  const t = useTranslations("patient.labTests");
  const locale = formattingLocale(useLocale());
  const toast = useToast();
  const { data, error, reload, reloading } = useLoad<LabBooking[]>("/api/lab-bookings", { pollMs: 30_000 });
  const returned = useReturnFromCheckout(reload);
  const [cancelTarget, setCancelTarget] = useState<LabBooking | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(cancelTarget.id);
    const res = await mutate<{ refunded: number }>(`/api/lab-bookings/${cancelTarget.id}/cancel`);
    setBusy(null);
    setCancelTarget(null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.refunded ? t("cancelledRefunded", { amount: res.data.refunded }) : t("cancelled"));
    reload();
  };

  const payNow = async (b: LabBooking) => {
    setBusy(b.id);
    const res = await mutate<{ paymentSessionId: string }>(`/api/lab-bookings/${b.id}/pay`);
    if (!res.ok) { setBusy(null); toast.error(res.error); reload(); return; }
    try {
      await openCheckout(res.data.paymentSessionId);
    } catch {
      setBusy(null);
      toast.error(t("payFailed"));
    }
  };

  // Through our own origin (S3 isn't CORS-configured); native → OS share sheet.
  const download = async (r: LabBooking["reports"][number]) => {
    const name = r.fileName || "lab-report.pdf";
    try { await downloadOrShareUrl(fileHref(r.fileUrl, name, false), name); } catch { toast.error(t("downloadFailed")); }
  };

  return (
    <>
      {returned && (
        <div className={cn(
          "mb-4 rounded-2xl border px-4 py-3 text-sm flex items-center gap-2",
          returned === "paid" ? "bg-emerald-50 border-emerald-100 text-emerald-800" : returned === "checking" ? "bg-slate-50 border-slate-100 text-slate-700" : "bg-amber-50 border-amber-100 text-amber-800",
        )}>
          {returned === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : returned === "paid" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {t(`return.${returned}`)}
        </div>
      )}

      {error && <LoadError error={error} onRetry={reload} retrying={reloading} hasData={!!data} />}

      {data === null ? (
        !error && <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <FlaskConical className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">{t("empty")}</p>
          <Link href="/patient/appointments" className="tap-44-y btn-primary py-2 px-4 text-sm mt-4 inline-flex">{t("goToAppointments")}</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((b) => {
            const step = STEPS.indexOf(b.status as (typeof STEPS)[number]);
            return (
              <div key={b.id} className={cn("bg-white rounded-2xl border shadow-sm p-5", b.status === "CANCELLED" ? "border-slate-200 opacity-80" : "border-slate-100")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{b.patientName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t("bookedOn", { date: new Date(b.createdAt) })}</p>
                  </div>
                  <span className={cn("badge text-[11px] flex-shrink-0", STATUS_BADGE[b.status])}>{t(`status.${b.status}`)}</span>
                </div>

                {step >= 0 && (
                  <div className="flex items-center gap-1 mt-3" aria-hidden>
                    {STEPS.map((s, i) => <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-teal-500" : "bg-slate-100")} />)}
                  </div>
                )}

                {b.reports.length > 0 && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5 mb-2"><FileText className="w-4 h-4" />{t("reportReady")}</p>
                    <div className="space-y-2">
                      {b.reports.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-700 truncate min-w-0 flex-1">{r.fileName || t("reportFile")}</span>
                          <a href={fileHref(r.fileUrl, r.fileName, true)} target="_blank" rel="noreferrer" className="tap-44-y btn-secondary py-1.5 px-3 text-xs inline-flex"><Eye className="w-3.5 h-3.5" />{t("viewReport")}</a>
                          <button onClick={() => download(r)} className="tap-44-y btn-primary py-1.5 px-3 text-xs inline-flex"><Download className="w-3.5 h-3.5" />{t("downloadReport")}</button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-emerald-900/70 mt-2">{t("reportInVault")}</p>
                  </div>
                )}

                <div className="mt-3 border border-slate-100 rounded-xl divide-y divide-slate-50">
                  {b.items.map((i) => (
                    <div key={i.id} className="px-3 py-2 text-sm flex justify-between gap-3">
                      <span className="text-slate-800">{i.name}</span>
                      <span className="text-slate-600 whitespace-nowrap">₹{i.price.toLocaleString(locale)}</span>
                    </div>
                  ))}
                  <div className="px-3 py-2 text-sm flex justify-between gap-3 font-bold">
                    <span>{t("total")}</span>
                    <span>₹{b.totalAmount.toLocaleString(locale)}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                  {b.paymentMethod === "WALLET" ? <Wallet className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                  {t(`payment.${b.paymentMethod}`)} · {t(`paymentStatus.${b.paymentStatus}`)}
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-start gap-1.5"><MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{addressWithPin(b.address, b.pinCode)}</p>
                {b.collectionDate && b.collectionSlot && b.status !== "CANCELLED" && b.status !== "COMPLETED" && (
                  <p className="text-xs text-slate-600 font-semibold mt-1 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
                    {t("collectionAt", { day: collectionDayLabel(b.collectionDate, locale), slot: slotLabel(b.collectionSlot) })}
                  </p>
                )}

                {b.adminNote && (
                  <div className="mt-3 rounded-xl bg-teal-50 border border-teal-100 px-3 py-2 text-sm text-teal-900 flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold">{t("adminNote")} </span>{b.adminNote}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  {b.status === "PENDING_PAYMENT" && (
                    <button onClick={() => payNow(b)} disabled={busy === b.id} className="tap-44-y btn-primary py-2 px-4 text-xs inline-flex">
                      {busy === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />} {t("payNow", { amount: b.totalAmount.toLocaleString(locale) })}
                    </button>
                  )}
                  {(b.status === "REQUESTED" || b.status === "PENDING_PAYMENT") && (
                    <button onClick={() => setCancelTarget(b)} className="tap-44-y text-xs font-semibold text-red-500 hover:text-red-600 inline-flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> {t("cancel")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelTarget && (
        <ConfirmDialog
          icon={XCircle}
          tone="danger"
          title={t("cancelTitle")}
          message={cancelTarget.paymentStatus === "PAID" ? t("cancelRefundMessage", { amount: cancelTarget.totalAmount }) : t("cancelMessage")}
          confirmLabel={t("cancelConfirm")}
          cancelLabel={t("keep")}
          busy={busy === cancelTarget.id}
          onCancel={() => setCancelTarget(null)}
          onConfirm={cancel}
        />
      )}
    </>
  );
}

export default function PatientLabTests() {
  const t = useTranslations("patient.labTests");
  return (
    <div className="min-h-screen gradient-surface pb-24 lg:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2 mb-1"><FlaskConical className="w-6 h-6 text-teal-600" />{t("title")}</h1>
        <p className="text-sm text-slate-500 mb-6">{t("subtitle")}</p>
        <Suspense fallback={<div className="skeleton h-32 rounded-2xl" />}>
          <LabTestsList />
        </Suspense>
      </div>
    </div>
  );
}
