import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/patient/register`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/doctor/register`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const now = new Date();
  const doctors = await prisma.user.findMany({
    where: {
      role: "DOCTOR",
      deletedAt: null,
      doctorProfile: {
        status: "APPROVED",
        isVerified: true,
        OR: [
          { trialEndsAt: { gt: now } },
          { subscriptionPaidUntil: { gt: now } },
        ],
      },
    },
    select: { id: true, updatedAt: true },
  });

  const doctorRoutes: MetadataRoute.Sitemap = doctors.map((d) => ({
    url: `${SITE_URL}/patient/doctor/${d.id}`,
    lastModified: d.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...doctorRoutes];
}
