/**
 * Mobile API client — equivalent of the web's customerFetch.
 *
 * Uses React Native's built-in cookie handling (the native HTTP layer
 * stores httpOnly cookies automatically). credentials: 'include' sends
 * them on every request.
 *
 * On 401: attempts one silent refresh, retries, then dispatches logout.
 *
 * Parity with web customerFetch:
 * - Auto-appends `limit=` on GET requests missing one
 * - Origin guard for absolute URLs
 * - Richer error parsing (text fallback, statusText)
 * - Surfaces `warning` field from response JSON via toast
 */

import * as Sentry from "@sentry/react-native";

import { API_BASE } from "./config";
import { PAGE_SIZE } from "./constants";
import { getLocale } from "./locale";
import { showToast } from "./toast";

/**
 * Record a Sentry breadcrumb describing a transport-level fetch
 * failure. Captures the underlying error name + message + URL so
 * subsequent Sentry sessions surface the actual native cause
 * (e.g. "The Internet connection appears to be offline.",
 * "An SSL error has occurred…", "could not connect to the server")
 * instead of the meaningless `status_code: 0` placeholder that
 * Sentry's HTTP integration records when fetch rejects.
 *
 * Pure observability — does not change any control flow. Safe to
 * call from any catch block before re-throwing.
 */
function recordTransportFailure(url: string, error: unknown, method?: string): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    Sentry.addBreadcrumb({
      category: "fetch.transport",
      level: "error",
      type: "http",
      message: `${err.name}: ${err.message}`,
      data: {
        url,
        method: method ?? "GET",
        name: err.name,
        message: err.message,
      },
    });
  } catch {
    // Sentry not initialised (dev mode, missing DSN) — swallow.
  }
}

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
  constructor(message = "Network error — please check your connection and try again.") {
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

  const refreshUrl = `${API_BASE}/customer-auth/refresh`;

  refreshPromise = (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(refreshUrl, {
          method: "POST",
          credentials: "include",
        });
      } catch (e) {
        recordTransportFailure(refreshUrl, e, "POST");
        throw e;
      }
      if (res.ok) {
        lastRefreshAt = Date.now();
        return true;
      }
      if (res.status === 401 || res.status === 403) return false;
      throw new Error(`Refresh endpoint returned ${res.status}`);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Internal: perform an authenticated request with the full auth handshake
 * (cookie credentials, 401 silent refresh, refresh-grace retry, logout
 * dispatch on terminal 401, error normalisation). Returns the raw Response
 * on success so callers can decode JSON, blob, arrayBuffer, text, etc.
 *
 * Throws AuthError on terminal 401, NetworkError on transport failure,
 * FetchError on any non-2xx with parsed body when available.
 */
async function runAuthorized(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const isGet = !options.method || options.method.toUpperCase() === "GET";

  let url: string;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    const apiOrigin = API_BASE ? new URL(API_BASE).origin : null;
    const pathOrigin = new URL(path).origin;
    if (!apiOrigin || pathOrigin !== apiOrigin) {
      throw new Error(`customerFetch: refusing to send credentials to external origin ${pathOrigin}`);
    }
    url = path;
  } else {
    url = `${API_BASE}${path}`;
  }

  if (isGet && !url.includes("limit=")) {
    url += (url.includes("?") ? "&" : "?") + `limit=${PAGE_SIZE.DEFAULT}`;
  }

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!headers["Accept-Language"]) {
    headers["Accept-Language"] = getLocale();
  }

  if (options.body !== undefined && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const method = options.method?.toUpperCase() ?? "GET";

  const doFetch = () =>
    fetch(url, { ...options, headers, credentials: "include" });

  let res: Response;

  try {
    res = await doFetch();
  } catch (e) {
    recordTransportFailure(url, e, method);
    throw new NetworkError();
  }

  if (res.status === 401) {
    if (Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
      try {
        res = await doFetch();
      } catch (e) {
        recordTransportFailure(url, e, method);
        throw new NetworkError();
      }
    }

    if (res.status === 401) {
      let refreshed: boolean;
      try {
        refreshed = await attemptRefresh();
      } catch (e) {
        recordTransportFailure(url, e, method);
        throw new NetworkError();
      }

      if (refreshed) {
        try {
          res = await doFetch();
        } catch (e) {
          recordTransportFailure(url, e, method);
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
    let message = `Request failed: ${res.status} ${res.statusText ?? ""}`.trim();
    try {
      body = await res.json();
      if (body && typeof body === "object" && "message" in body) {
        message = String((body as { message: string }).message).slice(0, 300);
      }
    } catch {
      try {
        const raw = await res.text();
        if (raw.length <= 200 && !raw.includes("<")) {
          message = raw;
        }
      } catch {
        // keep default
      }
    }
    throw new FetchError(res.status, message, body);
  }

  return res;
}

export async function customerFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await runAuthorized(path, options);

  if (res.status === 204) return undefined as unknown as T;

  const data = await res.json();

  if (data && typeof data === "object" && "warning" in data) {
    showToast(String((data as Record<string, unknown>).warning), "error");
  }

  return data as T;
}

/**
 * Authenticated binary fetch — same auth handshake as customerFetch but
 * returns a Blob rather than parsed JSON. Used for protected images and
 * other non-JSON resources (e.g. live-chat attachments) where the native
 * Image component can't reliably forward cookies on its own.
 */
export async function customerFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  const res = await runAuthorized(path, options);
  if (res.status === 204) {
    throw new FetchError(204, "Empty response.");
  }
  return await res.blob();
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
    recordTransportFailure(url, e, "GET");
    throw new NetworkError();
  }
}
