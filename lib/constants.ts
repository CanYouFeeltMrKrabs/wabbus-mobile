/** Shared constants used across the mobile app. */

/* ── Character Limits ────────────────────────────────────────── */

export const MAX_MESSAGE_LENGTH = 1000;

/* ── Attachment / upload limits ────────────────────────────────── */

export const ALLOWED_ATTACH_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_ATTACH_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS = 5;
export const ATTACHMENT_HINT =
  "Supported: JPEG, PNG, WebP. Max 10 MB per image.";

/* ── Pagination ──────────────────────────────────────────────── */

export const PAGE_SIZE = {
  DEFAULT: 50,
  CHAT_HISTORY: 100,
  PRODUCTS: 24,
  PRODUCTS_HOME: 36,
  PRODUCTS_SEARCH: 20,
  REVIEWS: 10,
  ORDERS: 25,
  CAROUSEL: 10,
  CAROUSEL_CART: 24,
  RECENTLY_VIEWED: 6,
} as const;

/* ── Chat ─────────────────────────────────────────────────────── */

export const MAX_CHAT_MESSAGES = 500;

/* ── Live chat (customer ↔ support) ───────────────────────────── */

/**
 * Single source of truth for live-chat client behaviour.
 * Mirrors the web app (see Wabbus/src/lib/constants.ts) — keep both in sync.
 *
 * Backend caps are enforced server-side (see livechat-attachment.controller.ts);
 * client values intentionally match those so users see consistent rules across
 * web and mobile and we do not silently drop input that the server would accept.
 */
export const CHAT = {
  /** Max in-flight customer messages without an agent reply before we throttle UI. */
  MAX_OUTSTANDING_MSGS: 50,
  /** Hard cap on the body length of a single chat message (chars). */
  MAX_MSG_LENGTH: 750,
  /** Max number of de-duplication ids retained in memory per session. */
  MAX_SEEN_IDS: 500,
  /** Min interval between typing-ping emits while the user is typing (ms). */
  TYPING_THROTTLE_MS: 2000,
  /** How long to keep showing "agent is typing" after the last ping (ms). */
  TYPING_TTL_MS: 3000,
  /** Max messages held locally while the socket is offline. */
  MAX_QUEUED_MSGS: 100,
  /** Pacing between offline-queue flush emits to avoid burst rate limits (ms). */
  FLUSH_PACE_MS: 50,
  /** Client-side cooldown after starting a new chat (server enforces this too). */
  START_COOLDOWN_MS: 5000,
  /** Allowed image MIME types for chat attachments. */
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"] as const,
  /** Max bytes per attached image (10 MB; backend allows 20 MB but we stay conservative). */
  MAX_IMAGE_SIZE: 10 * 1024 * 1024,
  /** Max images attached to a single outbound message. */
  MAX_PENDING_IMAGES: 5,
} as const;

/* ── Auth & Security ──────────────────────────────────────────── */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 64;
