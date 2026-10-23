import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOwnUploadUrl } from "@/lib/s3";
import { withErrorLocale } from "@/lib/apiErrors";

// Public (no auth): the native app shell fetches this before the user is
// logged in, to render the dynamic splash overlay (see SplashOverlay.tsx).
// proxy.ts already skips /api/* so there's no redirect to worry about.
export const GET = withErrorLocale(async function GET() {
  const settings = await prisma.platformSettings.findFirst();
  return NextResponse.json({
    splash: {
      // Only our own upload — an older value pointing elsewhere is ignored.
      imageUrl: settings?.splashImageUrl && isOwnUploadUrl(settings.splashImageUrl, "app-splash") ? settings.splashImageUrl : null,
      fit: settings?.splashFit === "contain" ? "contain" : "cover",
      bgColor: settings?.splashBgColor ?? "#F8FAFC",
    },
  });
});
