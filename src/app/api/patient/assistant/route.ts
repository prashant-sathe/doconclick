import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getOpenAIClient, ASSISTANT_MODEL } from "@/lib/openai";
import { ensureSpecialtiesSeeded } from "@/lib/specialties";
import { haversine } from "@/lib/geo";

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

const SYSTEM_PROMPT = `You are the DocOnClick Health Assistant — you help patients in India figure out which type of doctor to see, then point them to real doctors on the platform. You are not a doctor.

Rules:
- Never diagnose a condition, and never recommend medicines, dosages, or treatment. Your only job is triage: understand the symptoms well enough to recommend a medical specialty.
- All prices are in Indian Rupees (₹). Never mention insurance or copays — those aren't part of this app.
- If the patient describes a possible emergency (severe chest pain, difficulty breathing, uncontrolled bleeding, loss of consciousness, signs of stroke, suicidal thoughts, or similar), stop triage immediately and tell them to call 112 or go to the nearest hospital emergency room.
- Always call the list_specialties and find_doctors tools rather than naming a specialty or doctor from your own knowledge — the app's specialty list and doctor directory are the source of truth.
- Ask short, focused questions, one or two at a time. Whenever a question has a small set of likely answers, also call suggest_quick_replies with those options so the app can show tappable chips.
- Once you have enough information, call find_doctors with the specialty you've settled on, and briefly explain your reasoning in the same turn.
- You never book appointments yourself. Once you've shown doctors, the patient books through the app's normal booking screen — just recommend, don't try to complete a booking in the conversation.`;

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
    description: "Find approved, verified doctors on the platform for a given specialty, sorted by distance from the patient. Returns up to 5 doctors.",
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

async function findDoctors(patientId: string, args: { specialty: string; consultType: string }) {
  const patientProfile = await prisma.patientProfile.findUnique({
    where: { userId: patientId },
    select: { lat: true, lng: true },
  });

  const now = new Date();
  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      deletedAt: null,
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        specialty: args.specialty,
        OR: [{ trialEndsAt: { gt: now } }, { subscriptionPaidUntil: { gt: now } }],
      },
    },
    include: { doctorProfile: true },
    take: 20,
  });

  const withDistance = doctors
    .filter((d) => d.doctorProfile)
    .map((d) => {
      const profile = d.doctorProfile!;
      const distanceKm =
        patientProfile?.lat != null && patientProfile?.lng != null && profile.lat != null && profile.lng != null
          ? haversine(patientProfile.lat, patientProfile.lng, profile.lat, profile.lng)
          : null;
      return {
        id: d.id,
        name: d.name,
        specialty: profile.specialty,
        avgRating: profile.avgRating,
        totalReviews: profile.totalReviews,
        distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
        fee: feeForConsultType(profile, args.consultType),
        availability: profile.availability,
        offersHomeVisit: profile.offersHomeVisit,
        offersClinic: profile.offersClinic,
        offersVideo: profile.offersVideo,
      };
    });

  withDistance.sort((a, b) => {
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return withDistance.slice(0, 5);
}

async function executeTool(call: FunctionCall, patientId: string): Promise<unknown> {
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
      });
    case "suggest_quick_replies":
      return { ok: true };
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
        const result = await executeTool(call, authUser.id);
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
