import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { NativeBootstrap } from "@/components/NativeBootstrap";
import { SplashOverlay } from "@/components/SplashOverlay";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// viewportFit: "cover" lets content draw under the status bar/notch inside
// the native app shell, so env(safe-area-inset-*) below actually activates.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} | Healthcare Platform`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: [
    "online doctor consultation", "book doctor appointment", "video consultation doctor",
    "doctor near me", "home visit doctor", "DocOnClick",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Healthcare Platform`,
    description: SITE_DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Healthcare Platform`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the Capacitor native shell injects
    // --safe-area-inset-* as an inline style on <html> before React
    // hydrates, which otherwise mismatches the SSR output and made
    // hydration fail silently app-wide inside the Android WebView.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
      </head>
      <body className="antialiased">
        <SplashOverlay />
        <AuthProvider>
          <NativeBootstrap />
          <OfflineBanner />
          {children}
        </AuthProvider>
      </body>
      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
