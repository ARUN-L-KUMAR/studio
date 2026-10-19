import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import Backdrop from "../components/layout/Backdrop";
import Login from "../pages/Login";

export interface AuthStatus {
  configured: boolean;
  required: boolean;
  authenticated: boolean;
  /** No password exists and the request is not a plain local one: the server is locked */
  locked: boolean;
}

export type LoginResult = { ok: true } | { ok: false; message: string; retryAfter?: number };

interface Ctx {
  status: AuthStatus | null;
  refresh: () => Promise<void>;
  login: (password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  setPassword: (current: string, next: string) => Promise<{ ok: boolean; message: string }>;
}

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  credentials: "same-origin",
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/status", { credentials: "same-origin" });
      setStatus(await res.json());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // any API call that comes back "please sign in" brings the login page back
    const onRequired = () => refresh();
    window.addEventListener("auth-required", onRequired);
    return () => window.removeEventListener("auth-required", onRequired);
  }, [refresh]);

  const login = useCallback(
    async (password: string): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth/login", json({ password }));
        if (res.ok) {
          await refresh();
          return { ok: true };
        }
        const body = await res.json().catch(() => ({}));
        return { ok: false, message: body.detail || "Could not sign in.", retryAfter: Number(res.headers.get("Retry-After")) || undefined };
      } catch {
        return { ok: false, message: "Could not reach the server." };
      }
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", json({})).catch(() => {});
    await refresh();
  }, [refresh]);

  const setPassword = useCallback(
    async (current: string, next: string) => {
      try {
        const res = await fetch("/api/auth/password", json({ current, new: next }));
        const body = await res.json().catch(() => ({}));
        if (res.ok) await refresh();
        return { ok: res.ok, message: res.ok ? body.message || "Password saved." : body.detail || "Could not save the password." };
      } catch {
        return { ok: false, message: "Could not reach the server." };
      }
    },
    [refresh],
  );

  const value = useMemo(() => ({ status, refresh, login, logout, setPassword }), [status, refresh, login, logout, setPassword]);

  if (!status) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Backdrop />
        <div className="text-center">
          <span className="grid place-items-center w-14 h-14 mx-auto rounded-2xl bg-brand shadow-glow text-neutral-950 animate-pulse">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </span>
          <p className="mt-4 text-[13px] text-muted">
            {offline ? "Can't reach the server. Is it running? Retrying..." : "Loading"}
          </p>
          {offline && (
            <button className="btn btn-ghost btn-sm mt-3" onClick={refresh}>Try again</button>
          )}
        </div>
      </div>
    );
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Shows the login page instead of the app until the visitor has signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status && status.required && !status.authenticated) return <Login />;
  return <>{children}</>;
}
