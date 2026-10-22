import type { Metadata } from "next";

// A pay link is personal — keep it out of search results.
export const metadata: Metadata = {
  title: "Pay for your appointment · DocOnClick",
  robots: { index: false, follow: false },
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
