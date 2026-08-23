"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type AnnouncementButton = { label: string; url: string };

type Announcement = {
  id: string;
  title: string;
  message: string;
  bannerImageUrl: string | null;
  buttons: AnnouncementButton[] | null;
};

const POLL_MS = 5000;

export default function AnnouncementPopup({ onAllSeen }: { onAllSeen?: () => void }) {
  const router = useRouter();
  const [queue, setQueue] = useState<Announcement[] | null>(null);
  const onAllSeenFiredRef = useRef(false);

  // Polls (not just fetches once) so an announcement sent while this
  // dashboard is already open still surfaces as a popup, matching the
  // bell's live-delivery behavior instead of requiring a page reload.
  useEffect(() => {
    const poll = () => {
      fetch("/api/announcements/pending")
        .then((res) => (res.ok ? res.json() : []))
        .then((data: Announcement[]) => {
          setQueue((prev) => {
            if (prev === null) return data;
            const prevIds = new Set(prev.map((a) => a.id));
            const newOnes = data.filter((a) => !prevIds.has(a.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
          });
          if (data.length === 0 && !onAllSeenFiredRef.current) {
            onAllSeenFiredRef.current = true;
            onAllSeen?.();
          }
        })
        .catch(() => {
          setQueue((prev) => prev ?? []);
          if (!onAllSeenFiredRef.current) {
            onAllSeenFiredRef.current = true;
            onAllSeen?.();
          }
        });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!queue || queue.length === 0) return null;

  const current = queue[0];

  const advance = () => {
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length === 0) onAllSeen?.();
  };

  const dismiss = () => {
    fetch("/api/announcements/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [current.id] }),
    }).catch(() => {});
    advance();
  };

  const handleButtonClick = (url: string) => {
    dismiss();
    if (url.startsWith("/")) {
      router.push(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full relative overflow-hidden">
        <button onClick={dismiss} className="absolute top-5 right-5 text-white/80 hover:text-white z-10 bg-black/20 rounded-full p-1.5">
          <X className="w-5 h-5" />
        </button>
        {current.bannerImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.bannerImageUrl} alt={current.title} className="w-full h-64 object-cover" />
        )}
        <div className="p-8">
          <h3 className="text-2xl font-extrabold text-slate-900">{current.title}</h3>
          <p className="text-base text-slate-500 mt-2.5 whitespace-pre-wrap">{current.message}</p>
          {current.buttons && current.buttons.length > 0 && (
            <div className="flex gap-3 mt-6">
              {current.buttons.map((b, i) => (
                <button
                  key={i}
                  onClick={() => handleButtonClick(b.url)}
                  className={i === 0 ? "btn-primary flex-1 py-3 text-base" : "btn-secondary flex-1 py-3 text-base"}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
