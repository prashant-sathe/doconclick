import type { ReportColumn, SummaryCard } from "@/components/admin/reports/ReportTable";

export type ReportRow = Record<string, unknown>;

export interface ReportConfig {
  slug: string;
  title: string;
  description: string;
  category: "Doctor Financials" | "Platform Revenue & Bookings" | "Payouts & Settlements";
  endpoint: string;
  responseIsArray?: boolean; // true for the two reused finance endpoints that return a bare array
  dateFilter?: boolean;
  statusFilter?: { param: string; label: string; options: { value: string; label: string }[] };
  columns: ReportColumn<ReportRow>[];
  summaryCards?: (row: { summary?: ReportRow }, rows: ReportRow[]) => SummaryCard[];
}

const fmtCurrency = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
const fmtDate = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
const fmtDateTime = (v: unknown) => (v ? new Date(v as string).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const STATUS_TONE: Record<string, string> = {
  PAID: "badge badge-success", ACTIVE: "badge badge-success", COMPLETED: "badge badge-success",
  PENDING: "badge badge-warning", EXPIRING_SOON: "badge badge-warning", PENDING_APPROVAL: "badge badge-warning", SCHEDULED: "badge badge-info",
  EXPIRED: "badge badge-danger", REJECTED: "badge badge-danger", CANCELLED: "badge badge-danger",
  NEVER_ACTIVATED: "badge badge-gray",
};
function StatusBadge({ value }: { value: unknown }) {
  const v = String(value ?? "");
  return <span className={STATUS_TONE[v] ?? "badge badge-gray"}>{v || "—"}</span>;
}

export const REPORT_CONFIGS: ReportConfig[] = [
  // ── Doctor Financials ──────────────────────────────────────────
  {
    slug: "doctor-registrations",
    title: "Doctor Registration Payments",
    description: "Which doctors paid the ₹99 registration fee, when, and who's still pending.",
    category: "Doctor Financials",
    endpoint: "/api/admin/reports/doctor-registrations",
    statusFilter: { param: "status", label: "Fee status", options: [{ value: "ALL", label: "All" }, { value: "PAID", label: "Paid" }, { value: "PENDING", label: "Pending" }] },
    columns: [
      { key: "doctorName", label: "Doctor" },
      { key: "doctorMobile", label: "Mobile" },
      { key: "feeStatus", label: "Status", render: (r) => <StatusBadge value={r.feeStatus} /> },
      { key: "amount", label: "Amount", align: "right", render: (r) => fmtCurrency(r.amount), csvValue: (r) => Number(r.amount ?? 0) },
      { key: "paidAt", label: "Paid On", render: (r) => fmtDate(r.paidAt), csvValue: (r) => fmtDate(r.paidAt) },
      { key: "registeredOn", label: "Registered On", render: (r) => fmtDate(r.registeredOn), csvValue: (r) => fmtDate(r.registeredOn) },
    ],
    summaryCards: (data) => [
      { label: "Total Doctors", value: str((data.summary?.totalDoctors)) },
      { label: "Paid", value: str(data.summary?.paidCount), tone: "success" },
      { label: "Pending", value: str(data.summary?.pendingCount), tone: "warning" },
      { label: "Total Collected", value: fmtCurrency(data.summary?.totalCollected), tone: "purple" },
    ],
  },
  {
    slug: "doctor-expiry",
    title: "Doctor Registration / Subscription Expiry",
    description: "When each doctor's free trial or paid subscription lapses.",
    category: "Doctor Financials",
    endpoint: "/api/admin/reports/doctor-expiry",
    statusFilter: {
      param: "status", label: "Expiry status",
      options: [{ value: "ALL", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "EXPIRING_SOON", label: "Expiring Soon" }, { value: "EXPIRED", label: "Expired" }, { value: "NEVER_ACTIVATED", label: "Never Activated" }],
    },
    columns: [
      { key: "doctorName", label: "Doctor" },
      { key: "doctorMobile", label: "Mobile" },
      { key: "expiryStatus", label: "Status", render: (r) => <StatusBadge value={r.expiryStatus} /> },
      { key: "effectiveExpiry", label: "Expires On", render: (r) => fmtDate(r.effectiveExpiry), csvValue: (r) => fmtDate(r.effectiveExpiry) },
      { key: "daysRemaining", label: "Days Left", align: "right", render: (r) => (r.daysRemaining === null ? "—" : String(r.daysRemaining)) },
      { key: "trialEndsAt", label: "Trial Ends", render: (r) => fmtDate(r.trialEndsAt), csvValue: (r) => fmtDate(r.trialEndsAt) },
      { key: "subscriptionPaidUntil", label: "Subscription Paid Until", render: (r) => fmtDate(r.subscriptionPaidUntil), csvValue: (r) => fmtDate(r.subscriptionPaidUntil) },
    ],
    summaryCards: (data) => [
      { label: "Active", value: str(data.summary?.active), tone: "success" },
      { label: "Expiring Soon", value: str(data.summary?.expiringSoon), tone: "warning" },
      { label: "Expired", value: str(data.summary?.expired), tone: "danger" },
      { label: "Never Activated", value: str(data.summary?.neverActivated) },
    ],
  },
  {
    slug: "subscription-payments",
    title: "Doctor Subscription Payment History",
    description: "Monthly ₹499 subscription renewals paid by doctors.",
    category: "Doctor Financials",
    endpoint: "/api/admin/reports/subscription-payments",
    dateFilter: true,
    columns: [
      { key: "doctorName", label: "Doctor" },
      { key: "doctorMobile", label: "Mobile" },
      { key: "amount", label: "Amount", align: "right", render: (r) => fmtCurrency(r.amount), csvValue: (r) => Number(r.amount ?? 0) },
      { key: "paidAt", label: "Paid On", render: (r) => fmtDateTime(r.paidAt), csvValue: (r) => fmtDateTime(r.paidAt) },
      { key: "cashfreePaymentId", label: "Payment ID", render: (r) => str(r.cashfreePaymentId) },
    ],
    summaryCards: (data) => [
      { label: "Total Payments", value: str(data.summary?.totalPayments) },
      { label: "Total Collected", value: fmtCurrency(data.summary?.totalCollected), tone: "purple" },
    ],
  },

  // ── Platform Revenue & Bookings ────────────────────────────────
  {
    slug: "revenue-summary",
    title: "Platform Revenue Summary",
    description: "Gross revenue, platform commission, registration/subscription income, and doctor payouts — with a daily trend.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/revenue-summary",
    dateFilter: true,
    columns: [
      { key: "date", label: "Date", render: (r) => fmtDate(r.date), csvValue: (r) => str(r.date) },
      { key: "consultRevenue", label: "Consult Revenue", align: "right", render: (r) => fmtCurrency(r.consultRevenue), csvValue: (r) => Number(r.consultRevenue ?? 0) },
      { key: "platformCommission", label: "Platform Commission", align: "right", render: (r) => fmtCurrency(r.platformCommission), csvValue: (r) => Number(r.platformCommission ?? 0) },
      { key: "registrationRevenue", label: "Registration Fees", align: "right", render: (r) => fmtCurrency(r.registrationRevenue), csvValue: (r) => Number(r.registrationRevenue ?? 0) },
      { key: "subscriptionRevenue", label: "Subscription Fees", align: "right", render: (r) => fmtCurrency(r.subscriptionRevenue), csvValue: (r) => Number(r.subscriptionRevenue ?? 0) },
    ],
    summaryCards: (data) => [
      { label: "Gross Consult Revenue", value: fmtCurrency(data.summary?.grossConsultRevenue) },
      { label: "Platform Earnings", value: fmtCurrency(data.summary?.totalPlatformEarnings), tone: "success" },
      { label: "Doctor Net Payout", value: fmtCurrency(data.summary?.doctorNetPayout), tone: "purple" },
      { label: "Registration + Subscription", value: fmtCurrency(Number(data.summary?.registrationRevenue ?? 0) + Number(data.summary?.subscriptionRevenue ?? 0)) },
    ],
  },
  {
    slug: "revenue-by-consult-type",
    title: "Revenue by Consult Type",
    description: "Clinic vs Home Visit vs Video revenue breakdown.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/revenue-by-consult-type",
    dateFilter: true,
    columns: [
      { key: "consultType", label: "Consult Type" },
      { key: "bookingCount", label: "Bookings", align: "right" },
      { key: "grossRevenue", label: "Gross Revenue", align: "right", render: (r) => fmtCurrency(r.grossRevenue), csvValue: (r) => Number(r.grossRevenue ?? 0) },
      { key: "platformCommission", label: "Platform Commission", align: "right", render: (r) => fmtCurrency(r.platformCommission), csvValue: (r) => Number(r.platformCommission ?? 0) },
      { key: "doctorNetPayout", label: "Doctor Net Payout", align: "right", render: (r) => fmtCurrency(r.doctorNetPayout), csvValue: (r) => Number(r.doctorNetPayout ?? 0) },
    ],
    summaryCards: (data) => [
      { label: "Total Bookings", value: str(data.summary?.totalBookings) },
      { label: "Total Revenue", value: fmtCurrency(data.summary?.totalRevenue), tone: "purple" },
    ],
  },
  {
    slug: "payment-collection",
    title: "Payment Collection Report",
    description: "Online vs Cash collection totals, plus bookings still unpaid.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/payment-collection",
    dateFilter: true,
    columns: [
      { key: "patientName", label: "Patient" },
      { key: "doctorName", label: "Doctor" },
      { key: "amount", label: "Amount", align: "right", render: (r) => fmtCurrency(r.amount), csvValue: (r) => Number(r.amount ?? 0) },
      { key: "paymentMethod", label: "Method" },
      { key: "status", label: "Booking Status", render: (r) => <StatusBadge value={r.status} /> },
      { key: "scheduledAt", label: "Scheduled", render: (r) => fmtDate(r.scheduledAt), csvValue: (r) => fmtDate(r.scheduledAt) },
    ],
    summaryCards: (data) => [
      { label: "Online Collected", value: fmtCurrency(data.summary?.onlineCollected), tone: "success" },
      { label: "Cash Collected", value: fmtCurrency(data.summary?.cashCollected), tone: "success" },
      { label: "Unpaid Amount", value: fmtCurrency(data.summary?.unpaidAmount), tone: "danger" },
      { label: "Unpaid Bookings", value: str(data.summary?.unpaidCount), tone: "warning" },
    ],
  },
  {
    slug: "appointments",
    title: "Appointments Report",
    description: "Full bookings register with status, payment and consult-type filters.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/appointments",
    dateFilter: true,
    statusFilter: {
      param: "status", label: "Status",
      options: [{ value: "ALL", label: "All" }, { value: "COMPLETED", label: "Completed" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "PENDING_APPROVAL", label: "Pending Approval" }, { value: "REJECTED", label: "Rejected" }, { value: "CANCELLED", label: "Cancelled" }, { value: "EXPIRED", label: "Expired" }],
    },
    columns: [
      { key: "patientName", label: "Patient" },
      { key: "doctorName", label: "Doctor" },
      { key: "consultType", label: "Type" },
      { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      { key: "paymentStatus", label: "Payment", render: (r) => <StatusBadge value={r.paymentStatus} /> },
      { key: "amount", label: "Amount", align: "right", render: (r) => fmtCurrency(r.amount), csvValue: (r) => Number(r.amount ?? 0) },
      { key: "scheduledAt", label: "Scheduled", render: (r) => fmtDateTime(r.scheduledAt), csvValue: (r) => fmtDateTime(r.scheduledAt) },
    ],
    summaryCards: (data) => [
      { label: "Total Bookings", value: str(data.summary?.totalBookings) },
      { label: "Total Amount", value: fmtCurrency(data.summary?.totalAmount), tone: "purple" },
    ],
  },
  {
    slug: "prescriptions",
    title: "Prescriptions & Documents",
    description: "Uploaded prescriptions/documents from completed bookings, for audit.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/prescriptions",
    dateFilter: true,
    columns: [
      { key: "patientName", label: "Patient" },
      { key: "doctorName", label: "Doctor" },
      { key: "scheduledAt", label: "Booking Date", render: (r) => fmtDate(r.scheduledAt), csvValue: (r) => fmtDate(r.scheduledAt) },
      { key: "fileName", label: "File" },
      { key: "uploadedAt", label: "Uploaded", render: (r) => fmtDateTime(r.uploadedAt), csvValue: (r) => fmtDateTime(r.uploadedAt) },
      {
        key: "url", label: "Document",
        render: (r) => r.url ? <a href={String(r.url)} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">View →</a> : "—",
        csvValue: (r) => str(r.url),
      },
    ],
    summaryCards: (data) => [
      { label: "Bookings With Docs", value: str(data.summary?.completedBookingsWithDocs) },
      { label: "Total Attachments", value: str(data.summary?.totalAttachments) },
    ],
  },
  {
    slug: "doctor-earnings",
    title: "Doctor-wise Earnings & Activity",
    description: "Per-doctor bookings, gross earnings, platform commission and net payout.",
    category: "Platform Revenue & Bookings",
    endpoint: "/api/admin/reports/doctor-earnings",
    dateFilter: true,
    columns: [
      { key: "doctorName", label: "Doctor" },
      { key: "specialty", label: "Specialty" },
      { key: "completedBookings", label: "Bookings", align: "right" },
      { key: "grossEarnings", label: "Gross Earnings", align: "right", render: (r) => fmtCurrency(r.grossEarnings), csvValue: (r) => Number(r.grossEarnings ?? 0) },
      { key: "platformFeePaid", label: "Platform Fee", align: "right", render: (r) => fmtCurrency(r.platformFeePaid), csvValue: (r) => Number(r.platformFeePaid ?? 0) },
      { key: "netEarnings", label: "Net Earnings", align: "right", render: (r) => fmtCurrency(r.netEarnings), csvValue: (r) => Number(r.netEarnings ?? 0) },
      { key: "avgRating", label: "Rating", align: "right", render: (r) => `★ ${Number(r.avgRating ?? 0).toFixed(1)}` },
    ],
    summaryCards: (data) => [
      { label: "Active Doctors", value: str(data.summary?.activeDoctors) },
      { label: "Total Gross Earnings", value: fmtCurrency(data.summary?.totalGrossEarnings) },
      { label: "Total Net To Doctors", value: fmtCurrency(data.summary?.totalNetToDoctor), tone: "purple" },
    ],
  },

  // ── Payouts & Settlements ───────────────────────────────────────
  {
    slug: "pending-payouts",
    title: "Pending Doctor Payouts & Cash Dues",
    description: "Online amounts the platform still owes doctors, and cash commission doctors still owe the platform.",
    category: "Payouts & Settlements",
    endpoint: "/api/admin/finance/settlements",
    responseIsArray: true,
    columns: [
      { key: "doctorName", label: "Doctor" },
      { key: "doctorMobile", label: "Mobile" },
      { key: "cashFeeOwed", label: "Cash Fee Owed", align: "right", render: (r) => fmtCurrency(r.cashFeeOwed), csvValue: (r) => Number(r.cashFeeOwed ?? 0) },
      { key: "onlinePayoutOwed", label: "Online Payout Owed", align: "right", render: (r) => fmtCurrency(r.onlinePayoutOwed), csvValue: (r) => Number(r.onlinePayoutOwed ?? 0) },
      { key: "netAmount", label: "Net", align: "right", render: (r) => fmtCurrency(r.netAmount), csvValue: (r) => Number(r.netAmount ?? 0) },
    ],
    summaryCards: (_data, rows) => [
      { label: "Doctors Awaiting Settlement", value: str(rows.length) },
      { label: "Total Net Owed", value: fmtCurrency(rows.reduce((s, r) => s + Number(r.netAmount ?? 0), 0)), tone: "purple" },
    ],
  },
  {
    slug: "settlement-history",
    title: "Settlement History",
    description: "All payouts already settled with doctors.",
    category: "Payouts & Settlements",
    endpoint: "/api/admin/finance/settlements/history",
    responseIsArray: true,
    dateFilter: true,
    columns: [
      { key: "doctor", label: "Doctor", render: (r) => str((r.doctor as { name?: string } | undefined)?.name) },
      { key: "cashCount", label: "Cash", align: "right" },
      { key: "onlineCount", label: "Online", align: "right" },
      { key: "netAmount", label: "Net Settled", align: "right", render: (r) => fmtCurrency(r.netAmount), csvValue: (r) => Number(r.netAmount ?? 0) },
      { key: "settledByAdmin", label: "Settled By", render: (r) => str((r.settledByAdmin as { name?: string } | null | undefined)?.name) },
      { key: "createdAt", label: "Settled On", render: (r) => fmtDateTime(r.createdAt), csvValue: (r) => fmtDateTime(r.createdAt) },
    ],
    summaryCards: (_data, rows) => [
      { label: "Total Settlements", value: str(rows.length) },
      { label: "Total Net Settled", value: fmtCurrency(rows.reduce((s, r) => s + Number(r.netAmount ?? 0), 0)), tone: "purple" },
    ],
  },
];

export function getReportConfig(slug: string) {
  return REPORT_CONFIGS.find((r) => r.slug === slug);
}
