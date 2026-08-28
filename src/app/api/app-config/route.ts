import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public (no auth): the native app shell fetches this before the user is
// logged in, to render the dynamic splash overlay (see SplashOverlay.tsx).
// proxy.ts already skips /api/* so there's no redirect to worry about.
export async function GET() {
  const settings = await prisma.platformSettings.findFirst();
  return NextResponse.json({
    splash: {
      imageUrl: settings?.splashImageUrl ?? null,
      fit: settings?.splashFit === "contain" ? "contain" : "cover",
      bgColor: settings?.splashBgColor ?? "#F8FAFC",
    },
  });
}
