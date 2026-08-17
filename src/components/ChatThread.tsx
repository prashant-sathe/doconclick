"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  text: string;
  createdAt: string;
  sender: { id: string; name: string; role: string };
}

interface ChatThreadProps {
  appointmentId: string;
  meId: string;
  accent?: "blue" | "teal";
}

const POLL_MS = 4000;

export default function ChatThread({ appointmentId, meId, accent = "blue" }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/appointments/${appointmentId}/messages`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not load chat.");
      setLoading(false);
      return;
    }
    const data: ChatMessage[] = await res.json();
    setMessages(data);
    setLoading(false);
    if (data.length !== messageCountRef.current) {
      messageCountRef.current = data.length;
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
    if (data.some((m) => m.sender.id !== meId)) {
      fetch(`/api/appointments/${appointmentId}/messages/read`, { method: "PATCH" });
    }
  }, [appointmentId, meId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    const res = await fetch(`/api/appointments/${appointmentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    setSending(false);
    if (res.ok) load();
    else setError((await res.json().catch(() => ({}))).error ?? "Could not send message.");
  };

  const accentBubble = accent === "teal" ? "bg-teal-600" : "bg-blue-600";
  const accentBtn = accent === "teal" ? "bg-teal-600 hover:bg-teal-700" : "bg-blue-600 hover:bg-blue-700";
  const accentRing = accent === "teal" ? "focus:ring-teal-200" : "focus:ring-blue-200";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400 text-center px-6">{error}</div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400 text-center px-6">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender.id === meId;
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  mine ? `${accentBubble} text-white rounded-br-sm` : "bg-white text-slate-700 border border-slate-100 rounded-bl-sm"
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={cn("text-[10px] mt-1", mine ? "text-white/70" : "text-slate-400")}>
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 bg-white p-3 flex items-end gap-2">
        <textarea
          rows={1}
          className={cn("input-field resize-none flex-1 py-2.5", accentRing)}
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed", accentBtn)}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
