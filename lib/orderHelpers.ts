/**
 * Shared helpers for order-related screens.
 * Consolidates formatDate, normalizeNumber, pickItemTitle, etc.
 * Previously duplicated across orders, order-complete, tracking, and other pages.
 */

import { R2_BASE } from "./config";

// ─── Formatting ───────────────────────────────────────────────

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Relative date label for chat / ticket threads.
 * "Today", "Yesterday", or a short locale date.
 */
export function formatDateLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateLong(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function normalizeNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const inner = obj.amount ?? obj.value ?? undefined;
    if (inner !== undefined) return normalizeNumber(inner);
  }
  return null;
}

// ─── Item data extraction ─────────────────────────────────────

export function pickItemTitle(item: {
  title?: string | null;
  name?: string | null;
  publicId?: string | null;
  productVariant?: {
    title?: string | null;
    product?: { title?: string | null; name?: string | null } | null;
  } | null;
  product?: { title?: string | null; name?: string | null } | null;
}): string {
  const direct = item.title || item.name;
  const prod =
    item.product?.title ||
    item.product?.name ||
    item.productVariant?.product?.title ||
    item.productVariant?.product?.name;

  const t = (direct || prod || "").trim();
  if (t) return t;
  return `Item #${item.publicId ?? "?"}`;
}

export function pickItemImage(item: {
  image?: string | null;
  imageUrl?: string | null;
  productVariant?: {
    imageUrl?: string | null;
    product?: { imageUrl?: string | null; image?: string | null } | null;
  } | null;
  product?: { imageUrl?: string | null; image?: string | null } | null;
}): string | null {
  const candidates = [
    item.image,
    item.imageUrl,
    item.productVariant?.product?.imageUrl,
    item.productVariant?.product?.image,
    item.productVariant?.imageUrl,
    item.product?.imageUrl,
    item.product?.image,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  if (!candidates.length) return null;

  const url = candidates[0];
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (R2_BASE) return `${R2_BASE.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function pickUnitPrice(item: {
  unitPriceCents?: number | null;
  unitPrice?: string | number | null;
  price?: string | number | null;
}): number | null {
  if (item.unitPriceCents != null) return item.unitPriceCents;
  return normalizeNumber(item.unitPrice) ?? normalizeNumber(item.price) ?? null;
}
