/**
 * Mobile analytics tracker — sends events to POST /events (recommendation engine)
 * and bridges to POST /analytics/events/ingest (customer analytics pipeline).
 *
 * Port of the web's tracker.ts using AsyncStorage for session persistence.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";
import { trackCustomerEvent } from "./customerTracker";

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

type TrackData = {
  productId?: string;
  categoryId?: number;
  searchQuery?: string;
  resultPosition?: number;
  metadata?: Record<string, unknown>;
};

export async function trackEvent(
  eventType: EventType,
  data?: TrackData,
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
      if (recentEvents.size > 200) {
        const entries = [...recentEvents.entries()].sort((a, b) => a[1] - b[1]);
        const toRemove = entries.slice(0, entries.length - 100);
        for (const [k] of toRemove) recentEvents.delete(k);
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

  bridgeToCustomerTracker(eventType, data);
}

const EVENT_TYPE_MAP: Partial<Record<EventType, string>> = {
  product_view: "customer.product.viewed",
  search: "customer.search.executed",
  search_click: "customer.search.result.clicked",
  add_to_cart: "customer.cart.item.added",
  remove_from_cart: "customer.cart.item.removed",
  wishlist_add: "customer.wishlist.added",
};

function bridgeToCustomerTracker(eventType: EventType, data?: TrackData) {
  const mapped = EVENT_TYPE_MAP[eventType];
  if (!mapped) return;

  const props: Record<string, unknown> = {};
  if (data?.productId) props.productId = data.productId;
  if (data?.categoryId) props.categoryId = data.categoryId;
  if (data?.searchQuery) props.query = data.searchQuery;
  if (data?.resultPosition != null) props.position = data.resultPosition;
  if (data?.metadata) Object.assign(props, data.metadata);

  trackCustomerEvent(mapped, props);
}

/**
 * Track time spent on a product page. Call when the user leaves the PDP
 * or after a meaningful dwell threshold.
 */
export function trackProductDwell(
  productId: string,
  dwellMs: number,
  scrollDepthPct?: number | null,
) {
  trackCustomerEvent("customer.product.dwell", {
    productId,
    dwellMs,
    scrollDepthPct: scrollDepthPct ?? null,
  });
}
