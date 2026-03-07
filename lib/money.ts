export function formatMoney(cents: number, currency = "USD"): string {
  if (!Number.isFinite(cents)) return "$0.00";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatDollars(amount: number, currency = "USD"): string {
  if (!Number.isFinite(amount)) return "$0.00";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function toCents(price: string | number | undefined | null): number {
  if (price === null || price === undefined) return 0;
  const n = typeof price === "number" ? price : Number(price);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
