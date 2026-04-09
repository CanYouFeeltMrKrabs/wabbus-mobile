/**
 * Customer behavior tracker — sends batched events to POST /events/ingest.
 *
 * Port of the web's customerTracker.ts for React Native.
 * Feeds the customer_events / customer_sessions analytics pipeline.
 *
 * Events are queued in memory and flushed:
 *  - every FLUSH_INTERVAL_MS
 *  - when the app goes to background (AppState change)
 */

import { Platform, Dimensions } from "react-native";
import { AppState, type AppStateStatus } from "react-native";
import { API_BASE } from "./config";
import { getSessionId } from "./tracker";
import { getLocale } from "./locale";

const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE_SIZE = 50;

interface QueuedEvent {
  eventType: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
let initialized = false;

let cachedContext: {
  deviceType: string;
  os: string | null;
  screenResolution: string | null;
  locale: string | null;
} | null = null;

function ensureContext() {
  if (cachedContext) return cachedContext;
  const { width, height } = Dimensions.get("window");
  cachedContext = {
    deviceType: Platform.OS === "ios" || Platform.OS === "android" ? "mobile_app" : "unknown",
    os: Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : Platform.OS,
    screenResolution: `${Math.round(width)}x${Math.round(height)}`,
    locale: getLocale(),
  };
  return cachedContext;
}

async function flush() {
  if (queue.length === 0 || !API_BASE) return;

  const events = queue.splice(0, MAX_QUEUE_SIZE);
  const ctx = ensureContext();
  const sessionId = await getSessionId();

  const body = JSON.stringify({
    sessionId,
    ...ctx,
    events,
  });

  fetch(`${API_BASE}/events/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "include",
  }).catch(() => {});
}

export function trackCustomerEvent(
  eventType: string,
  properties?: Record<string, unknown>,
) {
  queue.push({
    eventType,
    properties,
    timestamp: new Date().toISOString(),
  });

  if (queue.length >= MAX_QUEUE_SIZE) {
    flush();
  }
}

export function initCustomerTracker() {
  if (initialized) return;
  initialized = true;

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "background" || state === "inactive") {
      flush();
    }
  });
}

export function flushCustomerEvents() {
  flush();
}

export function teardownCustomerTracker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  flush();
  initialized = false;
}
