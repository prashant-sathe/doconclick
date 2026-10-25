import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { patientMedicineView } from "@/lib/medicineReminders";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: the patient's medicine reminders — current medicines (own + family
// members'), today's doses, and "see the doctor again" cards (FP1-22).
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  return NextResponse.json(await patientMedicineView(authUser.id));
});

// PATCH { enabled }: the master switch for every medicine-dose push.
export const PATCH = withErrorLocale(async function PATCH(req: Request) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  await prisma.user.update({ where: { id: authUser.id }, data: { medicineRemindersEnabled: body.enabled } });
  return NextResponse.json({ enabled: body.enabled });
});
