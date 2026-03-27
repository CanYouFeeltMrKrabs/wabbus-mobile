import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { customerFetch, onAuthLogout, NetworkError, AuthError } from "./api";
import { runPostAuthActions } from "./postAuthActions";
import { API_BASE } from "./config";
import type { Customer } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  user: Customer | null;
  authStatus: AuthStatus;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

type RegisterData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const AuthContext = createContext<AuthState>({
  user: null,
  authStatus: "loading",
  isLoggedIn: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const statusRef = useRef(authStatus);
  statusRef.current = authStatus;

  const fetchMe = useCallback(async () => {
    try {
      const data = await customerFetch<Customer>("/customer-auth/me");
      setUser(data);
      setAuthStatus("authenticated");
    } catch (e) {
      if (e instanceof NetworkError) {
        // Offline — don't change state, preserve current status
        return;
      }
      setUser(null);
      setAuthStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    fetchMe();
    const unsub = onAuthLogout(() => {
      setUser(null);
      setAuthStatus("unauthenticated");
    });
    return unsub;
  }, [fetchMe]);

  /**
   * Login uses raw fetch (NOT customerFetch) because customerFetch has
   * 401 retry logic that would try to refresh a non-existent token and
   * dispatch a spurious logout event on failed login attempts.
   */
  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/customer-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const msg = data?.message || (res.status === 401 ? "Invalid email or password." : "Login failed.");
      throw new Error(msg);
    }

    await fetchMe();
    runPostAuthActions().catch(() => {});
  }, [fetchMe]);

  const register = useCallback(async (data: RegisterData) => {
    const res = await fetch(`${API_BASE}/customer-auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.message || "Registration failed.";
      throw new Error(msg);
    }

    await fetchMe();
    runPostAuthActions().catch(() => {});
  }, [fetchMe]);

  const logout = useCallback(async () => {
    try {
      await customerFetch("/customer-auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    setUser(null);
    setAuthStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      authStatus,
      isLoggedIn: authStatus === "authenticated" && !!user,
      login,
      register,
      logout,
      refresh: fetchMe,
    }),
    [user, authStatus, login, register, logout, fetchMe],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
