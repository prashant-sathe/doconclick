import { NextResponse } from "next/server";
import { withErrorLocale } from "@/lib/apiErrors";

export const GET = withErrorLocale(async function GET() {
  return NextResponse.json({ status: "ok" });
});
