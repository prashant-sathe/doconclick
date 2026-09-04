"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Sparkles, Info, Plus, ArrowUp,
  MapPin, Thermometer, Baby, Activity, ClipboardCheck, BadgeCheck,
  Building2, Video, Home, Ticket, Clock,
} from "lucide-react";
import RatingStars from "@/components/patient/RatingStars";
import { isDoctorAvailableNow } from "@/lib/availability";
import { useAuth } from "@/components/AuthProvider";
import { formatDoctorName } from "@/lib/utils";
import { renderChatText } from "@/lib/chatMarkdown";

// Loosely typed mirror of the OpenAI Responses API's input/output items —
// the client only needs enough shape to render and to echo the array back
// as conversation history on the next request, not the full SDK surface.
interface ConversationItem {
  type?: string;
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
  [key: string]: unknown;
}

interface AssistantDoctor {
  id: string;
  name: string;
  photoUrl: string | null;
  specialty: string;
  avgRating: number;
  totalReviews: number;
  distanceKm: number | null;
  fee: number;
  availability: string;
  offersHomeVisit: boolean;
  offersClinic: boolean;
  offersVideo: boolean;
}

interface SupportTicket {
  id: string;
  subject: string;
  description?: string;
  status: string;
  createdAt: string;
}

type DisplayEntry =
  | { kind: "user"; text: string; key: string }
  | { kind: "assistant"; text: string; key: string }
  | { kind: "chips"; options: string[]; active: boolean; key: string }
  | { kind: "doctors"; doctors: AssistantDoctor[]; key: string }
  | { kind: "ticket-created"; ticket: SupportTicket; key: string }
  | { kind: "ticket-list"; tickets: SupportTicket[]; key: string };

function extractText(content: ConversationItem["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text ?? "").join("");
  return "";
}

function buildDisplayEntries(items: ConversationItem[]): DisplayEntry[] {
  const entries: DisplayEntry[] = [];
  let lastChipsIndex = -1;

  items.forEach((item, idx) => {
    if (item.type === "message" || (!item.type && item.role)) {
      const text = extractText(item.content).trim();
      if (!text) return;
      if (item.role === "user") entries.push({ kind: "user", text, key: `u-${idx}` });
      else if (item.role === "assistant") entries.push({ kind: "assistant", text, key: `a-${idx}` });
    } else if (item.type === "function_call" && item.name === "suggest_quick_replies") {
      try {
        const args = JSON.parse(item.arguments ?? "{}");
        if (Array.isArray(args.options) && args.options.length) {
          entries.push({ kind: "chips", options: args.options, active: true, key: `c-${idx}` });
          lastChipsIndex = entries.length - 1;
        }
      } catch {
        // malformed tool arguments — skip rendering chips for this turn
      }
    } else if (item.type === "function_call_output") {
      const call = items.find((c) => c.type === "function_call" && c.call_id === item.call_id);
      if (call?.name === "find_doctors") {
        try {
          const parsed = JSON.parse(item.output ?? "{}") as
            | AssistantDoctor[]
            | { doctors?: AssistantDoctor[] };
          // Tool output is { searchRadiusKm, doctors }; tolerate the legacy
          // bare-array shape too.
          const doctors = Array.isArray(parsed) ? parsed : parsed.doctors ?? [];
          if (doctors.length) entries.push({ kind: "doctors", doctors, key: `d-${idx}` });
        } catch {
          // malformed tool output — skip rendering doctor cards for this turn
        }
      } else if (call?.name === "create_support_ticket") {
        try {
          const ticket = JSON.parse(item.output ?? "{}") as SupportTicket;
          if (ticket?.id) entries.push({ kind: "ticket-created", ticket, key: `tc-${idx}` });
        } catch {
          // malformed tool output — skip rendering for this turn
        }
      } else if (call?.name === "list_my_support_tickets") {
        try {
          const tickets = JSON.parse(item.output ?? "[]") as SupportTicket[];
          if (tickets.length) entries.push({ kind: "ticket-list", tickets, key: `tl-${idx}` });
        } catch {
          // malformed tool output — skip rendering for this turn
        }
      }
    }
  });

  if (lastChipsIndex !== -1) {
    const hasLaterUserReply = entries.slice(lastChipsIndex + 1).some((e) => e.kind === "user");
    entries.forEach((e, i) => {
      if (e.kind === "chips") e.active = i === lastChipsIndex && !hasLaterUserReply;
    });
  }

  return entries;
}

const STARTER_PROMPTS: { icon: typeof Thermometer; tint: "blue" | "teal" | "amber" | "emerald"; text: string }[] = [
  { icon: Thermometer, tint: "blue", text: "I have a fever and cough" },
  { icon: Baby, tint: "teal", text: "My child has a skin rash" },
  { icon: Activity, tint: "amber", text: "I've had a headache for 3 days" },
  { icon: ClipboardCheck, tint: "emerald", text: "I need a routine health check-up" },
];

const TINT_CLASSES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  teal: "bg-teal-50 text-teal-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

function BotAvatar() {
  return (
    <div className="w-7 h-7 rounded-[9px] gradient-primary flex items-center justify-center flex-shrink-0 mt-0.5">
      <Sparkles className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <BotAvatar />
      <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
      </div>
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: AssistantDoctor }) {
  const available = isDoctorAvailableNow(doctor.availability);
  const initials = doctor.name
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="relative flex-shrink-0">
          {doctor.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doctor.photoUrl}
              alt={doctor.name}
              className="w-12 h-12 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white font-bold text-sm">
              {initials || "Dr"}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center">
            <BadgeCheck className="w-4 h-4 fill-emerald-100 text-emerald-600" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 truncate">{formatDoctorName(doctor.name)}</span>
            <span className="text-sm font-bold text-slate-900 flex-shrink-0">₹{doctor.fee}</span>
          </div>
          <span className="badge badge-info mt-1.5">{doctor.specialty}</span>
          <div className="mt-1.5">
            <RatingStars avgRating={doctor.avgRating} totalReviews={doctor.totalReviews} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {doctor.offersClinic && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                <Building2 className="w-3 h-3" /> Clinic
              </span>
            )}
            {doctor.offersVideo && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">
                <Video className="w-3 h-3" /> Video call
              </span>
            )}
            {doctor.offersHomeVisit && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                <Home className="w-3 h-3" /> Home visit
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
            {doctor.distanceKm != null && (
              <span className="flex items-center gap-1 text-slate-500">
                <MapPin className="w-3 h-3" /> {doctor.distanceKm} km away
              </span>
            )}
            <span className={`flex items-center gap-1 font-semibold ${available ? "text-emerald-600" : "text-amber-600"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-amber-500"}`} />
              {available ? "Available now" : doctor.availability}
            </span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Link href={`/patient/doctor/${doctor.id}`} className="btn-ghost flex-1 justify-center py-2 text-xs">
          View profile
        </Link>
        <Link href={`/patient/book?doctorId=${doctor.id}`} className="btn-primary flex-1 justify-center py-2 text-xs">
          Book appointment
        </Link>
      </div>
    </div>
  );
}

const STATUS_CLASSES: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700 border-amber-100",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-100",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_CLASSES[status] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function TicketCreatedCard({ ticket }: { ticket: SupportTicket }) {
  return (
    <div className="ml-9 bg-white border border-blue-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Ticket className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-sm font-bold text-slate-900">Ticket raised</span>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="text-sm text-slate-700 font-semibold mt-2">{ticket.subject}</p>
      <p className="text-[11px] text-slate-400 mt-1">
        Ref #{ticket.id.slice(-8)} · {new Date(ticket.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
      </p>
    </div>
  );
}

function TicketListCard({ tickets }: { tickets: SupportTicket[] }) {
  return (
    <div className="ml-9 flex flex-col gap-2">
      {tickets.map((t) => (
        <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800 truncate">{t.subject}</span>
            <StatusBadge status={t.status} />
          </div>
          <p className="flex items-center gap-1 text-[11px] text-slate-400 mt-1.5">
            <Clock className="w-3 h-3" /> {new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      ))}
    </div>
  );
}

function EntryRow({ entry, onChip }: { entry: DisplayEntry; onChip: (text: string) => void }) {
  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-primary-500 text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === "assistant") {
    return (
      <div className="flex items-start gap-2.5">
        <BotAvatar />
        <div className="max-w-[75%] bg-white border border-slate-200 text-slate-800 text-sm leading-relaxed rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm whitespace-pre-wrap">
          {renderChatText(entry.text)}
        </div>
      </div>
    );
  }
  if (entry.kind === "chips") {
    return (
      <div className={`flex flex-wrap gap-2 ml-9 ${entry.active ? "" : "opacity-40"}`}>
        {entry.options.map((opt) => (
          <button
            key={opt}
            disabled={!entry.active}
            onClick={() => onChip(opt)}
            className="rounded-full border border-blue-100 bg-blue-50 text-blue-600 text-xs font-semibold px-3.5 py-1.5 disabled:cursor-default enabled:hover:bg-blue-100 transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }
  if (entry.kind === "ticket-created") return <TicketCreatedCard ticket={entry.ticket} />;
  if (entry.kind === "ticket-list") return <TicketListCard tickets={entry.tickets} />;
  return (
    <div className="ml-9 flex flex-col gap-3">
      {entry.doctors.map((d) => (
        <DoctorCard key={d.id} doctor={d} />
      ))}
    </div>
  );
}

function WelcomeState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="w-16 h-16 rounded-[22px] gradient-primary flex items-center justify-center shadow-lg">
        <Sparkles className="w-7 h-7 text-white" />
      </div>
      <div>
        <h1 className="gradient-text text-2xl font-extrabold tracking-tight">Hi, I&apos;m your Health Assistant</h1>
        <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
          Tell me what&apos;s bothering you, and I&apos;ll help point you to the right doctor.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {STARTER_PROMPTS.map(({ icon: Icon, tint, text }) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 text-left shadow-sm hover:border-blue-200 hover:-translate-y-0.5 hover:shadow-md transition-all"
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${TINT_CLASSES[tint]}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-[13.5px] font-semibold text-slate-800 flex-1">{text}</span>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HealthAssistantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storageKey = user ? `doconclick:assistant-chat:${user.id}` : null;

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [items, loading]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // corrupted/unavailable storage — start with an empty conversation
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (items.length) sessionStorage.setItem(storageKey, JSON.stringify(items));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // storage unavailable (private browsing, quota) — conversation stays in-memory only
    }
  }, [items, storageKey]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      const nextItems: ConversationItem[] = [...items, { role: "user", content: trimmed }];
      setItems(nextItems);
      setInput("");
      setLoading(true);
      try {
        const res = await fetch("/api/patient/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextItems }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        setItems([...nextItems, ...(Array.isArray(data.items) ? data.items : [])]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [items, loading]
  );

  const entries = buildDisplayEntries(items);

  return (
    <div className="h-dvh flex flex-col bg-surface-50">
      <header
        className="flex-shrink-0 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-4 sm:px-7 py-3 flex items-center justify-between gap-3"
        style={{ paddingTop: "calc(0.75rem + var(--safe-area-inset-top, env(safe-area-inset-top)))" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/patient/dashboard")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 leading-tight truncate">Health Assistant</div>
            <div className="text-[11px] text-slate-400 font-medium">Powered by AI · Always available</div>
          </div>
        </div>
        <button
          onClick={() => setItems([])}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-500 text-xs font-semibold hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      <div className="flex-shrink-0 bg-blue-50 border-b border-blue-100 px-4 sm:px-7 py-2 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <span className="text-xs font-medium text-blue-700">
          This assistant helps you find the right doctor. It does not provide diagnosis or emergency care — for urgent symptoms, call 112 or go to the nearest hospital.
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <WelcomeState onPick={send} />
        ) : (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
            {entries.map((entry) => (
              <EntryRow key={entry.key} entry={entry} onChip={send} />
            ))}
            {loading && <TypingIndicator />}
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 self-start">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div
        className="flex-shrink-0 border-t border-slate-100 bg-white px-4 sm:px-10 pt-4"
        style={{ paddingBottom: "calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)))" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="max-w-2xl mx-auto flex items-center gap-2.5 bg-surface-50 border border-slate-200 rounded-2xl pl-4 pr-2 py-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe how you're feeling…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 gradient-primary text-white disabled:opacity-40 transition-opacity"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-400 mt-2">
          Health Assistant can make mistakes. Always consult a doctor for medical advice.
        </p>
      </div>
    </div>
  );
}
