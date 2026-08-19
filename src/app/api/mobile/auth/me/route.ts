import { NextResponse } from "next/server";
import { getAuthUserFromBearer } from "@/lib/auth";

// Bearer-token equivalent of /api/auth/me for the Flutter app.
export async function GET(req: Request) {
  const user = getAuthUserFromBearer(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(user);
}
