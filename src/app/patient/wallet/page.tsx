"use client";
import { useState } from "react";
import { Loader2, Plus, Wallet, ArrowDownCircle, ArrowUpCircle, ShieldCheck } from "lucide-react";
import PatientHeader from "@/components/patient/PatientHeader";
import PatientMobileNav from "@/components/patient/PatientMobileNav";
import WalletTopUpModal from "@/components/patient/WalletTopUpModal";
import { useWallet } from "@/hooks/useWallet";

const TYPE_LABEL: Record<string, string> = {
  TOPUP: "Added to wallet",
  BOOKING_PAYMENT: "Appointment payment",
  ADMIN_CREDIT: "Credited by admin",
  ADMIN_DEBIT: "Debited by admin",
  REASSIGNMENT_CREDIT: "Appointment cancelled — refunded",
};

const CREDIT_TYPES = new Set(["TOPUP", "ADMIN_CREDIT", "REASSIGNMENT_CREDIT"]);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Processing",
  SUCCESS: "Completed",
  FAILED: "Failed",
};

export default function WalletPage() {
  const [take, setTake] = useState(20);
  const { balance, transactions, loading, refresh } = useWallet(take);
  const [showTopUp, setShowTopUp] = useState(false);

  return (
    <div className="min-h-screen gradient-surface pb-24 sm:pb-10">
      <PatientHeader />
      <PatientMobileNav />
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-semibold text-slate-500">Wallet Balance</span>
          </div>
          <p className="text-4xl font-extrabold text-slate-900 mt-2 mb-5">
            {loading || balance == null ? <Loader2 className="w-7 h-7 animate-spin text-slate-300" /> : `₹${balance.toLocaleString("en-IN")}`}
          </p>
          <button onClick={() => setShowTopUp(true)} className="btn-primary gap-1.5">
            <Plus className="w-4 h-4" /> Add Money
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Transaction History</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No transactions yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {transactions.map((t) => {
                const isCredit = CREDIT_TYPES.has(t.type);
                const Icon = t.type === "ADMIN_CREDIT" || t.type === "ADMIN_DEBIT" ? ShieldCheck : (isCredit ? ArrowDownCircle : ArrowUpCircle);
                return (
                  <div key={t.id} className="py-3.5 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isCredit ? "bg-emerald-50" : "bg-blue-50"}`}>
                      <Icon className={`w-4 h-4 ${isCredit ? "text-emerald-600" : "text-blue-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{TYPE_LABEL[t.type] ?? t.type}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(t.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        {t.status !== "SUCCESS" && ` · ${STATUS_LABEL[t.status] ?? t.status}`}
                        {t.note && ` · ${t.note}`}
                      </p>
                    </div>
                    <span className={`text-sm font-bold flex-shrink-0 ${t.status === "FAILED" ? "text-slate-300 line-through" : isCredit ? "text-emerald-600" : "text-slate-700"}`}>
                      {isCredit ? "+" : "−"}₹{t.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {transactions.length > 0 && transactions.length >= take && (
            <button
              onClick={() => setTake((t) => t + 20)}
              className="btn-secondary w-full justify-center mt-4"
            >
              Load more
            </button>
          )}
        </div>
      </div>

      {showTopUp && (
        <WalletTopUpModal onClose={() => { setShowTopUp(false); refresh(); }} />
      )}
    </div>
  );
}
