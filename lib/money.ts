import { getLocale } from "./locale";

const LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-419",
  id: "id-ID",
};

function resolveLocale(locale?: string): string {
  const l = locale ?? getLocale();
  return LOCALE_MAP[l] ?? l;
}

export function formatMoney(cents: number, currency = "USD", locale?: string): string {
  if (!Number.isFinite(cents)) return "$0.00";
  const value = cents / 100;
  const resolved = resolveLocale(locale);
  try {
    return new Intl.NumberFormat(resolved, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
}

export function formatDollars(amount: number, currency = "USD", locale?: string): string {
  if (!Number.isFinite(amount)) return "$0.00";
  const resolved = resolveLocale(locale);
  try {
    return new Intl.NumberFormat(resolved, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

export function toCents(price: unknown): number {
  if (price === null || price === undefined) return 0;
  if (typeof price === "number") return Number.isFinite(price) ? Math.round(price * 100) : 0;
  if (typeof price === "string") {
    const n = Number(price);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  if (typeof price === "object") {
    const obj = price as Record<string, unknown>;
    const inner = obj.amount ?? obj.value ?? undefined;
    if (inner !== undefined) return toCents(inner);
    const s = String(price);
    if (s !== "[object Object]") return toCents(s);
  }
  return 0;
}
