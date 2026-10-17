import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { ensureNurseServices } from "@/lib/nurseServices";
import { parseNurseServiceInput } from "@/lib/nurseServiceInput";

// GET: the full catalogue (inactive included) with how many nurses offer each.
export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  await ensureNurseServices();
  const services = await prisma.nurseService.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { offerings: true, appointments: true } } },
  });
  return NextResponse.json(services);
}

// POST: add a service.
export async function POST(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const parsed = parseNurseServiceInput(await req.json().catch(() => ({})), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const last = await prisma.nurseService.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  try {
    const created = await prisma.nurseService.create({
      data: { ...(parsed.data as { name: string }), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(created);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A service with this name already exists." }, { status: 409 });
    }
    throw err;
  }
}
