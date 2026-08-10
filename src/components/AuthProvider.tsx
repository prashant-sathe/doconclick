"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";

type AuthUser = {
  id: string;
  name: string;
  role: string;
  mobile: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    setConfirmingLogout(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setLoggingOut(false);
    setConfirmingLogout(false);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh }}>
      {children}
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
