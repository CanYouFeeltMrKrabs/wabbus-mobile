/**
 * Mobile API client — equivalent of the web's customerFetch.
 *
 * Uses React Native's built-in cookie handling (the native HTTP layer
 * stores httpOnly cookies automatically). credentials: 'include' sends
 * them on every request.
 *
 * On 401: attempts one silent refresh, retries, then dispatches logout.
 */

import { API_BASE } from "./config";
import { getLocale } from "./locale";

export class AuthError extends Error {
  status: number;
  body: unknown;
  constructor(message = "Authentication required", status = 401, body?: unknown) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(message = "Network error — please check your connection.") {
    super(message);
    this.name = "NetworkError";
  }
}

export class FetchError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.body = body;
  }
}

type LogoutListener = () => void;
const logoutListeners = new Set<LogoutListener>();

export function onAuthLogout(listener: LogoutListener): () => void {
  logoutListeners.add(listener);
  return () => logoutListeners.delete(listener);
}

function dispatchLogout() {
  logoutListeners.forEach((fn) => fn());
}

let refreshPromise: Promise<boolean> | null = null;
let logoutDispatched = false;
let lastRefreshAt = 0;
const REFRESH_GRACE_MS = 3_000;

async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/customer-auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        lastRefreshAt = Date.now();
        return true;
      }
      if (res.status === 401 || res.status === 403) return false;
      throw new Error(`Refresh returned ${res.status}`);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function customerFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!headers["Accept-Language"]) {
    headers["Accept-Language"] = getLocale();
  }

  if (options.body !== undefined && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const doFetch = () =>
    fetch(url, { ...options, headers, credentials: "include" });

  let res: Response;

  try {
    res = await doFetch();
  } catch {
    throw new NetworkError();
  }

  if (res.status === 401) {
    if (Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
      try {
        res = await doFetch();
      } catch {
        throw new NetworkError();
      }
    }

    if (res.status === 401) {
      let refreshed: boolean;
      try {
        refreshed = await attemptRefresh();
      } catch {
        throw new NetworkError();
      }

      if (refreshed) {
        try {
          res = await doFetch();
        } catch {
          throw new NetworkError();
        }
      }

      if (res.status === 401) {
        if (!logoutDispatched) {
          logoutDispatched = true;
          dispatchLogout();
          setTimeout(() => { logoutDispatched = false; }, 2000);
        }
        throw new AuthError("Session expired. Please log in again.");
      }
    }
  }

  if (!res.ok) {
    let body: unknown;
    let message = `Request failed: ${res.status}`;
    try {
      body = await res.json();
      if (body && typeof body === "object" && "message" in body) {
        message = String((body as { message: string }).message).slice(0, 300);
      }
    } catch {
      /* keep default message */
    }
    if (res.status === 429) {
      throw new FetchError(429, message, body);
    }

    throw new FetchError(res.status, message, body);
  }

  if (res.status === 204) return undefined as unknown as T;

  return (await res.json()) as T;
}

/** Unauthenticated fetch for public endpoints */
export async function publicFetch<T = unknown>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) throw new FetchError(res.status, `Public fetch failed: ${res.status}`);
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new NetworkError();
  }
}
