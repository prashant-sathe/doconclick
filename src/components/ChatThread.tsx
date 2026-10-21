"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Paperclip, FileText, Download, X, Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import { downloadOrShareUrl } from "@/lib/nativeDownload";
import { isNative } from "@/lib/platform";
import { compressImage } from "@/lib/compressImage";

interface ChatMessage {
  id: string;
  text: string;
  createdAt: string;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  sender: { id: string; name: string; role: string };
}

// Whether this chat accepts new messages, from GET /messages (src/lib/chatAccess.ts).
interface ChatStatus {
  canSend: boolean;
  reason: string | null;
  sendUntil: string | null;
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

// Android's file picker sometimes hands back a File with an empty `type`;
// fall back to the extension so the server's MIME allow-list still passes.
function resolveMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

function downloadUrl(fileUrl: string, fileName: string | null, disposition: "inline" | "attachment") {
  return `/api/files/download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName ?? "file")}&disposition=${disposition}`;
}

interface ChatThreadProps {
  appointmentId: string;
  meId: string;
  accent?: "blue" | "teal";
}

const POLL_MS = 4000;

export default function ChatThread({ appointmentId, meId, accent = "blue" }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chat, setChat] = useState<ChatStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // `loadError`: the chat couldn't be loaded at all (nothing to show yet).
  // `notice`: an inline problem under the thread — a failed send/upload/
  // download or a failed refresh — that never hides the messages.
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageCountRef = useRef(0);
  // Has a load ever succeeded? After that, a failed refresh is only a notice.
  const loadedRef = useRef(false);
  // Only the latest load may update state (a slow poll mustn't undo a send's refresh).
  const seqRef = useRef(0);
  // The newest message from the other person that's been marked read — the
  // read PATCH goes out only when a newer one arrives, not on every poll.
  const lastMarkedRef = useRef<string | null>(null);
  const latestIncomingRef = useRef<string | null>(null);

  const markReadIfNew = useCallback(() => {
    const newest = latestIncomingRef.current;
    // Not while the screen is hidden: they haven't seen it yet.
    if (!newest || newest === lastMarkedRef.current || document.visibilityState === "hidden") return;
    lastMarkedRef.current = newest;
    fetch(`/api/appointments/${appointmentId}/messages/read`, { method: "PATCH" })
      .then((r) => { if (!r.ok && lastMarkedRef.current === newest) lastMarkedRef.current = null; })
      .catch(() => { if (lastMarkedRef.current === newest) lastMarkedRef.current = null; }); // retried on the next poll
  }, [appointmentId]);

  const load = useCallback(async () => {
    const mine = ++seqRef.current;
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/messages`);
      if (seqRef.current !== mine) return;
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error ?? "Could not load chat.";
        if (loadedRef.current) setNotice("Couldn't refresh the chat — retrying…");
        else setLoadError(msg);
        return;
      }
      const body = await res.json();
      if (seqRef.current !== mine) return;
      const data: ChatMessage[] = body.messages ?? [];
      loadedRef.current = true;
      setMessages(data);
      setChat(body.chat ?? null);
      setLoadError("");
      setNotice((n) => (n === "Couldn't refresh the chat — retrying…" ? "" : n));
      if (data.length !== messageCountRef.current) {
        messageCountRef.current = data.length;
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
      }
      latestIncomingRef.current = [...data].reverse().find((m) => m.sender.id !== meId)?.id ?? null;
      markReadIfNew();
    } catch {
      if (seqRef.current !== mine) return;
      if (loadedRef.current) setNotice("Couldn't refresh the chat — retrying…");
      else setLoadError("Network error — check your connection.");
    } finally {
      if (seqRef.current === mine) setLoading(false);
    }
  }, [appointmentId, meId, markReadIfNew]);

  useEffect(() => {
    // Fetching on mount: load() only sets state after its first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Skipped while hidden; the visibility listener below catches up on return.
    const interval = setInterval(() => { if (document.visibilityState !== "hidden") load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // The text stays in the box until the server has it — a failed send
  // (offline, server error, chat just closed) never loses what was typed.
  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setNotice("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.ok) {
        // Only clear what was sent — they may have kept typing meanwhile.
        setText((cur) => (cur.trim() === trimmed ? "" : cur));
        load();
        return;
      }
      const failure = await res.json().catch(() => ({}));
      setNotice(failure.error ?? "Could not send message.");
      // The chat just closed (e.g. the follow-up window ran out) — refresh so
      // the read-only notice replaces the composer; keep the history visible.
      if (failure.code === "CHAT_CLOSED") load();
    } catch {
      setNotice("Message not sent — check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const attachFile = async (file: File) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setNotice("File must be under 5MB.");
      return;
    }
    setUploading(true);
    setNotice("");
    try {
      // A File straight from <input type="file"> is backed by a content:// URI
      // on Android; the WebView often can't stream those bytes into a fetch()
      // multipart body ("Failed to fetch"). Re-read into memory via FileReader
      // (the reliable path for content:// URIs) and send a fresh Blob, matching
      // what the image-crop uploads already do.
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
        reader.readAsArrayBuffer(file);
      });
      const blob = await compressImage(new File([bytes], file.name, { type: resolveMime(file) }));
      const form = new FormData();
      form.append("file", blob, blob.name);

      const uploadRes = await fetch(`/api/appointments/${appointmentId}/messages/upload`, {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        setNotice((await uploadRes.json().catch(() => ({}))).error ?? "Could not upload file.");
        return;
      }
      const { url, fileName, fileType } = await uploadRes.json();
      const sendRes = await fetch(`/api/appointments/${appointmentId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", fileUrl: url, fileName, fileType }),
      });
      if (sendRes.ok) load();
      else {
        const failure = await sendRes.json().catch(() => ({}));
        if (failure.code === "CHAT_CLOSED") load();
        setNotice(failure.error ?? "Could not send file.");
      }
    } catch {
      setNotice("Could not upload that file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Web: let the <a> download normally. Native: the WebView ignores <a download>,
  // so intercept and hand the file to the OS share sheet instead.
  const onAttachmentClick = (e: React.MouseEvent, m: ChatMessage) => {
    if (!isNative() || !m.fileUrl) return;
    e.preventDefault();
    if (downloadingId) return;
    setDownloadingId(m.id);
    downloadOrShareUrl(downloadUrl(m.fileUrl, m.fileName, "attachment"), m.fileName ?? "attachment")
      .catch(() => setNotice("Could not download that attachment."))
      .finally(() => setDownloadingId(null));
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
        ) : loadError && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-slate-400 text-center px-6">
            {loadError}
            <button onClick={() => { setLoading(true); load(); }} className="btn-secondary py-1.5 px-3 text-xs">Retry</button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400 text-center px-6">
            {chat && !chat.canSend ? "No messages in this chat." : "No messages yet. Say hello!"}
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
                  {m.fileUrl && (
                    m.fileType?.startsWith("image/") ? (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(downloadUrl(m.fileUrl!, m.fileName, "inline"))}
                        className="block mb-1.5 -mx-1 w-full"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary aspect ratio per upload, next/image needs a fixed intrinsic size */}
                        <img
                          src={downloadUrl(m.fileUrl, m.fileName, "inline")}
                          alt={m.fileName ?? "Attachment"}
                          className="max-w-full rounded-lg max-h-64 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ) : (
                      <a
                        href={downloadUrl(m.fileUrl, m.fileName, "attachment")}
                        onClick={(e) => onAttachmentClick(e, m)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2.5 py-2 mb-1.5 text-xs font-medium",
                          mine ? "bg-white/15 hover:bg-white/25" : "bg-slate-50 hover:bg-slate-100"
                        )}
                      >
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate flex-1">{m.fileName ?? "Attachment"}</span>
                        {downloadingId === m.id
                          ? <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                          : <Download className="w-3.5 h-3.5 flex-shrink-0" />}
                      </a>
                    )
                  )}
                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                  <p className={cn("text-[10px] mt-1", mine ? "text-white/70" : "text-slate-400")}>
                    {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {notice && (
        <div role="alert" className="px-3 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss" className="text-red-400 hover:text-red-600 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {chat && !chat.canSend ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex items-start gap-2 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
          <span>{chat.reason ?? "This chat is read-only."}</span>
        </div>
      ) : (
      <>
      {chat?.sendUntil && (
        <div className="border-t border-slate-100 bg-amber-50 px-4 py-2 flex items-center gap-1.5 text-[11px] text-amber-700">
          <Clock className="w-3 h-3 flex-shrink-0" />
          Follow-up chat open until {new Date(chat.sendUntil).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
        </div>
      )}
      <div className="border-t border-slate-100 bg-white p-3 flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              setPendingFile(file);
              setPendingPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
            }
          }}
        />
        <button
          type="button"
          title="Attach a medical report (PDF/JPG/PNG, under 5MB)"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </button>
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
      </>
      )}

      {pendingFile && (
        <ConfirmDialog
          icon={pendingPreviewUrl ? Paperclip : FileText}
          title="Send this file?"
          message={
            pendingPreviewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingPreviewUrl} alt={pendingFile.name} className="w-full max-h-48 object-contain rounded-lg mb-2 bg-slate-50" />
                It&apos;ll be sent to the other person right away — there&apos;s no way to unsend it once it&apos;s delivered.
              </>
            ) : (
              <>
                <span className="font-semibold text-slate-700">{pendingFile.name}</span> will be sent to the other person right away — there&apos;s no way to unsend it once it&apos;s delivered.
              </>
            )
          }
          confirmLabel="Send"
          busyLabel="Sending…"
          tone="primary"
          busy={uploading}
          onCancel={() => {
            if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
            setPendingFile(null);
            setPendingPreviewUrl(null);
          }}
          onConfirm={async () => {
            await attachFile(pendingFile);
            if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
            setPendingFile(null);
            setPendingPreviewUrl(null);
          }}
        />
      )}

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="Close"
          >
            <X className="w-7 h-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Attachment"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
