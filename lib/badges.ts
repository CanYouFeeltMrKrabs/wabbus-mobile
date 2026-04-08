/**
 * Product badge computation — single source of truth.
 * Mirrors the backend logic and the web's badges.ts.
 */

export type Badge = { type: string; label: string; value?: number };

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function computeBadges(opts: {
  price: number;
  compareAtPrice?: number | null;
  createdAt?: number | string | null;
  reviewCount?: number | null;
}): Badge[] {
  const badges: Badge[] = [];

  const p = opts.price;
  const c = opts.compareAtPrice ? Number(opts.compareAtPrice) : null;

  if (p && c && c > p) {
    const discountPct = Math.round(((c - p) / c) * 100);
    if (discountPct > 0) {
      badges.push({ type: "SALE", label: `${discountPct}% Off`, value: discountPct });
    }
  }

  if (opts.createdAt) {
    const created =
      typeof opts.createdAt === "number"
        ? opts.createdAt * 1000
        : new Date(String(opts.createdAt)).getTime();
    if (Date.now() - created < FOURTEEN_DAYS_MS) {
      badges.push({ type: "NEW", label: "New" });
    }
  }

  if (opts.reviewCount != null && opts.reviewCount >= 5) {
    badges.push({ type: "BESTSELLER", label: "Bestseller" });
  }

  return badges;
}
