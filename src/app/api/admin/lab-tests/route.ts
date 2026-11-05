import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { readJson } from "@/lib/routeGuards";
import { ensureLabTests, labTestKey, labTestPrice, parseLabTestInput } from "@/lib/labTests";

const DUPLICATE = "A lab test with this name already exists.";

// GET: the whole catalogue (inactive included) with the computed patient price.
export async function GET() {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  await ensureLabTests();
  const tests = await prisma.labTest.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { bookingItems: true } } },
  });
  return NextResponse.json(tests.map(({ _count, ...t }) => ({ ...t, finalPrice: labTestPrice(t), bookings: _count.bookingItems })));
}

// POST: add a test. Commission defaults to 50%.
export async function POST(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;
  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const parsed = parseLabTestInput(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const data = parsed.data as { name: string; b2bPrice: number; commissionPercent: number };

  const existing = await prisma.labTest.findMany({ select: { name: true } });
  if (existing.some((t) => labTestKey(t.name) === labTestKey(data.name))) return NextResponse.json({ error: DUPLICATE }, { status: 409 });

  const last = await prisma.labTest.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  try {
    const created = await prisma.labTest.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    return NextResponse.json({ ...created, finalPrice: labTestPrice(created), bookings: 0 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return NextResponse.json({ error: DUPLICATE }, { status: 409 });
    throw err;
  }
}
