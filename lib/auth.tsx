import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import i18n from "@/i18n";
import { customerFetch, onAuthLogout, NetworkError, AuthError } from "./api";
import { runPostAuthActions } from "./postAuthActions";
import { sendTokenToBackend, deregisterToken } from "./notifications";
import { setUser as setSentryUser } from "./sentry";
import { API_BASE } from "./config";
import { Platform } from "react-native";
import type { Customer } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AppleSignInData = {
  identityToken: string;
  fullName?: { givenName?: string; familyName?: string };
};

type AuthState = {
  user: Customer | null;
  authStatus: AuthStatus;
  isLoggedIn: boolean;
  impersonatedBy: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  appleSignIn: (data: AppleSignInData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

type RegisterData = {
  email: string;
  password: string;
};

const AuthContext = createContext<AuthState>({
  user: null,
  authStatus: "loading",
  isLoggedIn: false,
  impersonatedBy: null,
  login: async () => {},
  register: async () => {},
  appleSignIn: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const GUEST_CART_KEY = "guest_cart";
const CHECKOUT_KEYS_TO_SCRUB = [
  "wabbus_checkout_idempotency",
  "wabbus_checkout_pending",
  "wabbus_checkout_plan",
  "wabbus_affiliate_code",
  "wabbus_affiliate_code_set_at",
];

/**
 * Scrub account-sensitive AsyncStorage data on logout.
 * Preserves low-sensitivity product preferences (recently viewed, wishlist).
 */
async function scrubUserData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_CART_KEY);
  } catch { /* best effort */ }
  try {
    await AsyncStorage.multiRemove(CHECKOUT_KEYS_TO_SCRUB);
  } catch { /* best effort */ }
}

const RETRY_DELAY_MS = 3_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [impersonatedBy, setImpersonatedBy] = useState<number | null>(null);
  const statusRef = useRef(authStatus);
  statusRef.current = authStatus;

  /**
   * Re-check auth via /customer-auth/me using customerFetch.
   *
   * customerFetch handles 401 → refresh → retry, so an expired access
   * token with a valid refresh token is silently renewed.
   *
   * Error handling mirrors web:
   * - NetworkError: keep current state (offline / flaky connection)
   * - AuthError: truly unauthenticated (refresh also failed 401)
   * - Other (e.g. 500): server hiccup — preserve current state unless
   *   still in initial "loading", in which case fall to unauthenticated
   *   so RequireAuth can redirect instead of infinite spinner.
   */
  const fetchMe = useCallback(async () => {
    try {
      const data = await customerFetch<Customer>("/customer-auth/me");
      setUser(data);
      setAuthStatus("authenticated");
      setImpersonatedBy(data?.impersonatedBy ?? null);
      setSentryUser(data?.email ?? null, data?.email);
    } catch (e) {
      if (e instanceof NetworkError) {
        return;
      }
      if (e instanceof AuthError) {
        setUser(null);
        setAuthStatus("unauthenticated");
        setImpersonatedBy(null);
        return;
      }
      if (statusRef.current === "loading") {
        setUser(null);
        setAuthStatus("unauthenticated");
        setImpersonatedBy(null);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      await fetchMe();

      if (cancelled) return;
      if (statusRef.current !== "loading") return;

      retryTimer = setTimeout(async () => {
        if (cancelled) return;
        await fetchMe();

        if (cancelled) return;
        if (statusRef.current === "loading") {
          setUser(null);
          setAuthStatus("unauthenticated");
        }
      }, RETRY_DELAY_MS);
    })();

    const unsub = onAuthLogout(() => {
      scrubUserData().catch(() => {});
      setUser(null);
      setAuthStatus("unauthenticated");
      setImpersonatedBy(null);
    });

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") {
        fetchMe();
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsub();
      appStateSub.remove();
    };
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

      if (data?.code === "EMAIL_NOT_VERIFIED") {
        throw new Error(i18n.t("auth.login.errorNotVerified"));
      }
      if (res.status === 429) {
        const serverMsg = typeof data?.message === "string" && data.message.trim() ? data.message : null;
        throw new Error(serverMsg || i18n.t("auth.login.errorRateLimit"));
      }
      if (res.status === 423) {
        throw new Error(i18n.t("auth.login.errorLocked"));
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(i18n.t("auth.login.errorBadCredentials"));
      }
      if (res.status >= 500) {
        throw new Error(i18n.t("auth.login.errorServerDown"));
      }

      const msg = typeof data?.message === "string" && data.message.trim() ? data.message : i18n.t("auth.login.errorGeneric");
      throw new Error(msg);
    }

    await fetchMe();
    runPostAuthActions().catch(() => {});
    sendTokenToBackend().catch(() => {});
  }, [fetchMe]);

  const register = useCallback(async (data: RegisterData) => {
    const res = await fetch(`${API_BASE}/customer-auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const serverMsg = typeof body?.message === "string" && body.message.trim() ? body.message : null;
      let msg = i18n.t("auth.register.errorRegistrationFailed");
      if (res.status === 409) {
        msg = i18n.t("auth.register.errorConflict");
      } else if (res.status === 422) {
        msg = serverMsg || i18n.t("auth.register.errorValidation");
      } else if (serverMsg) {
        msg = serverMsg;
      }
      throw new Error(msg);
    }

    await fetchMe();
    runPostAuthActions().catch(() => {});
    sendTokenToBackend().catch(() => {});
  }, [fetchMe]);

  const appleSignIn = useCallback(async (data: AppleSignInData) => {
    const res = await fetch(`${API_BASE}/customer-auth/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        identityToken: data.identityToken,
        fullName: data.fullName,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const serverMsg = typeof body?.message === "string" && body.message.trim() ? body.message : null;
      throw new Error(serverMsg || i18n.t("auth.apple.errorGeneric"));
    }

    await fetchMe();
    runPostAuthActions().catch(() => {});
    sendTokenToBackend().catch(() => {});
  }, [fetchMe]);

  const logout = useCallback(async () => {
    deregisterToken().catch(() => {});
    scrubUserData().catch(() => {});
    try {
      await customerFetch("/customer-auth/logout", { method: "POST" });
    } catch {
      /* best effort */
    }
    setUser(null);
    setAuthStatus("unauthenticated");
    setImpersonatedBy(null);
    setSentryUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      authStatus,
      isLoggedIn: authStatus === "authenticated" && !!user,
      impersonatedBy,
      login,
      register,
      appleSignIn,
      logout,
      refresh: fetchMe,
    }),
    [user, authStatus, impersonatedBy, login, register, appleSignIn, logout, fetchMe],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
