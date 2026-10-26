"use client";
import type { ReceiptData, ReceiptPaymentMode } from "@/lib/receipts";

// A4 @ 96dpi — same page as PrescriptionDocument.
const PAGE_W = 794;
const PAGE_H = 1123;

const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
// DocOnClick brand: primary-600 blue, accent-400 green, accent-500 dark green (see globals.css)
const TEAL = "#1d8767";
const GREEN = "#2bab85";
const NAVY = "#1a489e";
const SURFACE = "#f8fafc";

const MODE_LABEL: Record<ReceiptPaymentMode, string> = {
  ONLINE: "Online (Cashfree)",
  WALLET: "DocOnClick wallet",
  CASH: "Cash at the visit",
  FREE: "No payment due (fully discounted)",
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const istDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
      {children}
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 8, wordBreak: "break-word" }}>{children}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: strong ? 15 : 12, fontWeight: strong ? 800 : 600, color: strong ? INK : MUTED }}>
      <span>{label}</span>
      <span style={{ color: INK }}>{value}</span>
    </div>
  );
}

export default function ReceiptDocument({ data }: { data: ReceiptData }) {
  const subtotal = data.lines.reduce((sum, l) => sum + l.amount, 0);
  const th = { fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase" as const, letterSpacing: 0.6, padding: "8px 10px", textAlign: "left" as const };
  const td = { fontSize: 12, color: INK, padding: "10px", verticalAlign: "top" as const, borderTop: `1px solid ${BORDER}` };

  return (
    <div
      style={{
        width: PAGE_W,
        minHeight: PAGE_H,
        background: "#ffffff",
        color: INK,
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "36px 40px 0",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Supplier block + receipt id */}
      <div style={{ borderBottom: `4px solid ${GREEN}`, paddingBottom: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icon.png" alt="DocOnClick" style={{ width: 52, height: 44, objectFit: "contain" }} />
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{data.supplier.name}</div>
            </div>
            {data.supplier.address && <div style={{ fontSize: 12, color: MUTED, marginTop: 6, maxWidth: 380, whiteSpace: "pre-line" }}>{data.supplier.address}</div>}
            {data.supplier.gstin && <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginTop: 4 }}>GSTIN: {data.supplier.gstin}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, letterSpacing: 1 }}>PAYMENT RECEIPT</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Receipt No.: {data.receiptNo}</div>
            <div style={{ fontSize: 11, color: MUTED }}>Date: {istDate(data.issuedAt)}</div>
          </div>
        </div>
      </div>

      {/* Billed to / payment */}
      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 10 }}>Billed To</div>
          <Label>Name</Label>
          <Value>{data.billedTo.name}</Value>
          {data.patientName && (
            <>
              <Label>Patient</Label>
              <Value>{data.patientName}</Value>
            </>
          )}
          <Label>Mobile</Label>
          <Value>{data.billedTo.mobile}</Value>
          {data.billedTo.email && (
            <>
              <Label>Email</Label>
              <Value>{data.billedTo.email}</Value>
            </>
          )}
        </div>
        <div style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TEAL, marginBottom: 10 }}>Payment Details</div>
          <Label>Paid via</Label>
          <Value>{MODE_LABEL[data.paymentMode]}</Value>
          {data.paymentId && (
            <>
              <Label>Payment ID</Label>
              <Value>{data.paymentId}</Value>
            </>
          )}
          {data.orderId && (
            <>
              <Label>Order ID</Label>
              <Value>{data.orderId}</Value>
            </>
          )}
          {data.walletBalanceAfter != null && (
            <>
              <Label>Wallet balance after</Label>
              <Value>{rupees(data.walletBalanceAfter)}</Value>
            </>
          )}
        </div>
      </div>

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse", border: `1px solid ${BORDER}`, marginBottom: 16 }}>
        <thead style={{ background: SURFACE }}>
          <tr>
            <th style={{ ...th, width: 30 }}>#</th>
            <th style={th}>Description</th>
            <th style={{ ...th, width: 70 }}>SAC</th>
            <th style={{ ...th, width: 120, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={td}>
                <div style={{ fontWeight: 700 }}>{l.description}</div>
                {l.detail && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{l.detail}</div>}
              </td>
              <td style={td}>{l.sac ?? "—"}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{rupees(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <div style={{ width: 320 }}>
          <Row label="Subtotal" value={rupees(subtotal)} />
          {data.discount && (
            <Row label={`Discount${data.discount.code ? ` (${data.discount.code})` : ""}`} value={`− ${rupees(data.discount.amount)}`} />
          )}
          <Row label="GST" value="Nil" />
          <div style={{ borderTop: `1px solid ${INK}`, marginTop: 4 }} />
          <Row label="Total paid" value={rupees(data.total)} strong />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: INK, marginBottom: 20 }}>
        Amount in words: <span style={{ fontWeight: 700 }}>{data.totalInWords}</span>
      </div>

      {data.refundedAt && (
        <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 10, padding: 12, fontSize: 12, fontWeight: 600, marginBottom: 20 }}>
          This appointment was cancelled and the amount was refunded to the DocOnClick wallet on {istDate(data.refundedAt)}.
        </div>
      )}

      <div style={{ background: SURFACE, borderRadius: 10, padding: 14, fontSize: 11, color: MUTED, lineHeight: 1.6, marginBottom: 24 }}>
        {data.taxNote}
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{ paddingBottom: 14 }}>
        <div style={{ background: NAVY, color: "#ffffff", borderRadius: 18, padding: "8px 18px", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          DocOnClick · Your Health. Our Priority.
        </div>
        <div style={{ fontSize: 9, color: MUTED, textAlign: "center", marginTop: 8 }}>
          This is a computer-generated receipt from DocOnClick and does not require a signature.
        </div>
      </div>
      <div style={{ height: 10, background: GREEN, margin: "0 -40px" }} />
    </div>
  );
}
