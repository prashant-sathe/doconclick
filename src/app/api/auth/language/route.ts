import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, COOKIE_SECURE } from "@/lib/auth";
import { APP_LANGUAGE_COOKIE, isAppLanguage } from "@/lib/appLanguage";

// PUT { language }: the language switch. Signed in, it's saved on the account
// (pushes use it) as well as the cookie the pages render in; signed out (the
// sign-in page's switch) only the cookie, which registration then adopts.
export async function PUT(req: Request) {
  const { language } = await req.json().catch(() => ({}));
  if (!isAppLanguage(language)) return NextResponse.json({ error: "Unsupported language." }, { status: 400 });
  const authUser = await getAuthUser();
  if (authUser) await prisma.user.update({ where: { id: authUser.id }, data: { language } });
  const res = NextResponse.json({ language });
  // Not httpOnly: the client reads it to keep <html lang> in step.
  res.cookies.set(APP_LANGUAGE_COOKIE, language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: COOKIE_SECURE });
  return res;
}
