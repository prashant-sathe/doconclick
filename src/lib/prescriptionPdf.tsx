"use client";
import { renderDocumentPdf } from "@/lib/documentPdf";
import PrescriptionDocument, { type PrescriptionData } from "@/components/patient/PrescriptionDocument";

// The prescription (PrescriptionDocument — the one layout patients, doctors
// and admins all see) as an A4 PDF, rendered in the browser.

export function prescriptionFileName(appointmentId: string) {
  return `Prescription-${appointmentId}.pdf`;
}

export async function loadPrescription(appointmentId: string): Promise<PrescriptionData> {
  const res = await fetch(`/api/appointments/${appointmentId}/prescription`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Could not load prescription");
  }
  return res.json();
}

export function buildPrescriptionPdf(data: PrescriptionData, patientId: string) {
  return renderDocumentPdf(<PrescriptionDocument data={data} patientId={patientId} />);
}
