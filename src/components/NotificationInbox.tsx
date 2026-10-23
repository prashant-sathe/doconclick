"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import LoadError from "@/components/LoadError";
import { mutate } from "@/lib/apiClient";
import { formattingLocale } from "@/lib/appLanguage";
import { notifyInboxChanged } from "@/lib/inbox";
import { cn } from "@/lib/utils";

interface InboxItem {
  id: string;
  title: string;
  body: string;
  url: string;
  kind: string | null;
  readAt: string | null;
  createdAt: string;
}

interface InboxPage {
  items: InboxItem[];
  unreadCount: number;
  nextCursor: string | null;
}

const ACCENT = {
  blue: { text: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-500", icon: "bg-blue-500" },
  teal: { text: "text-teal-600", bg: "bg-teal-50", dot: "bg-teal-500", icon: "bg-teal-500" },
  rose: { text: "text-rose-600", bg: "bg-rose-50", dot: "bg-rose-500", icon: "bg-rose-500" },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function useWhen() {
  const locale = formattingLocale(useLocale());
  return (iso: string) => {
    const diff = new Date(iso).getTime() - Date.now();
    if (-diff < DAY_MS) {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const mins = Math.round(diff / 60000);
      return Math.abs(mins) < 60 ? rtf.format(mins, "minute") : rtf.format(Math.round(mins / 60), "hour");
    }
    return new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  };
}

// The signed-in user's notification inbox — every push they were sent, any
// role. Each role's /…/inbox page wraps this in its own shell.
export default function NotificationInbox({ accent = "blue" }: { accent?: keyof typeof ACCENT }) {
  const t = useTranslations("shared.inbox");
  const router = useRouter();
  const when = useWhen();
  const c = ACCENT[accent];
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null) => {
    const res = await fetch(`/api/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`).catch(() => null);
    if (!res?.ok) { setError(t("loadFailed")); return; }
    const page = (await res.json()) as InboxPage;
    setItems((prev) => (cursor ? [...prev, ...page.items] : page.items));
    setUnreadCount(page.unreadCount);
    setNextCursor(page.nextCursor);
    setError(null);
  }, [t]);

  useEffect(() => {
    // Fetching on mount: load() only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(null).finally(() => setLoading(false));
  }, [load]);

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)));
    const r = await mutate<{ unreadCount: number }>("/api/notifications/read", { body: ids ? { ids } : {} });
    if (r.ok) setUnreadCount(r.data.unreadCount);
    notifyInboxChanged();
  };

  const open = (n: InboxItem) => {
    if (!n.readAt) void markRead([n.id]);
    if (n.url.startsWith("/")) router.push(n.url);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">{unreadCount > 0 ? t("unread", { count: unreadCount }) : !loading && items.length > 0 ? t("allRead") : null}</p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markRead()}
            className={cn("tap-44-y inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 hover:opacity-80", c.text, c.bg)}
          >
            <CheckCheck className="w-3.5 h-3.5" /> {t("markAllRead")}
          </button>
        )}
      </div>

      {error && <div className="mb-3"><LoadError error={error} onRetry={() => void load(null)} hasData={items.length > 0} /></div>}

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : items.length === 0 && !error ? (
        <div className="text-center py-16 text-slate-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold text-slate-500">{t("empty")}</p>
          <p className="text-xs mt-1">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50 overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n)}
              className={cn("w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors", !n.readAt && "bg-slate-50/60")}
            >
              <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", n.readAt ? "bg-slate-100 text-slate-400" : cn(c.icon, "text-white"))}>
                <Bell className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2">
                  <span className={cn("text-sm flex-1 min-w-0", n.readAt ? "font-medium text-slate-700" : "font-bold text-slate-900")}>{n.title}</span>
                  {!n.readAt && <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-shrink-0", c.dot)} aria-label={t("new")} />}
                </span>
                <span className="block text-sm text-slate-500 mt-0.5 whitespace-pre-line break-words">{n.body}</span>
                <span className="block text-[11px] text-slate-400 mt-1">{when(n.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="text-center mt-4">
          <button
            type="button"
            disabled={loadingMore}
            onClick={async () => { setLoadingMore(true); await load(nextCursor); setLoadingMore(false); }}
            className={cn("tap-44-y inline-flex items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-60", c.text)}
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} {t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
