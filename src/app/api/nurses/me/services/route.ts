import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { requireActiveNurse } from "@/lib/providerGuard";
import { parseBody, nurseServicesSchema } from "@/lib/schemas";

// PUT: replace the services this nurse offers. Body: { services: [{ serviceId, price }] }
export async function PUT(req: Request) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "NURSE") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const denied = await requireActiveNurse(authUser);
  if (denied) return denied;

  const parsed = parseBody(nurseServicesSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;

  const wanted = new Map(parsed.data.services.map((s) => [s.serviceId, s.price]));

  const valid = await prisma.nurseService.findMany({
    where: { id: { in: [...wanted.keys()] }, isActive: true },
    select: { id: true },
  });
  if (valid.length !== wanted.size) {
    return NextResponse.json({ error: "One of the selected services is no longer available." }, { status: 400 });
  }

  const profile = await prisma.nurseProfile.findUnique({ where: { userId: authUser.id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Nurse not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.nurseServiceOffering.deleteMany({
      where: { nurseProfileId: profile.id, serviceId: { notIn: [...wanted.keys()] } },
    }),
    ...[...wanted].map(([serviceId, price]) =>
      prisma.nurseServiceOffering.upsert({
        where: { nurseProfileId_serviceId: { nurseProfileId: profile.id, serviceId } },
        create: { nurseProfileId: profile.id, serviceId, price },
        update: { price },
      })
    ),
  ]);

  const services = await prisma.nurseServiceOffering.findMany({
    where: { nurseProfileId: profile.id },
    include: { service: true },
  });
  return NextResponse.json(services);
}
