"use client";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { useInboxUnread } from "@/hooks/useInboxUnread";
import { INBOX_HREF } from "@/lib/inbox";

// Header link to the role's notification inbox, with the unread count.
export default function InboxButton() {
  const { user } = useAuth();
  const t = useTranslations("nav.header");
  const count = useInboxUnread(user?.id);
  const href = user ? INBOX_HREF[user.role] : undefined;
  if (!href) return null;

  return (
    <Link
      href={href}
      title={t("inbox")}
      aria-label={count > 0 ? t("inboxUnread", { count }) : t("inbox")}
      className="tap-44 relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
    >
      <Inbox className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
