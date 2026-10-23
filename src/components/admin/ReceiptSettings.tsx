"use client";
import { useEffect, useState } from "react";
import { Receipt, Loader2, CheckCircle2 } from "lucide-react";

type Fields = { receiptLegalName: string; receiptAddress: string; receiptGstin: string; receiptTaxNote: string };
const KEYS = ["receiptLegalName", "receiptAddress", "receiptGstin", "receiptTaxNote"] as const;
const fromSettings = (s: Record<string, unknown>): Fields =>
  Object.fromEntries(KEYS.map((k) => [k, typeof s[k] === "string" ? s[k] : ""])) as Fields;

// The supplier block printed on patient receipts — appointment payments and
// wallet top-ups (src/lib/receipts.ts). Blank fields are left off the receipt.
export default function ReceiptSettings() {
  const [fields, setFields] = useState<Fields | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then((s) => setFields(fromSettings(s))).catch(() => setFields(fromSettings({})));
  }, []);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => (f ? { ...f, [key]: e.target.value } : f));

  const save = async () => {
    if (!fields) return;
    setSaved(false); setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save."); return; }
      setFields(fromSettings(await res.json()));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error — receipt details were not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Receipt details</h2>
          <p className="text-xs text-slate-500">Printed at the top of the PDF receipts patients download for paid appointments and wallet top-ups.</p>
        </div>
      </div>
      {fields === null ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label" htmlFor="receipt-name">Legal / business name</label>
              <input id="receipt-name" className="input-field" placeholder="DocOnClick" value={fields.receiptLegalName} onChange={set("receiptLegalName")} />
            </div>
            <div>
              <label className="input-label" htmlFor="receipt-gstin">GSTIN</label>
              <input id="receipt-gstin" className="input-field uppercase" placeholder="27ABCDE1234F1Z5" maxLength={15} value={fields.receiptGstin} onChange={set("receiptGstin")} />
            </div>
          </div>
          <div className="mt-4">
            <label className="input-label" htmlFor="receipt-address">Registered address</label>
            <textarea id="receipt-address" rows={2} className="input-field" value={fields.receiptAddress} onChange={set("receiptAddress")} />
          </div>
          <div className="mt-4">
            <label className="input-label" htmlFor="receipt-tax-note">GST note on appointment receipts</label>
            <textarea
              id="receipt-tax-note"
              rows={2}
              className="input-field"
              placeholder="Healthcare services (SAC 9993) are exempt from GST; no GST has been charged."
              value={fields.receiptTaxNote}
              onChange={set("receiptTaxNote")}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3">Leave the note blank to use the default shown. Blank name prints “DocOnClick”; blank GSTIN / address are left off.</p>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} disabled={saving} className="btn-primary py-2.5 px-5 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}
