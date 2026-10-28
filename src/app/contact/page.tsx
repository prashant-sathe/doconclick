import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ContactPageClient from "./ContactPageClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("public.contact");
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: { canonical: "/contact" } };
}

export default function ContactPage() {
  return <ContactPageClient />;
}
