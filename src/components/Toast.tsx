"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// App-wide toasts for the outcome of an action (a failed save, a done
// settlement). Mounted once in the root layout; call useToast() anywhere.
// For a page's data failing to load, use <LoadError> instead — a toast
// disappears, a load error has to stay until it's retried.

type Tone = "error" | "success";
type ToastItem = { id: number; tone: Tone; message: string };

const DISMISS_MS = { error: 6000, success: 3500 } as const;

const ToastContext = createContext<{ error: (message: string) => void; success: (message: string) => void }>({
  error: () => {},
  success: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++;
    // Same message already showing (e.g. a double-tapped button) — don't stack it.
    setToasts((list) => (list.some((t) => t.message === message) ? list : [...list.slice(-2), { id, tone, message }]));
    setTimeout(() => dismiss(id), DISMISS_MS[tone]);
  }, [dismiss]);

  const error = useCallback((message: string) => show("error", message), [show]);
  const success = useCallback((message: string) => show("success", message), [show]);

  return (
    <ToastContext.Provider value={{ error, success }}>
      {children}
      <div className="fixed z-[120] bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm space-y-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-fade-in-up",
              t.tone === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
            )}
          >
            {t.tone === "error" ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} className="opacity-80 hover:opacity-100" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
