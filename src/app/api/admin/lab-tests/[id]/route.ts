import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { isRecordNotFound, readJson } from "@/lib/routeGuards";
import { labTestKey, labTestPrice, parseLabTestInput } from "@/lib/labTests";

const DUPLICATE = "A lab test with this name already exists.";

// PATCH: edit name / B2B price / commission / active. Booked tests keep the
// price they were booked at (LabBookingItem is a snapshot).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseLabTestInput(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  if (parsed.data.name) {
    const others = await prisma.labTest.findMany({ where: { id: { not: id } }, select: { name: true } });
    if (others.some((t) => labTestKey(t.name) === labTestKey(parsed.data.name!))) return NextResponse.json({ error: DUPLICATE }, { status: 409 });
  }
  try {
    const updated = await prisma.labTest.update({ where: { id }, data: parsed.data, include: { _count: { select: { bookingItems: true } } } });
    const { _count, ...t } = updated;
    return NextResponse.json({ ...t, finalPrice: labTestPrice(t), bookings: _count.bookingItems });
  } catch (err: unknown) {
    if (isRecordNotFound(err)) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return NextResponse.json({ error: DUPLICATE }, { status: 409 });
    throw err;
  }
}

// DELETE: removes the test from the catalogue. Past bookings keep their own
// copy of the name and price; prescriptions keep the test name.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  try {
    await prisma.labTest.delete({ where: { id } });
  } catch (err) {
    if (isRecordNotFound(err)) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
