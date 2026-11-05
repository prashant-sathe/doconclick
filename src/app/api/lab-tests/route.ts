import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/routeGuards";
import { ensureLabTests, labTestPrice } from "@/lib/labTests";
import { withErrorLocale } from "@/lib/apiErrors";

// GET: active lab tests for the doctor's prescription editor (and staff /
// admins). Patient price only — the B2B price and commission are admin-only.
export const GET = withErrorLocale(async function GET() {
  const { denied } = await requireRole("DOCTOR", "STAFF", "ADMIN");
  if (denied) return denied;
  await ensureLabTests();
  const tests = await prisma.labTest.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json(tests.map((t) => ({ id: t.id, name: t.name, price: labTestPrice(t) })));
});
