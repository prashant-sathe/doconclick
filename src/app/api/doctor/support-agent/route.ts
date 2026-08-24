import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOpenAIClient, ASSISTANT_MODEL } from "@/lib/openai";
import { safeNum } from "@/lib/adminAuth";
import { computeDoctorCompleteness } from "@/lib/doctorProfileCompleteness";

type InputItem = OpenAI.Responses.ResponseInputItem;
type FunctionCall = OpenAI.Responses.ResponseFunctionToolCall;

const MAX_TOOL_ITERATIONS = 6;

// In-memory per-doctor rate limit, mirrors the patient Health Assistant —
// resets on restart and doesn't share state across instances, fine for the
// current single-container deployment.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const requestLog = new Map<string, number[]>();

function checkRateLimit(doctorId: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(doctorId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  requestLog.set(doctorId, timestamps);
  return true;
}

const SYSTEM_PROMPT = `You are the DocOnClick Doctor Support Assistant — you help doctors on the platform with questions about their appointments, earnings, subscription/verification status, and platform policies. You are not a medical assistant and you don't discuss patient medical care.

What you know about how the platform works:
- Appointment lifecycle: a booking starts PENDING_APPROVAL, the doctor accepts or rejects it (accepting sets acceptedAt and moves it to SCHEDULED), and it later becomes COMPLETED or CANCELLED. For home visits, travel status moves NOT_STARTED → ON_THE_WAY → ARRIVED, with live location shared to the patient.
- Clinic locations and their weekly recurring slots are managed on the Clinics page. A doctor can run multiple clinic locations.
- Consultations can be CLINIC, HOME, or VIDEO — video uses in-app calling, no external link needed.
- Payments are either CASH (collected in person) or ONLINE (paid in the app). DocOnClick takes a commission on every completed, paid appointment, and the rate can differ by consult type. On a cash appointment the doctor owes that commission to the platform; on an online appointment the platform already holds the money and owes the doctor their share. An admin periodically reviews and settles a doctor's outstanding balance — always call get_earnings_summary for this doctor's real numbers rather than guessing any amount.
- To appear in patient search and accept bookings, a doctor's profile must be APPROVED and verified, the one-time registration fee must be paid, and either the free trial or a paid subscription must currently be active. A more complete profile (qualification, registration number, experience & fees, a clinic location, bank details, photo, and uploaded certificates/KYC docs) builds patient trust and is tracked as a completeness score.
- Reviews and ratings come from patients after a completed appointment and affect the doctor's public profile.

Rules:
- Always call the relevant tool (get_appointment_overview, get_earnings_summary, get_account_status, get_recent_reviews) to fetch this doctor's real data before answering a question about their own schedule, money, account, or reputation — never guess numbers.
- Don't wait to be asked. If something in the doctor's real data looks like a problem — a growing unsettled balance with no recent settlement, a subscription about to lapse, an unusually low rating or a harsh recent review, an account stuck unverified — proactively point it out and offer to raise a ticket for it, even if the doctor hasn't complained about it themselves.
- For anything you can't resolve yourself — a payment that seems missing, a technical bug, a dispute with a patient, an unfair review, an account or verification problem, or any request that needs a human decision — call create_support_ticket so the DocOnClick team can follow up, and tell the doctor you've done so. Write a clear, specific subject and description from the conversation so far and from whatever tool data you already pulled; don't ask the doctor to repeat details you already have.
- If the doctor asks about a ticket they raised before, call list_my_support_tickets.
- Whenever a question has a small set of likely answers, also call suggest_quick_replies with those options so the app can show tappable chips.
- Keep answers short and specific to this platform. Never invent policies, fees, or dates you don't have from a tool or from the facts above.`;

const TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "get_appointment_overview",
    description: "Get this doctor's current appointment counts: pending approvals, today's scheduled appointments, completed appointments in the last 7 days, and the next upcoming appointment.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_earnings_summary",
    description: "Get this doctor's real earnings: unsettled cash/online appointment counts and amounts owed, lifetime completed earnings, and their most recent settlement from admin.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_account_status",
    description: "Get this doctor's verification status, registration fee status, trial/subscription status, and profile completeness with the list of missing items.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_recent_reviews",
    description: "Get this doctor's average rating and their most recent patient reviews (rating, comment, date) — use this before discussing reputation, a specific review, or a rating dispute.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "create_support_ticket",
    description: "Raise a support ticket for the DocOnClick team when the doctor has an issue you can't resolve yourself (billing dispute, bug, account problem, policy exception, etc).",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Short, specific summary of the issue (under 80 chars)." },
        description: { type: "string", description: "Full detail of the issue, written from the conversation so far." },
      },
      required: ["subject", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_my_support_tickets",
    description: "List this doctor's previously raised support tickets and their status.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "suggest_quick_replies",
    description: "Attach a short list of tappable quick-reply options to your message, for the doctor to choose from instead of typing.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        options: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 6,
          description: "2-6 short reply options.",
        },
      },
      required: ["options"],
      additionalProperties: false,
    },
  },
];

function patientLabelFor(a: { patientName: string | null; relation: string; patient: { name: string } }): string {
  return a.relation !== "Self" && a.patientName ? a.patientName : a.patient.name;
}

async function getAppointmentOverview(doctorId: string) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [pendingApprovalCount, todayAppointments, completedThisWeek, nextUpcoming] = await Promise.all([
    prisma.appointment.count({ where: { doctorId, status: "PENDING_APPROVAL" } }),
    prisma.appointment.findMany({
      where: { doctorId, status: "SCHEDULED", scheduledAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      select: { scheduledAt: true, consultType: true, patientName: true, relation: true, patient: { select: { name: true } } },
    }),
    prisma.appointment.count({ where: { doctorId, status: "COMPLETED", scheduledAt: { gte: weekAgo } } }),
    prisma.appointment.findFirst({
      where: { doctorId, status: "SCHEDULED", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, consultType: true, patientName: true, relation: true, patient: { select: { name: true } } },
    }),
  ]);

  return {
    pendingApprovalCount,
    todayScheduled: {
      count: todayAppointments.length,
      items: todayAppointments.map((a) => ({
        time: a.scheduledAt,
        patient: patientLabelFor(a),
        consultType: a.consultType,
      })),
    },
    completedThisWeek,
    nextUpcoming: nextUpcoming
      ? { time: nextUpcoming.scheduledAt, patient: patientLabelFor(nextUpcoming), consultType: nextUpcoming.consultType }
      : null,
  };
}

const UNSETTLED_WHERE = { status: "COMPLETED", paymentStatus: "PAID", settlementId: null } as const;

async function getEarningsSummary(doctorId: string) {
  const [unsettledGrouped, lifetime, recentSettlements] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["paymentMethod"],
      where: { ...UNSETTLED_WHERE, doctorId },
      _sum: { amount: true, platformFee: true },
      _count: true,
    }),
    prisma.appointment.aggregate({
      where: { doctorId, status: "COMPLETED", paymentStatus: "PAID" },
      _sum: { amount: true, platformFee: true },
      _count: true,
    }),
    prisma.settlement.findMany({ where: { doctorId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const lastSettlement = recentSettlements[0] ?? null;

  let cashCount = 0;
  let onlineCount = 0;
  let cashFeeOwed = 0;
  let onlinePayoutOwed = 0;
  for (const g of unsettledGrouped) {
    if (g.paymentMethod === "CASH") {
      cashCount = g._count;
      cashFeeOwed = safeNum(g._sum.platformFee);
    } else if (g.paymentMethod === "ONLINE") {
      onlineCount = g._count;
      onlinePayoutOwed = safeNum(g._sum.amount) - safeNum(g._sum.platformFee);
    }
  }

  const grossEarnings = safeNum(lifetime._sum.amount);
  const platformFeePaid = safeNum(lifetime._sum.platformFee);

  return {
    unsettled: { cashCount, onlineCount, cashFeeOwed, onlinePayoutOwed, netAmount: onlinePayoutOwed - cashFeeOwed },
    lifetime: { completedCount: lifetime._count, grossEarnings, platformFeePaid, netEarnings: grossEarnings - platformFeePaid },
    lastSettlement: lastSettlement
      ? {
          netAmount: lastSettlement.netAmount,
          cashCount: lastSettlement.cashCount,
          onlineCount: lastSettlement.onlineCount,
          createdAt: lastSettlement.createdAt,
        }
      : null,
    settlementHistory: recentSettlements.map((s) => ({
      netAmount: s.netAmount,
      cashCount: s.cashCount,
      onlineCount: s.onlineCount,
      createdAt: s.createdAt,
    })),
  };
}

async function getRecentReviews(doctorId: string) {
  const [profile, reviews] = await Promise.all([
    prisma.doctorProfile.findUnique({ where: { userId: doctorId }, select: { avgRating: true, totalReviews: true } }),
    prisma.review.findMany({
      where: { doctorId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { rating: true, comment: true, createdAt: true, patient: { select: { name: true } } },
    }),
  ]);

  return {
    avgRating: profile?.avgRating ?? 0,
    totalReviews: profile?.totalReviews ?? 0,
    recent: reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      patientName: r.patient.name,
    })),
  };
}

async function getAccountStatus(doctorId: string) {
  const [profile, hasClinic] = await Promise.all([
    prisma.doctorProfile.findUnique({ where: { userId: doctorId } }),
    prisma.clinic.count({ where: { doctorId, isActive: true } }).then((c) => c > 0),
  ]);
  if (!profile) return { error: "No doctor profile found." };

  const now = new Date();
  const trialActive = !!profile.trialEndsAt && profile.trialEndsAt > now;
  const subscriptionActive = !!profile.subscriptionPaidUntil && profile.subscriptionPaidUntil > now;
  const activeUntil = [profile.trialEndsAt, profile.subscriptionPaidUntil]
    .filter((d): d is Date => !!d && d > now)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const completeness = computeDoctorCompleteness({
    qualification: profile.qualification,
    medRegNo: profile.medRegNo,
    experience: profile.experience,
    consultFee: profile.consultFee,
    bankDetails: profile.bankDetails,
    photoUrl: profile.photoUrl,
    medRegCertUrl: profile.medRegCertUrl,
    degreeCertUrl: profile.degreeCertUrl,
    kycDocUrl: profile.kycDocUrl,
    hasClinic,
  });

  return {
    verification: { status: profile.status, isVerified: profile.isVerified },
    registrationFee: { paid: profile.registrationFeePaid, status: profile.registrationFeeStatus },
    subscription: {
      trialActive,
      subscriptionActive,
      isCurrentlyBookable: trialActive || subscriptionActive,
      activeUntil,
      daysRemaining: activeUntil ? Math.ceil((activeUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 0,
    },
    profileCompleteness: {
      percent: completeness.percent,
      missingItems: completeness.items.filter((i) => !i.done).map((i) => i.label),
    },
  };
}

async function createSupportTicket(doctorId: string, args: { subject: string; description: string }) {
  const ticket = await prisma.complaint.create({
    data: { userId: doctorId, subject: args.subject.slice(0, 200), description: args.description.slice(0, 4000) },
  });
  return { id: ticket.id, subject: ticket.subject, status: ticket.status, createdAt: ticket.createdAt };
}

async function listMySupportTickets(doctorId: string) {
  const tickets = await prisma.complaint.findMany({
    where: { userId: doctorId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, subject: true, description: true, status: true, createdAt: true },
  });
  return tickets;
}

async function executeTool(call: FunctionCall, doctorId: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return { error: "Invalid arguments" };
  }

  switch (call.name) {
    case "get_appointment_overview":
      return getAppointmentOverview(doctorId);
    case "get_earnings_summary":
      return getEarningsSummary(doctorId);
    case "get_account_status":
      return getAccountStatus(doctorId);
    case "get_recent_reviews":
      return getRecentReviews(doctorId);
    case "create_support_ticket":
      return createSupportTicket(doctorId, {
        subject: String(args.subject ?? "").trim() || "Support request",
        description: String(args.description ?? "").trim(),
      });
    case "list_my_support_tickets":
      return listMySupportTickets(doctorId);
    case "suggest_quick_replies":
      return { ok: true };
    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}

export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "DOCTOR") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!checkRateLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }
  const priorItems = body.messages as InputItem[];

  let client;
  try {
    client = getOpenAIClient();
  } catch {
    return NextResponse.json({ error: "Support Assistant is not configured." }, { status: 503 });
  }

  const newItems: InputItem[] = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.responses.create({
        model: ASSISTANT_MODEL,
        instructions: SYSTEM_PROMPT,
        input: [...priorItems, ...newItems],
        tools: TOOLS,
        reasoning: { effort: "low" },
        max_output_tokens: 4096,
        store: false,
      });

      // response.output items are valid conversation input items on the next
      // turn (the documented multi-turn pattern), but their type doesn't
      // structurally match ResponseInputItem for tool variants we never use —
      // narrow cast instead of widening this file's types to cover tools this
      // assistant doesn't have.
      newItems.push(...(response.output as unknown as InputItem[]));

      const calls = response.output.filter((item): item is FunctionCall => item.type === "function_call");
      if (calls.length === 0) break;

      for (const call of calls) {
        const result = await executeTool(call, authUser.id);
        newItems.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }
    }
  } catch (err) {
    console.error("Doctor Support Assistant error:", err);
    return NextResponse.json({ error: "The assistant hit an error. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ items: newItems });
}
