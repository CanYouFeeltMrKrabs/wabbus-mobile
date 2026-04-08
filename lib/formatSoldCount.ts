/**
 * Format a sold count into a human-readable compact string.
 * e.g. 1500 → "1.5K+", 25000 → "25K+"
 */
export function formatSoldCount(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000)}K+`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K+`;
  return String(n);
}
