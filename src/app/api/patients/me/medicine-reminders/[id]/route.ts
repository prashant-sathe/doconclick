import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { normalizeDoseTimes, MAX_COURSE_DAYS } from "@/lib/medicineSchedule";
import { addDaysYmd, istDayKey, istStartOfDay } from "@/lib/istDate";
import { withErrorLocale } from "@/lib/apiErrors";

// PATCH { enabled?, timesOfDay?, days? }: the patient switches one medicine's
// reminders on/off, or picks its dose times (IST "HH:mm", outside 22:00–06:00)
// and how many days the course runs — the manual fallback when the
// prescription's frequency/duration couldn't be read. Own reminders only.
export const PATCH = withErrorLocale(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  const reminder = await prisma.medicineReminder.findFirst({ where: { id, patientId: authUser.id }, select: { id: true, startDate: true } });
  if (!reminder) return NextResponse.json({ error: "Medicine reminder not found." }, { status: 404 });

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;

  const data: { enabled?: boolean; timesOfDay?: string[]; endDate?: Date; setByPatient?: boolean } = {};
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    data.enabled = body.enabled;
  }
  if (body.timesOfDay !== undefined) {
    const times = normalizeDoseTimes(body.timesOfDay);
    if (!times || times.length === 0) {
      return NextResponse.json({ error: "Pick 1 to 6 dose times between 6 am and 10 pm." }, { status: 400 });
    }
    data.timesOfDay = times;
    data.setByPatient = true;
  }
  if (body.days !== undefined) {
    const days = Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_COURSE_DAYS) {
      return NextResponse.json({ error: `The course can be 1 to ${MAX_COURSE_DAYS} days.` }, { status: 400 });
    }
    data.endDate = istStartOfDay(addDaysYmd(istDayKey(reminder.startDate), days - 1));
    data.setByPatient = true;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const updated = await prisma.medicineReminder.update({
    where: { id },
    data,
    select: { id: true, enabled: true, timesOfDay: true, endDate: true },
  });
  return NextResponse.json({ ...updated, endDate: updated.endDate ? istDayKey(updated.endDate) : null });
});
