/**
 * Order / return / case status configuration — single source of truth
 * for icons, colors, and labels across the mobile app.
 *
 * Uses RN-compatible hex colors (no Tailwind classes).
 */

export type StatusConfig = {
  icon: string;
  label: string;
  bg: string;
  fg: string;
};

// ─── Order statuses ──────────────────────────────────────────

const PROCESSING: StatusConfig = { icon: "sync", label: "Processing", bg: "#fef3c7", fg: "#92400e" };
const SHIPPED: StatusConfig = { icon: "local-shipping", label: "Shipped", bg: "#dbeafe", fg: "#1e40af" };
const DELIVERED: StatusConfig = { icon: "check-circle", label: "Delivered", bg: "#d1fae5", fg: "#065f46" };
const CANCELLED: StatusConfig = { icon: "cancel", label: "Cancelled", bg: "#fee2e2", fg: "#991b1b" };
const REFUNDED: StatusConfig = { icon: "currency-exchange", label: "Refunded", bg: "#fee2e2", fg: "#991b1b" };
const DISPUTED: StatusConfig = { icon: "gavel", label: "Disputed", bg: "#fee2e2", fg: "#991b1b" };
const RETURNED: StatusConfig = { icon: "assignment-return", label: "Returned", bg: "#f3e8ff", fg: "#6b21a8" };

const ORDER_STATUS_MAP: Record<string, StatusConfig> = {
  pending: PROCESSING,
  paid: PROCESSING,
  processing: PROCESSING,
  on_hold: PROCESSING,
  shipped: SHIPPED,
  partially_shipped: SHIPPED,
  delivered: DELIVERED,
  completed: DELIVERED,
  cancelled: CANCELLED,
  refunded: REFUNDED,
  partially_refunded: REFUNDED,
  disputed: DISPUTED,
  returned: RETURNED,
};

const ORDER_FALLBACK: StatusConfig = PROCESSING;

export function getOrderStatusConfig(rawStatus?: string | null): StatusConfig {
  const key = (rawStatus || "").toLowerCase().trim();
  return ORDER_STATUS_MAP[key] ?? ORDER_FALLBACK;
}

// ─── Return statuses ─────────────────────────────────────────

const RETURN_STATUS_MAP: Record<string, StatusConfig> = {
  VENDOR_REVIEWING:                    { icon: "hourglass-top", label: "Under Review", bg: "#fef3c7", fg: "#d97706" },
  VENDOR_DENIED_PENDING_AUTO_APPROVE:  { icon: "hourglass-top", label: "Under Review", bg: "#fef3c7", fg: "#d97706" },
  SUPPORT_REVIEWING:                   { icon: "support-agent", label: "Support Reviewing", bg: "#f3e8ff", fg: "#9333ea" },
  APPROVED:                            { icon: "check-circle", label: "Approved", bg: "#d1fae5", fg: "#059669" },
  AWAITING_LABEL:                      { icon: "label", label: "Generating Label", bg: "#dbeafe", fg: "#2563eb" },
  AWAITING_SHIPMENT:                   { icon: "inventory", label: "Ship Your Return", bg: "#ede9fe", fg: "#7c3aed" },
  IN_TRANSIT:                          { icon: "local-shipping", label: "Return In Transit", bg: "#ccfbf1", fg: "#0d9488" },
  DELIVERED_TO_VENDOR:                 { icon: "inventory-2", label: "Return Delivered", bg: "#ccfbf1", fg: "#0d9488" },
  INSPECTING:                          { icon: "search", label: "Being Inspected", bg: "#ccfbf1", fg: "#0d9488" },
  REFUNDED:                            { icon: "payments", label: "Refund Complete", bg: "#d1fae5", fg: "#059669" },
  CREDITED:                            { icon: "account-balance-wallet", label: "Store Credit Issued", bg: "#d1fae5", fg: "#059669" },
  REFUND_FAILED:                       { icon: "error-outline", label: "Refund Processing", bg: "#fef3c7", fg: "#d97706" },
  CLOSED:                              { icon: "check-circle", label: "Closed", bg: "#d1fae5", fg: "#059669" },
  CLOSED_EXPIRED:                      { icon: "schedule", label: "Expired", bg: "#f3f4f6", fg: "#6b7280" },
};

const RETURN_FALLBACK: StatusConfig = { icon: "help-outline", label: "Unknown", bg: "#f3f4f6", fg: "#6b7280" };

export function getReturnStatusConfig(rawStatus?: string | null): StatusConfig {
  const key = (rawStatus || "").toUpperCase().trim();
  return RETURN_STATUS_MAP[key] ?? RETURN_FALLBACK;
}

// ─── Case / conversation statuses ────────────────────────────

const CASE_STATUS_MAP: Record<string, { bg: string; fg: string }> = {
  OPEN:              { bg: "#dbeafe", fg: "#1d4ed8" },
  AWAITING:          { bg: "#dbeafe", fg: "#1d4ed8" },
  RESOLVED:          { bg: "#d1fae5", fg: "#047857" },
  CLOSED:            { bg: "#f3f4f6", fg: "#6b7280" },
  AWAITING_CUSTOMER: { bg: "#ede9fe", fg: "#6d28d9" },
};

const CASE_FALLBACK = CASE_STATUS_MAP.OPEN;

export function getCaseStatusStyle(rawStatus?: string | null): { bg: string; fg: string } {
  const key = (rawStatus || "").toUpperCase().replace(/ /g, "_").trim();
  return CASE_STATUS_MAP[key] ?? CASE_FALLBACK;
}
