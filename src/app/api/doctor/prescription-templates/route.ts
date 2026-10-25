import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole, readJson } from "@/lib/routeGuards";
import { MAX_PRESCRIPTION_TEMPLATES, nameKeyOf, normalizeTemplate } from "@/lib/prescriptionKit";
import { withErrorLocale } from "@/lib/apiErrors";

// The signed-in doctor's own prescription templates (src/lib/prescriptionKit.ts).
// Doctors only — front-desk staff never write prescriptions.

const SELECT = { id: true, name: true, medicines: true, tests: true, updatedAt: true } as const;

// GET: the doctor's templates, A–Z.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const templates = await prisma.prescriptionTemplate.findMany({ where: { doctorId: authUser.id }, orderBy: { nameKey: "asc" }, select: SELECT });
  return NextResponse.json({ templates });
});

// POST: save the editor's medicines + tests under a name; saving again with
// the same name replaces that template.
export const POST = withErrorLocale(async function POST(req: Request) {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const cleaned = normalizeTemplate(body);
  if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const { name, medicines, tests } = cleaned;
  const nameKey = nameKeyOf(name);

  // Limit check + save under a per-doctor advisory lock, so two saves at once
  // can't both pass the count and go over the limit.
  const saved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rx-templates:${authUser.id}`}))`;
    const exists = await tx.prescriptionTemplate.findUnique({ where: { doctorId_nameKey: { doctorId: authUser.id, nameKey } }, select: { id: true } });
    if (!exists && (await tx.prescriptionTemplate.count({ where: { doctorId: authUser.id } })) >= MAX_PRESCRIPTION_TEMPLATES) return null;
    const template = await tx.prescriptionTemplate.upsert({
      where: { doctorId_nameKey: { doctorId: authUser.id, nameKey } },
      create: { doctorId: authUser.id, name, nameKey, medicines, tests },
      update: { name, medicines, tests },
      select: SELECT,
    });
    return { exists, template };
  });
  if (!saved) {
    return NextResponse.json({ error: `You can keep at most ${MAX_PRESCRIPTION_TEMPLATES} templates. Delete one first.`, code: "TEMPLATES_FULL" }, { status: 409 });
  }
  const { exists, template } = saved;
  return NextResponse.json({ template }, { status: exists ? 200 : 201 });
});
