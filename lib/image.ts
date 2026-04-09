/**
 * Image utilities — R2 URL resolution with size suffixes and fallback handling.
 *
 * The backend stores images as R2 keys (e.g. "products/abc.jpeg"). The
 * normalization pipeline generates derivative sizes:
 *   - full: 1000×1000 (product detail, zoom)
 *   - card: 600×600  (_600 suffix — product cards, grids)
 *   - thumb: 300×300 (_300 suffix — thumbnails, mini previews)
 *
 * This module resolves keys into fully-qualified URLs with the correct
 * size suffix for the context, saving bandwidth on cellular connections.
 */

import { R2_BASE, FALLBACK_IMAGE } from "./config";

export type ImageSize = "full" | "card" | "thumb";

const SIZE_SUFFIX: Record<ImageSize, string> = {
  full: "",
  card: "_600",
  thumb: "_300",
};

/**
 * Resolve an image key or URL into a fully-qualified URL with optional
 * size derivative suffix.
 *
 * - Already-absolute URLs (http/https) are returned as-is.
 * - Relative R2 keys are prefixed with R2_BASE and get the size suffix.
 * - Falsy/missing keys return FALLBACK_IMAGE.
 */
export function resolveImageUrl(
  key: string | null | undefined,
  size: ImageSize = "full",
): string {
  if (!key || typeof key !== "string") return FALLBACK_IMAGE;

  if (key.startsWith("http://") || key.startsWith("https://")) return key;

  if (!R2_BASE) return FALLBACK_IMAGE;

  const suffix = SIZE_SUFFIX[size];
  const sized = suffix
    ? key.replace(/\.(jpeg|jpg|png|webp)$/i, `${suffix}.$1`)
    : key;

  return `${R2_BASE}/${sized}`;
}

/**
 * Given a product image field (which may be a key or full URL), return
 * the optimal URL for the given context.
 */
export function productImageUrl(
  image: string | null | undefined,
  size: ImageSize = "card",
): string {
  return resolveImageUrl(image, size);
}

/**
 * Vendor logo / avatar — always use thumb size.
 */
export function vendorLogoUrl(logo: string | null | undefined): string {
  return resolveImageUrl(logo, "thumb");
}
