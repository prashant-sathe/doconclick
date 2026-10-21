import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { bookableDoctorWhere } from "@/lib/doctorBookable";
import { getAuthUser } from "@/lib/auth";
import { getOpenAIClient, ASSISTANT_MODEL } from "@/lib/openai";
import { ensureSpecialtiesSeeded } from "@/lib/specialties";
import { haversine, withinSearchRadius } from "@/lib/geo";
import { isClinicOpenNow } from "@/lib/clinicAvailability";
import { ensureNurseServices } from "@/lib/nurseServices";
import { searchNurses } from "@/lib/nurseSearch";
import { readJson } from "@/lib/routeGuards";
import { parseBody, assistantRequestSchema } from "@/lib/schemas";

type InputItem = OpenAI.Responses.ResponseInputItem;
type FunctionCall = OpenAI.Responses.ResponseFunctionToolCall;

const MAX_TOOL_ITERATIONS = 6;

// In-memory per-patient rate limit. Resets on restart and doesn't share
// state across multiple app instances — fine for the current single-container
// deployment; revisit with a shared store if this ever scales out.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const requestLog = new Map<string, number[]>();

function checkRateLimit(patientId: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(patientId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  requestLog.set(patientId, timestamps);
  return true;
}

const SYSTEM_PROMPT = `You are the DocOnClick Health Assistant — you help patients in India figure out which type of doctor to see, then point them to real doctors on the platform. You can also point them to registered nurses who come home for nursing care. You also help with account/app issues (booking problems, payment disputes, complaints) by raising a support ticket. You are not a doctor.

Rules:
- Never diagnose a condition, and never recommend medicines, dosages, or treatment. Your only job is triage: understand the symptoms well enough to recommend a medical specialty.
- All prices are in Indian Rupees (₹). Never mention insurance or copays — those aren't part of this app.
- Emergencies come first. If the patient describes any of these red flags, stop triage and tell them clearly to call 112 or go to the nearest hospital emergency department now (you can still offer to find a doctor for afterwards):
  - severe chest pain or pressure;
  - significant difficulty breathing;
  - uncontrolled or heavy bleeding;
  - sudden loss of consciousness, fainting with no recovery, or unresponsiveness;
  - sudden one-sided weakness, facial droop or slurred speech (stroke signs);
  - a seizure or convulsions (fits) that are happening now, last over 5 minutes, repeat, or are a first-ever seizure;
  - signs of a severe allergic reaction (anaphylaxis) — swelling of the face, lips, tongue or throat, trouble breathing or swallowing, or collapse after a sting, food or medicine;
  - poisoning or overdose — swallowed medicines, chemicals, pesticide or kerosene, or a snake or scorpion bite;
  - a head injury followed by vomiting, confusion, drowsiness, a seizure, or having been knocked out;
  - bleeding from the vagina, severe abdominal pain, or fits during pregnancy;
  - fever in a baby under 3 months old, or a baby or child who is floppy, unusually drowsy, or not feeding;
  - serious burns — large, deep, or on the face, hands, genitals or airway, or electrical or chemical burns.
- Self-harm or suicide: if the patient mentions thoughts of harming themselves or ending their life, respond with care and without judgement, and share Tele-MANAS — India's free, 24×7 mental health helpline — on 14416 (or 1-800-891-4416). If they are in immediate danger or have already harmed themselves, tell them to call 112 now. Gently encourage them to reach out to someone they trust; you can also offer to find a psychiatrist or psychologist on the platform.
- Without a red flag, the right next step is the right doctor on the platform — recommend one as usual rather than adding a routine "go to the ER" to every answer. If you genuinely can't tell whether something is an emergency, err on the side of safety and say so.
- Call get_my_profile early if useful context (age, allergies, existing conditions) would sharpen your triage — don't make the patient repeat what's already on file. Call get_my_appointments if they ask about a past or upcoming visit.
- Always call the list_specialties and find_doctors tools rather than naming a specialty or doctor from your own knowledge — the app's specialty list and doctor directory are the source of truth.
- Ask short, focused questions, one or two at a time. Whenever a question has a small set of likely answers, also call suggest_quick_replies with those options so the app can show tappable chips.
- Once you have enough information, call find_doctors with the specialty you've settled on, and briefly explain your reasoning in the same turn. find_doctors already respects the patient's chosen search range — if it returns no doctors and a range is set, say so and suggest widening the range in their profile (Profile → Doctor Search Range).
- You never book appointments yourself. Once you've shown doctors, the patient books through the app's normal booking screen — just recommend, don't try to complete a booking in the conversation.
- For app/account problems that aren't medical — a payment that didn't go through, a booking bug, a billing dispute, a complaint about a doctor's conduct, or anything else needing a human to step in — call create_support_ticket so the DocOnClick team can follow up, and tell the patient you've done so. Never raise a ticket for a medical question; that's what specialty recommendations are for. If the patient asks about a ticket they raised before, call list_my_support_tickets.
- Nurses (home nursing care): when the patient needs care or a procedure done at home rather than a diagnosis — giving a doctor-prescribed injection or IV drip, wound dressing, catheter care, removing stitches, BP/sugar checks, nebulization, post-operative or elderly care, mother & newborn care, or someone to stay with a patient for a 12-hour / 24-hour shift — call list_nurse_services, pick the matching service, and call find_nurses with its exact name. Say briefly why a nurse fits.
- A nurse can only give medicines a doctor has already prescribed. If the service needs a prescription (requiresPrescription) and the patient has none, tell them to see a doctor first and recommend one (find_doctors) instead of nurses. If get_my_appointments shows a doctorRecommendedNurseCare item, mention it — their doctor's prescription is already attached when they book that nurse.
- New or worsening symptoms (fever, pain, breathlessness, a wound looking infected…) need a doctor, not a nurse — triage to a doctor as usual. Nurses never replace a doctor's diagnosis.
- As with doctors, you never book nurses yourself; the patient taps a nurse card to book. Repeated care (e.g. an injection daily for 5 days) is booked in one go: on the booking screen they choose the number of visits (up to 14) and how often, and pay once — tell them that instead of suggesting separate bookings. Shifts (12h / 24h) can likewise be booked for several days back-to-back.`;

const TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "list_specialties",
    description: "List the medical specialties available on the platform, to choose from when recommending a doctor type.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "find_doctors",
    description: "Find approved, verified doctors on the platform for a given specialty, sorted by distance. Returns { searchRadiusKm, doctors, searchingNear? } — up to 5 doctors already filtered to the patient's chosen search range (searchRadiusKm; null means no limit). Doctors offering video are included regardless of distance. If `searchingNear` is present, the results are around that place (the patient picked it on the map, e.g. for a relative in another city) — mention it. If doctors is empty and searchRadiusKm is set, say no in-range doctors were found and suggest widening the search range in the profile.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        specialty: { type: "string", description: "Exact specialty name as returned by list_specialties." },
        consultType: {
          type: "string",
          enum: ["CLINIC", "HOME", "VIDEO"],
          description: "Preferred consultation type. Use CLINIC if the patient hasn't said.",
        },
      },
      required: ["specialty", "consultType"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "suggest_quick_replies",
    description: "Attach a short list of tappable quick-reply options to your message, for the patient to choose from instead of typing.",
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
  {
    type: "function",
    name: "get_my_profile",
    description: "Get this patient's own health profile on file: age, gender, blood group, allergies, chronic conditions, and current medications — use this instead of asking for details already on record.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_my_appointments",
    description: "Get this patient's upcoming appointments and their most recently completed ones (doctor, specialty, time, consult type, status).",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "create_support_ticket",
    description: "Raise a support ticket for the DocOnClick team when the patient has a non-medical app/account issue you can't resolve yourself (payment problem, booking bug, billing dispute, complaint about a doctor, etc).",
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
    name: "list_nurse_services",
    description: "List the home nursing services nurses on the platform offer (visit procedures and 12h/24h shifts), with whether each needs a doctor's prescription.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "find_nurses",
    description: "Find registered nurses near the patient who offer one nursing service, nearest first. Returns { service, nurses, needsLocation, hasDoctorReferral }. If needsLocation is true, ask the patient to add their home address in their profile (Profile → Location & Address). hasDoctorReferral means a doctor on the platform already recommended this service for them.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        serviceName: { type: "string", description: "Exact service name as returned by list_nurse_services." },
      },
      required: ["serviceName"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_my_support_tickets",
    description: "List this patient's previously raised support tickets and their status.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

async function listSpecialties() {
  await ensureSpecialtiesSeeded();
  return prisma.specialty.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { name: true, color: true },
  });
}

function feeForConsultType(
  profile: { consultFee: number; videoFee: number; homeVisitFee: number },
  consultType: string
): number {
  if (consultType === "VIDEO") return profile.videoFee;
  if (consultType === "HOME") return profile.homeVisitFee;
  return profile.consultFee;
}

type Origin = { lat: number; lng: number; label?: string } | null;

async function findDoctors(
  patientId: string,
  args: { specialty: string; consultType: string },
  origin: Origin,
) {
  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: patientId },
    select: { lat: true, lng: true, searchRadiusKm: true },
  });
  const radiusKm = patientProfile?.searchRadiusKm ?? null;
  // A location the patient pinned on the map (e.g. booking for a relative in
  // another city) overrides their saved profile coordinates.
  const fromLat = origin?.lat ?? patientProfile?.lat ?? null;
  const fromLng = origin?.lng ?? patientProfile?.lng ?? null;

  const now = new Date();
  const doctors = await prisma.user.findMany({
    where: bookableDoctorWhere({ specialty: { equals: args.specialty, mode: "insensitive" } }),
    include: { doctorProfile: true, clinics: { where: { isActive: true }, include: { slots: true } } },
    take: 20,
  });

  const withDistance = doctors
    .filter((d) => d.doctorProfile)
    .map((d) => {
      const profile = d.doctorProfile!;
      const distanceKm =
        fromLat != null && fromLng != null && profile.lat != null && profile.lng != null
          ? haversine(fromLat, fromLng, profile.lat, profile.lng)
          : null;
      const canHomeVisit =
        profile.offersHomeVisit && !(distanceKm != null && distanceKm > profile.radius);
      const canClinicVisit =
        profile.offersClinic && d.clinics.some((c) => isClinicOpenNow(c.slots, now));
      return {
        id: d.id,
        name: d.name,
        photoUrl: profile.photoUrl,
        specialty: profile.specialty,
        avgRating: profile.avgRating,
        totalReviews: profile.totalReviews,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        fee: feeForConsultType(profile, args.consultType),
        availability: profile.availability,
        offersHomeVisit: canHomeVisit,
        offersClinic: canClinicVisit,
        offersVideo: profile.offersVideo,
      };
    });

  const inRange = withDistance.filter((d) =>
    withinSearchRadius(d.distanceKm, radiusKm, d.offersVideo)
  );

  inRange.sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return {
    searchRadiusKm: radiusKm,
    ...(origin?.label ? { searchingNear: origin.label } : {}),
    doctors: inRange.slice(0, 5),
  };
}

async function listNurseServices() {
  await ensureNurseServices();
  const services = await prisma.nurseService.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, kind: true, description: true, requiresPrescription: true, durationMinutes: true, suggestedPrice: true },
  });
  return services.map((s) => ({
    name: s.name,
    type: s.kind === "SHIFT" ? `shift (${Math.round(s.durationMinutes / 60)} hours)` : "visit",
    description: s.description,
    requiresPrescription: s.requiresPrescription,
    typicalPrice: s.suggestedPrice,
  }));
}

async function findNurses(patientId: string, args: { serviceName: string }, origin: Origin) {
  const service = await prisma.nurseService.findFirst({
    where: { name: { equals: args.serviceName, mode: "insensitive" }, isActive: true },
  });
  if (!service) return { error: `No nursing service called "${args.serviceName}". Call list_nurse_services for the exact names.` };
  const [result, referral] = await Promise.all([
    searchNurses({ patientId, serviceId: service.id, lat: origin?.lat ?? null, lng: origin?.lng ?? null }),
    prisma.nurseReferral.findFirst({
      // Only referrals from completed consultations count (src/lib/nurseReferral.ts).
      where: { serviceId: service.id, appointment: { patientId, status: "COMPLETED" }, bookings: { none: {} } },
      select: { id: true },
    }),
  ]);
  return {
    service: { id: service.id, name: service.name, kind: service.kind, requiresPrescription: service.requiresPrescription },
    needsLocation: result.needsLocation,
    hasDoctorReferral: !!referral,
    nurses: result.nurses.slice(0, 5).map((n) => ({
      id: n.id, name: n.name, photoUrl: n.photoUrl, price: n.price, distanceKm: n.distanceKm,
      avgRating: n.avgRating, totalReviews: n.totalReviews, experience: n.experience, qualification: n.qualification,
      gender: n.gender, policeVerified: n.policeVerified, availability: n.availability, busyNow: n.busyNow,
    })),
  };
}

async function getMyProfile(patientId: string) {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId: patientId },
    select: { age: true, gender: true, bloodGroup: true, allergies: true, chronicDiseases: true, medications: true },
  });
  return profile ?? { error: "No health profile on file yet." };
}

function apptLabel(a: { scheduledAt: Date; consultType: string; status: string; doctor: { name: string; doctorProfile: { specialty: string } | null } }) {
  return {
    doctorName: a.doctor.name,
    specialty: a.doctor.doctorProfile?.specialty ?? null,
    time: a.scheduledAt,
    consultType: a.consultType,
    status: a.status,
  };
}

async function getMyAppointments(patientId: string) {
  const now = new Date();
  const select = {
    scheduledAt: true,
    consultType: true,
    status: true,
    doctor: { select: { name: true, doctorProfile: { select: { specialty: true } } } },
  } as const;

  const [upcoming, recentCompleted] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId, status: "SCHEDULED", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select,
    }),
    prisma.appointment.findMany({
      where: { patientId, status: "COMPLETED" },
      orderBy: { scheduledAt: "desc" },
      take: 5,
      select,
    }),
  ]);

  // Nurse care a doctor recommended that the patient hasn't booked yet.
  const referrals = await prisma.nurseReferral.findMany({
    where: { appointment: { patientId, status: "COMPLETED" }, bookings: { none: {} } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      visits: true, intervalDays: true, instructions: true,
      service: { select: { name: true } },
      appointment: { select: { doctor: { select: { name: true } } } },
    },
  });

  return {
    upcoming: upcoming.map(apptLabel),
    recentCompleted: recentCompleted.map(apptLabel),
    doctorRecommendedNurseCare: referrals.map((r) => ({
      service: r.service.name,
      visits: r.visits,
      everyDays: r.intervalDays,
      instructions: r.instructions,
      doctorName: r.appointment.doctor.name,
    })),
  };
}

async function createSupportTicket(patientId: string, args: { subject: string; description: string }) {
  const ticket = await prisma.complaint.create({
    data: { userId: patientId, subject: args.subject.slice(0, 200), description: args.description.slice(0, 4000) },
  });
  return { id: ticket.id, subject: ticket.subject, status: ticket.status, createdAt: ticket.createdAt };
}

async function listMySupportTickets(patientId: string) {
  return prisma.complaint.findMany({
    where: { userId: patientId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, subject: true, description: true, status: true, createdAt: true },
  });
}

async function executeTool(call: FunctionCall, patientId: string, origin: Origin): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return { error: "Invalid arguments" };
  }

  switch (call.name) {
    case "list_specialties":
      return listSpecialties();
    case "find_doctors":
      return findDoctors(patientId, {
        specialty: String(args.specialty ?? ""),
        consultType: String(args.consultType ?? "CLINIC"),
      }, origin);
    case "suggest_quick_replies":
      return { ok: true };
    case "get_my_profile":
      return getMyProfile(patientId);
    case "get_my_appointments":
      return getMyAppointments(patientId);
    case "create_support_ticket":
      return createSupportTicket(patientId, {
        subject: String(args.subject ?? "").trim() || "Support request",
        description: String(args.description ?? "").trim(),
      });
    case "list_my_support_tickets":
      return listMySupportTickets(patientId);
    case "list_nurse_services":
      return listNurseServices();
    case "find_nurses":
      return findNurses(patientId, { serviceName: String(args.serviceName ?? "") }, origin);
    default:
      return { error: `Unknown tool: ${call.name}` };
  }
}

export async function POST(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "PATIENT") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!checkRateLimit(authUser.id)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
  }

  const { body: raw, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseBody(assistantRequestSchema, raw);
  if (parsed.response) return parsed.response;
  const body = parsed.data;
  const priorItems: InputItem[] = body.messages.map((m) => ({ role: m.role, content: m.content }));

  const loc = body.location as { lat?: unknown; lng?: unknown; label?: unknown } | undefined;
  const origin: Origin =
    loc && typeof loc.lat === "number" && typeof loc.lng === "number"
      ? { lat: loc.lat, lng: loc.lng, label: typeof loc.label === "string" ? loc.label : undefined }
      : null;

  let client;
  try {
    client = getOpenAIClient();
  } catch {
    return NextResponse.json({ error: "Health Assistant is not configured." }, { status: 503 });
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
      // structurally match ResponseInputItem for tool variants we never use
      // (e.g. computer-use call output) — narrow cast instead of widening
      // this file's types to cover tools this assistant doesn't have.
      newItems.push(...(response.output as unknown as InputItem[]));

      const calls = response.output.filter((item): item is FunctionCall => item.type === "function_call");
      if (calls.length === 0) break;

      for (const call of calls) {
        const result = await executeTool(call, authUser.id, origin);
        newItems.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }
    }
  } catch (err) {
    console.error("Health Assistant error:", err);
    return NextResponse.json({ error: "The assistant hit an error. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ items: newItems });
}
