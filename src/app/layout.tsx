import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Noto_Sans_Kannada } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { baseLanguage } from "@/lib/appLanguage";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/Toast";
import { NativeBootstrap } from "@/components/NativeBootstrap";
import { SplashOverlay } from "@/components/SplashOverlay";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Hindi and Marathi (Devanagari) — Inter has no Devanagari glyphs.
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", weight: ["400", "500", "600", "700", "800"] });
// Kannada — likewise not in Inter.
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-knda", weight: ["400", "500", "600", "700", "800"] });

// viewportFit: "cover" lets content draw under the status bar/notch inside
// the native app shell, so env(safe-area-inset-*) below actually activates.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Locale-aware: the default title/description follow the saved language
// (messages/<locale>/public.json -> siteMeta). Page-level titles still use the
// "%s | SITE_NAME" template.
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("public.siteMeta"), getLocale()]);
  const title = `${SITE_NAME} | ${t("title")}`;
  const description = t("description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    keywords: [
      "online doctor consultation", "book doctor appointment", "video consultation doctor",
      "doctor near me", "home visit doctor", "DocOnClick",
    ],
    openGraph: {
      type: "website",
      url: SITE_URL,
      siteName: SITE_NAME,
      title,
      description,
      locale: locale.split("-u-")[0].replace("-", "_"), // "mr-IN-u-nu-latn" -> "mr_IN"
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "MedicalBusiness",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo-icon.png`,
  description: SITE_DESCRIPTION,
  areaServed: "IN",
};

// GA4 measurement ID. Not a secret, so it's hardcoded here rather than a
// NEXT_PUBLIC_ env var — those get baked in at Docker *build* time, not
// container runtime, so env_file: .env.production can't change it anyway
// (see CASHFREE_ENV note in .env.production.example).
const GA_MEASUREMENT_ID = "G-2PCQ0FEJ62";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The saved language (cookie, mirrors User.language — src/i18n/request.ts).
  // Reading it renders pages per request; they run proxy.ts's auth check on
  // every request anyway.
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    // suppressHydrationWarning: the Capacitor native shell injects
    // --safe-area-inset-* as an inline style on <html> before React
    // hydrates, which otherwise mismatches the SSR output and made
    // hydration fail silently app-wide inside the Android WebView.
    // lang: the user's language (src/lib/appLanguage.ts) — screen readers
    // pick a voice by it.
    <html lang={baseLanguage(locale)} className={`${inter.variable} ${devanagari.variable} ${kannada.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
      </head>
      <body className="antialiased">
        <SplashOverlay />
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
          <ToastProvider>
            <AuthProvider>
              <NativeBootstrap />
              <OfflineBanner />
              {children}
            </AuthProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
