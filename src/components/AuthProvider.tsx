"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2, ShieldAlert } from "lucide-react";
import { unlockAudio } from "@/lib/playNotificationSound";
import { listenForForegroundPush } from "@/lib/pushClient";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

// How often an already-open tab re-checks whether it's been suspended —
// doesn't need to be as tight as chat/notification polling, just tight
// enough that a suspended doctor can't keep working indefinitely in a tab
// that was already open when the admin suspended them.
const SUSPENSION_RECHECK_MS = 30000;

type AuthUser = {
  id: string;
  name: string;
  role: string;
  mobile: string;
};

type ImpersonatedBy = {
  name: string;
  role: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  impersonatedBy: ImpersonatedBy | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  exitImpersonation: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  impersonatedBy: null,
  logout: async () => {},
  refresh: async () => {},
  exitImpersonation: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [impersonatedBy, setImpersonatedBy] = useState<ImpersonatedBy | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [suspendedMessage, setSuspendedMessage] = useState("");
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => null);
      if (res.status === 403 && data?.suspended) {
        setUser(data);
        setImpersonatedBy(null);
        setSuspended(true);
        setSuspendedMessage(data.suspendedMessage ?? "Your account has been suspended.");
      } else if (res.ok) {
        setUser(data);
        setImpersonatedBy(data.impersonatedBy ?? null);
        setSuspended(false);
      } else {
        setUser(null);
        setImpersonatedBy(null);
        setSuspended(false);
      }
    } catch {
      setUser(null);
      setImpersonatedBy(null);
      setSuspended(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const exitImpersonation = useCallback(async () => {
    await fetch("/api/admin/impersonate/exit", { method: "POST" });
    window.location.href = "/admin";
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, SUSPENSION_RECHECK_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    listenForForegroundPush();
  }, []);

  // Browsers only allow audio playback after a genuine user gesture. Unlocking
  // here — on the very first click/keypress/touch anywhere in the app,
  // starting from the login page — means audio is ready well before a doctor
  // ever reaches a page that might need to play a notification sound.
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  const logout = async () => {
    setConfirmingLogout(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSuspended(false);
    setLoggingOut(false);
    setConfirmingLogout(false);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, impersonatedBy, logout, refresh, exitImpersonation }}>
      {impersonatedBy && <ImpersonationBanner adminName={impersonatedBy.name} onExit={exitImpersonation} />}
      {suspended ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Account Suspended</h3>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{suspendedMessage}</p>
            <button
              type="button"
              onClick={confirmLogout}
              disabled={loggingOut}
              className="btn-secondary w-full justify-center mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        children
      )}
      {confirmingLogout && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-extrabold text-slate-900">Sign out?</h3>
            <p className="text-sm text-slate-500 mt-1.5">
              You&apos;ll need to log in again to access your account.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmingLogout(false)}
                disabled={loggingOut}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                disabled={loggingOut}
                className="btn-danger flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
