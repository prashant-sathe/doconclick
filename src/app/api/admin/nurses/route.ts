import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// GET ?status= — every nurse with their profile and offered services.
// Optional ?take=N (1–200) & ?cursor=<userId> pages through them, newest
// first; with neither the full array comes back as before (admin page).
export async function GET(req: Request) {
  const { denied } = await requireAdmin();
  if (denied) return denied;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const takeRaw = Number(sp.get("take"));
  const cursor = sp.get("cursor");
  const paged = (Number.isInteger(takeRaw) && takeRaw > 0) || !!cursor;
  const take = Math.min(Number.isInteger(takeRaw) && takeRaw > 0 ? takeRaw : 50, 200);
  const nurses = await prisma.user.findMany({
    where: { role: "NURSE", deletedAt: null, ...(status ? { nurseProfile: { status } } : {}) },
    omit: { password: true },
    include: {
      nurseProfile: { include: { services: { include: { service: { select: { name: true } } } } } },
      _count: { select: { asDoctor: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(paged ? { take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) } : {}),
  });
  if (!paged) return NextResponse.json(nurses);
  // One extra row tells us whether another page exists.
  const hasMore = nurses.length > take;
  const page = hasMore ? nurses.slice(0, take) : nurses;
  return new NextResponse(JSON.stringify(page), {
    headers: { "Content-Type": "application/json", ...(hasMore ? { "X-Next-Cursor": page[page.length - 1].id } : {}) },
  });
}
