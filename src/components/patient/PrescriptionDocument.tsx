"use client";
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
  clinicAddress?: string | null;
  consultType?: string;
  patientMobile?: string;
  doctorNotes: string | null;
  chiefComplaints?: string | null;
  history?: string | null;
  examination?: string | null;
  findings?: string | null;
  diagnosis?: string | null;
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
// DocOnClick brand: primary-600 blue, accent-400 green (see globals.css)
const TEAL = "#1d8767";
const GREEN = "#2bab85";
const NAVY = "#1a489e";
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
    timeZone: "Asia/Kolkata",
  });

  // Qualification is stored as one string; the letterhead lists it a line at a time.
  const qualLines = (data.doctorQualification ?? "")
    .split(/[\n,]+/)
    .map((q) => q.trim())
    .filter(Boolean);
  const patientFields: [string, string][] = [
    ["Patient", displayName],
    ["Age / Sex", ageGender || "—"],
    ["Patient ID", ptId],
    ["Date", formattedDate],
    ["Rx ID", rxId],
  ];

  const clinicalRows = (
    [
      ["Chief Complaints", data.chiefComplaints],
      ["History", data.history],
      ["Examination", data.examination],
      ["Findings", data.findings],
      ["Diagnosis", data.diagnosis],
    ] as [string, string | null | undefined][]
  ).filter((r): r is [string, string] => !!r[1]?.trim());

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
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Watermark />

      {/* Letterhead — practice on the left, doctor on the right, split by a thin rule */}
      <div style={{ position: "relative", zIndex: 1, padding: "28px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 18, paddingBottom: 14 }}>
          <div style={{ width: 190, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="DocOnClick" style={{ width: 54, height: 54, objectFit: "contain", marginBottom: 6 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, lineHeight: 1.2 }}>
              {data.clinicName || formatDoctorName(data.doctorName)}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: GREEN, marginTop: 4, letterSpacing: 0.4 }}>via DocOnClick</div>
          </div>
          <div style={{ width: 1, background: BORDER, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: INK, lineHeight: 1.15 }}>{formatDoctorName(data.doctorName)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginTop: 3 }}>{data.doctorSpecialty}</div>
            <div style={{ fontSize: 11, color: INK, marginTop: 4, lineHeight: 1.45 }}>
              {qualLines.map((q, i) => (
                <div key={i}>{q}</div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Reg. No. {data.doctorRegNo || "—"}</div>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1, height: 4, background: GREEN }} />

      <div style={{ position: "relative", zIndex: 1, padding: "16px 40px 0", flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Patient details — one full-width row */}
        <div
          style={{
            display: "flex",
            gap: 16,
            border: `1px solid ${GREEN}`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 22,
          }}
        >
          {patientFields.map(([label, value], i) => (
            <div key={label} style={{ flex: i === 0 ? 2 : 1, minWidth: 0 }}>
              <Label>{label}</Label>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, wordBreak: "break-word" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Clinical record — only the fields the doctor filled in */}
        {clinicalRows.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            {clinicalRows.map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px dashed ${BORDER}` }}>
                <div style={{ width: 120, flexShrink: 0, fontSize: 11, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
                <div style={{ flex: 1, fontSize: 12.5, color: INK, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value}</div>
              </div>
            ))}
          </div>
        )}

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

        <div style={{ flex: 1 }} />
      </div>

      {/* Footer — visit location, pinned to the foot of the page */}
      <div style={{ position: "relative", zIndex: 1, padding: "0 40px 14px" }}>
        {/* Telemedicine disclaimer — video consults only */}
        {data.consultType === "VIDEO" && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", fontSize: 10, color: MUTED, textAlign: "center", lineHeight: 1.5, marginBottom: 10 }}>
            Disclaimer: This prescription is based on the information provided by you in an online consultation and not on any
            physical verification. Visit a doctor in case of emergency. This prescription is valid in India only.
          </div>
        )}
        <div style={{ background: NAVY, color: "#ffffff", borderRadius: 18, padding: "8px 18px", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          {data.clinicName || formatDoctorName(data.doctorName)}
          {data.consultType ? ` · ${data.consultType === "CLINIC" ? "Clinic visit" : data.consultType === "VIDEO" ? "Video consultation" : "Home visit"}` : ""}
        </div>
        {data.clinicAddress && (
          <div style={{ fontSize: 11, color: INK, textAlign: "center", marginTop: 8 }}>{data.clinicAddress}</div>
        )}
        <div style={{ fontSize: 9, color: MUTED, textAlign: "center", marginTop: 6 }}>
          Digitally generated prescription via DocOnClick — no physical signature required.
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1, height: 10, background: GREEN }} />
    </div>
  );
}
