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

/* ── Auth & Security ──────────────────────────────────────────── */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 64;
