import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveDoctor } from "@/lib/doctorGuard";
import { requireRole, readJson } from "@/lib/routeGuards";
import { MAX_FAVOURITE_MEDICINES, nameKeyOf, normalizeFavourite } from "@/lib/prescriptionKit";
import { withErrorLocale } from "@/lib/apiErrors";

// The signed-in doctor's own favourite medicines (src/lib/prescriptionKit.ts).
// Doctors only — front-desk staff never write prescriptions.

const SELECT = { id: true, name: true, dosage: true, frequency: true, duration: true, instructions: true } as const;

// GET: the doctor's favourites, A–Z.
export const GET = withErrorLocale(async function GET() {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const favourites = await prisma.doctorFavouriteMedicine.findMany({ where: { doctorId: authUser.id }, orderBy: { nameKey: "asc" }, select: SELECT });
  return NextResponse.json({ favourites });
});

// POST: save a medicine as a favourite; saving the same name again updates
// its usual dosage/frequency/duration/instructions.
export const POST = withErrorLocale(async function POST(req: Request) {
  const { authUser, denied } = await requireRole("DOCTOR");
  if (denied) return denied;
  const suspendedResponse = await requireActiveDoctor(authUser);
  if (suspendedResponse) return suspendedResponse;

  const { body, invalid } = await readJson(req);
  if (invalid) return invalid;
  const cleaned = normalizeFavourite(body);
  if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const { item } = cleaned;
  const nameKey = nameKeyOf(item.name);

  // Limit check + save under a per-doctor advisory lock, so two saves at once
  // can't both pass the count and go over the limit.
  const saved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rx-favourites:${authUser.id}`}))`;
    const exists = await tx.doctorFavouriteMedicine.findUnique({ where: { doctorId_nameKey: { doctorId: authUser.id, nameKey } }, select: { id: true } });
    if (!exists && (await tx.doctorFavouriteMedicine.count({ where: { doctorId: authUser.id } })) >= MAX_FAVOURITE_MEDICINES) return null;
    const favourite = await tx.doctorFavouriteMedicine.upsert({
      where: { doctorId_nameKey: { doctorId: authUser.id, nameKey } },
      create: { doctorId: authUser.id, nameKey, ...item },
      update: item,
      select: SELECT,
    });
    return { exists, favourite };
  });
  if (!saved) {
    return NextResponse.json({ error: `You can keep at most ${MAX_FAVOURITE_MEDICINES} favourite medicines. Remove one first.`, code: "FAVOURITES_FULL" }, { status: 409 });
  }
  const { exists, favourite } = saved;
  return NextResponse.json({ favourite }, { status: exists ? 200 : 201 });
});
