/**
 * Mobile analytics tracker — sends events to POST /events.
 * Port of the web tracker using AsyncStorage for session persistence.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";

const SESSION_KEY = "wabbus_session_id";
const DEDUP_WINDOW_MS = 30_000;
const DEDUP_EVENT_TYPES = new Set(["product_view", "category_view", "wishlist_add"]);
const recentEvents = new Map<string, number>();

let cachedSessionId: string | null = null;

function generateSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export async function getSessionId(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;

  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (stored) {
      cachedSessionId = stored;
      return stored;
    }
  } catch {
    /* storage may be unavailable */
  }

  const sid = generateSessionId();
  cachedSessionId = sid;
  AsyncStorage.setItem(SESSION_KEY, sid).catch(() => {});
  return sid;
}

export type EventType =
  | "product_view"
  | "category_view"
  | "search"
  | "search_click"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "wishlist_add"
  | "purchase";

export async function trackEvent(
  eventType: EventType,
  data?: {
    productId?: string;
    categoryId?: number;
    searchQuery?: string;
    resultPosition?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!API_BASE) return;

  if (DEDUP_EVENT_TYPES.has(eventType)) {
    const dedupKey = `${eventType}:${data?.productId ?? data?.categoryId ?? ""}`;
    const lastSent = recentEvents.get(dedupKey);
    const now = Date.now();
    if (lastSent && now - lastSent < DEDUP_WINDOW_MS) return;
    recentEvents.set(dedupKey, now);

    if (recentEvents.size > 100) {
      for (const [k, t] of recentEvents) {
        if (now - t > DEDUP_WINDOW_MS) recentEvents.delete(k);
      }
    }
  }

  const sessionId = await getSessionId();

  const payload = {
    sessionId,
    eventType,
    ...data,
  };

  fetch(`${API_BASE}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  }).catch(() => {});
}
