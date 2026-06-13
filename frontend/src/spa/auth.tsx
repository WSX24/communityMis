import React from "react";
import type { ApiClient } from "./api";
import type { AuthSession, SessionUser } from "./types";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  refresh: (role?: "user" | "admin") => Promise<AuthSession | null>;
  loginUser: (payload: unknown) => Promise<AuthSession>;
  registerUser: (payload: unknown) => Promise<AuthSession>;
  loginAdmin: (payload: unknown) => Promise<AuthSession>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ api, children }: { api: ApiClient; children: React.ReactNode }) {
  const [session, setSession] = React.useState<AuthSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async (role: "user" | "admin" = "user") => {
    setLoading(true);
    try {
      const payload = role === "admin" ? await api.adminAuth.me() : await api.auth.me();
      const next = normalizeSession((payload as { user?: unknown }).user, role);
      setSession(next);
      return next;
    } catch (error) {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loginUser = React.useCallback(async (payload: unknown) => {
    const result = await api.auth.login(payload);
    const next = normalizeSession((result as { user?: unknown }).user, "user");
    setSession(next);
    return next;
  }, [api]);

  const registerUser = React.useCallback(async (payload: unknown) => {
    const result = await api.auth.register(payload);
    const next = normalizeSession((result as { user?: unknown }).user, "user");
    setSession(next);
    return next;
  }, [api]);

  const loginAdmin = React.useCallback(async (payload: unknown) => {
    const result = await api.adminAuth.login(payload);
    const next = normalizeSession((result as { user?: unknown }).user, "admin");
    setSession(next);
    return next;
  }, [api]);

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setSession(null);
    }
  }, [api]);

  React.useEffect(() => {
    refresh(window.location.pathname.startsWith("/admin") ? "admin" : "user");
  }, [refresh]);

  const value = React.useMemo(() => ({
    session,
    loading,
    refresh,
    loginUser,
    registerUser,
    loginAdmin,
    logout
  }), [loading, loginAdmin, loginUser, logout, refresh, registerUser, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}

function normalizeSession(user: unknown, role: string): AuthSession {
  if (!user || typeof user !== "object") {
    throw new Error("Session user is missing.");
  }
  return {
    user: user as SessionUser,
    role
  };
}
