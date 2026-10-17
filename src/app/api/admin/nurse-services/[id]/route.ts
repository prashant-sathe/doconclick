import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { parseNurseServiceInput } from "@/lib/nurseServiceInput";

// PATCH: edit a service (name, price, duration, prescription rule, active).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = parseNurseServiceInput(await req.json().catch(() => ({})), false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const updated = await prisma.nurseService.update({ where: { id }, data: parsed.data });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      if (err.code === "P2002") return NextResponse.json({ error: "A service with this name already exists." }, { status: 409 });
      if (err.code === "P2025") return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    throw err;
  }
}

// DELETE: only for a service nobody has ever booked — otherwise deactivate
// it instead, so past visits keep pointing at a real row.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const used = await prisma.appointment.count({ where: { nurseServiceId: id } });
  if (used > 0) {
    return NextResponse.json(
      { error: "This service has bookings — turn it off (inactive) instead of deleting it." },
      { status: 409 }
    );
  }
  await prisma.nurseService.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
