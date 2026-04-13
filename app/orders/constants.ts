export const PROGRESS_STEPS = ["Placed", "Processing", "Shipped", "Delivered"];

export const RETURN_PROGRESS_STEPS = [
  "Submitted",
  "Under Review",
  "Ship Return",
  "Returned",
  "Refunded",
];

export const RETURN_STATUS_GRADIENTS: Record<
  string,
  { label: string; colors: [string, string] }
> = {
  VENDOR_REVIEWING: {
    label: "Under Review",
    colors: ["#f59e0b", "#d97706"],
  },
  VENDOR_DENIED_PENDING_AUTO_APPROVE: {
    label: "Under Review",
    colors: ["#f59e0b", "#d97706"],
  },
  SUPPORT_REVIEWING: {
    label: "Support Reviewing",
    colors: ["#a855f7", "#9333ea"],
  },
  APPROVED: { label: "Approved", colors: ["#10b981", "#059669"] },
  AWAITING_LABEL: {
    label: "Generating Label",
    colors: ["#3b82f6", "#2563eb"],
  },
  AWAITING_SHIPMENT: {
    label: "Ship Your Return",
    colors: ["#8b5cf6", "#7c3aed"],
  },
  IN_TRANSIT: {
    label: "Return In Transit",
    colors: ["#14b8a6", "#0d9488"],
  },
  DELIVERED: {
    label: "Return Delivered",
    colors: ["#14b8a6", "#0d9488"],
  },
  DELIVERED_TO_VENDOR: {
    label: "Return Delivered",
    colors: ["#14b8a6", "#0d9488"],
  },
  INSPECTING: {
    label: "Being Inspected",
    colors: ["#14b8a6", "#0d9488"],
  },
  REFUNDED: { label: "Refund Complete", colors: ["#10b981", "#059669"] },
  CREDITED: {
    label: "Store Credit Issued",
    colors: ["#10b981", "#059669"],
  },
  REFUND_FAILED: {
    label: "Refund Processing",
    colors: ["#3b82f6", "#2563eb"],
  },
  CLOSED: { label: "Closed", colors: ["#9ca3af", "#6b7280"] },
  CLOSED_EXPIRED: { label: "Expired", colors: ["#9ca3af", "#6b7280"] },
};
