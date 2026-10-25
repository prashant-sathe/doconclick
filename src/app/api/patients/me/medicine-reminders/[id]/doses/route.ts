import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, readJson } from "@/lib/routeGuards";
import { istDayKey, istStartOfDay } from "@/lib/istDate";
import { withErrorLocale } from "@/lib/apiErrors";

// POST { time, taken }: the patient ticks (or unticks) "taken" for one of
// today's doses (IST). Ticking before the dose time also means no push for
// it — the sweep only notifies doses with no row yet. Own reminders only.
export const POST = withErrorLocale(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authUser, denied } = await requireRole("PATIENT");
  if (denied) return denied;

  const { id } = await params;
  const reminder = await prisma.medicineReminder.findFirst({
    where: { id, patientId: authUser.id },
    select: { id: true, timesOfDay: true, startDate: true, endDate: true },
  });
  if (!reminder) return NextResponse.json({ error: "Medicine reminder not found." }, { status: 404 });

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const today = istDayKey(new Date());
  const todayStart = istStartOfDay(today).getTime();
  const time = typeof body.time === "string" ? body.time : "";
  const onToday = reminder.startDate.getTime() <= todayStart && !!reminder.endDate && reminder.endDate.getTime() >= todayStart;
  if (typeof body.taken !== "boolean" || !reminder.timesOfDay.includes(time) || !onToday) {
    return NextResponse.json({ error: "This dose isn't scheduled for today." }, { status: 400 });
  }

  const key = { reminderId_doseDate_doseTime: { reminderId: id, doseDate: today, doseTime: time } };
  if (body.taken) {
    await prisma.medicineDose.upsert({
      where: key,
      create: { reminderId: id, doseDate: today, doseTime: time, takenAt: new Date() },
      update: { takenAt: new Date() },
    });
  } else {
    // A row that only held the tick goes, so the dose can still be pushed.
    await prisma.medicineDose.deleteMany({ where: { reminderId: id, doseDate: today, doseTime: time, notifiedAt: null } });
    await prisma.medicineDose.updateMany({ where: { reminderId: id, doseDate: today, doseTime: time }, data: { takenAt: null } });
  }
  return NextResponse.json({ time, taken: body.taken });
});
