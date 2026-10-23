"use client";
import { renderDocumentPdf } from "@/lib/documentPdf";
import ReceiptDocument from "@/components/patient/ReceiptDocument";
import type { ReceiptData } from "@/lib/receipts";

// Payment receipts (ReceiptDocument) as A4 PDFs, rendered in the browser —
// one per paid appointment, one per successful wallet top-up.

export type ReceiptKind = "appointment" | "wallet";

export async function loadReceipt(kind: ReceiptKind, id: string): Promise<ReceiptData> {
  const res = await fetch(`/api/receipts/${kind === "appointment" ? "appointments" : "wallet"}/${id}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Could not load receipt");
  }
  return res.json();
}

export function receiptFileName(data: ReceiptData) {
  return `Receipt-${data.receiptNo}.pdf`;
}

export function buildReceiptPdf(data: ReceiptData) {
  return renderDocumentPdf(<ReceiptDocument data={data} />);
}
