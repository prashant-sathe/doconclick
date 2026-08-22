import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "DocOnClick | Healthcare Platform",
  description: "Connecting patients with trusted doctors — instantly.",
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
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
