"use client";
import { Stethoscope } from "lucide-react";
import { formatDoctorName } from "@/lib/utils";

export interface PrescriptionMedicineData {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
}

export interface PrescriptionTestData {
  name: string;
  instructions: string | null;
}

export interface PrescriptionData {
  id: string;
  scheduledAt: string;
  patientName: string | null;
  accountHolderName: string;
  relation: string;
  patientAge: number | null;
  patientGender: string | null;
  patientAddress: string | null;
  doctorName: string;
  doctorQualification: string | null;
  doctorRegNo: string | null;
  doctorSpecialty: string;
  clinicName: string | null;
  doctorNotes: string | null;
  doctorSignatureUrl: string | null;
  medicines: PrescriptionMedicineData[];
  tests: PrescriptionTestData[];
}

// A4 @ 96dpi
const PAGE_W = 794;
const PAGE_H = 1123;

const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const TEAL = "#14b8a6";
const SURFACE = "#f8fafc";

function Watermark() {
  const rows = 14;
  const cols = 5;
  const cells = Array.from({ length: rows * cols });
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: PAGE_W * 1.6,
        height: PAGE_H * 1.6,
        transform: "translate(-50%, -50%) rotate(-30deg)",
        display: "flex",
        flexWrap: "wrap",
        alignContent: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {cells.map((_, i) => (
        <span
          key={i}
          style={{
            width: `${100 / cols}%`,
            textAlign: "center",
            color: TEAL,
            opacity: 0.08,
            fontSize: 22,
            fontWeight: 700,
            whiteSpace: "nowrap",
            padding: "24px 0",
          }}
        >
          DocOnClick
        </span>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
      {children}
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 8 }}>{children}</div>;
}

export default function PrescriptionDocument({
  data,
  patientId,
}: {
  data: PrescriptionData;
  patientId: string;
}) {
  const rxId = `RX-${data.id.slice(-8).toUpperCase()}`;
  const ptId = `PT-${patientId.slice(-8).toUpperCase()}`;
  const displayName =
    data.relation !== "Self" && data.patientName ? `${data.patientName} (${data.relation})` : data.accountHolderName;
  const ageGender = [data.patientAge != null ? `${data.patientAge} Y` : null, data.patientGender]
    .filter(Boolean)
    .join(" / ");
  const formattedDate = new Date(data.scheduledAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div
      style={{
        width: PAGE_W,
        minHeight: PAGE_H,
        background: "#ffffff",
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
        overflow: "hidden",
        padding: 40,
        boxSizing: "border-box",
      }}
    >
      <Watermark />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: `2px solid ${BORDER}`, paddingBottom: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: TEAL, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Stethoscope color="#ffffff" size={20} />
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800, color: INK }}>DocOnClick</span>
              {data.clinicName && (
                <div style={{ fontSize: 12, fontWeight: 600, color: TEAL, marginTop: 2 }}>{data.clinicName}</div>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: 1 }}>PRESCRIPTION</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Prescription ID: {rxId}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Date: {formattedDate}</div>
          </div>
        </div>

        {/* Patient / Doctor boxes */}
        <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
          <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 10 }}>Patient Details</div>
            <Label>Name</Label>
            <Value>{displayName}</Value>
            <Label>Age / Gender</Label>
            <Value>{ageGender || "—"}</Value>
            <Label>Address</Label>
            <Value>{data.patientAddress || "—"}</Value>
            <Label>Patient ID</Label>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{ptId}</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 10 }}>Doctor Details</div>
            <Label>Name</Label>
            <Value>{formatDoctorName(data.doctorName)}</Value>
            <Label>Qualification</Label>
            <Value>{data.doctorQualification || "—"}</Value>
            <Label>Reg. No.</Label>
            <Value>{data.doctorRegNo || "—"}</Value>
            <Label>Specialization</Label>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{data.doctorSpecialty}</div>
          </div>
        </div>

        {/* Rx list */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: TEAL, marginBottom: 12 }}>℞</div>
          {data.medicines.map((m, i) => (
            <div key={i} style={{ borderBottom: i < data.medicines.length - 1 ? `1px dashed ${BORDER}` : "none", padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
                  {i + 1}. {m.name}
                </div>
                {m.duration && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, whiteSpace: "nowrap" }}>· {m.duration}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                {[m.dosage, m.frequency].filter(Boolean).join(" · ")}
              </div>
              {m.instructions && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontStyle: "italic" }}>{m.instructions}</div>}
            </div>
          ))}
        </div>

        {/* Recommended Tests */}
        {data.tests.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 10 }}>Recommended Tests</div>
            {data.tests.map((t, i) => (
              <div key={i} style={{ borderBottom: i < data.tests.length - 1 ? `1px dashed ${BORDER}` : "none", padding: "8px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>
                  {i + 1}. {t.name}
                </div>
                {t.instructions && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontStyle: "italic" }}>{t.instructions}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Notes/Advice */}
        {data.doctorNotes && (
          <div style={{ background: SURFACE, borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 6 }}>Notes / Advice</div>
            <div style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>{data.doctorNotes}</div>
          </div>
        )}

        {/* Sign-off */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <div style={{ width: 220, textAlign: "center" }}>
            {data.doctorSignatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/download?url=${encodeURIComponent(data.doctorSignatureUrl)}&name=signature.png&disposition=inline`}
                alt="Doctor's signature"
                style={{ height: 48, objectFit: "contain", marginBottom: 4 }}
              />
            )}
            <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{formatDoctorName(data.doctorName)}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{data.doctorQualification || ""}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Reg. No.: {data.doctorRegNo || "—"}</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: MUTED }}>
            This is a digitally generated prescription from DocOnClick and does not require a physical signature.
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginTop: 4 }}>
            Watermarked by DocOnClick · Your Health. Our Priority.
          </div>
        </div>
      </div>
    </div>
  );
}
