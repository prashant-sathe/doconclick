import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/doctor/dashboard",
        "/doctor/profile",
        "/doctor/patients",
        "/doctor/chat",
        "/doctor/video",
        "/doctor/payment",
        "/doctor/earnings",
        "/doctor/clinics",
        "/doctor/subscribe",
        "/patient/dashboard",
        "/patient/appointments",
        "/patient/assistant",
        "/patient/book",
        "/patient/chat",
        "/patient/payment",
        "/patient/profile",
        "/patient/saved",
        "/patient/track",
        "/patient/video",
        "/checkout",
        "/complete-profile",
        "/forgot-password",
        "/reset-password",
        "/api",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
