import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUser, verifyToken, IMPERSONATOR_COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  const impersonator = impersonatorToken ? verifyToken(impersonatorToken) : null;

  return NextResponse.json({
    ...user,
    impersonatedBy: impersonator ? { name: impersonator.name, role: impersonator.role } : null,
  });
}
