import { R2_BASE } from "@/lib/config";
import type { ReturnRequest } from "@/lib/types";

export const CANCELLABLE = ["PAID"];

export function progressIndex(status?: string | null): number {
  const s = (status || "").toLowerCase();
  if (s === "delivered" || s === "completed") return 3;
  if (s === "shipped") return 2;
  if (s === "processing") return 1;
  return 0;
}

export function isCancellable(status?: string | null): boolean {
  return CANCELLABLE.includes((status || "").toUpperCase());
}

export function isAllowedToReview(orderStatus?: string | null): boolean {
  const s = (orderStatus || "").toUpperCase();
  return s === "DELIVERED" || s === "COMPLETED" || s === "REFUNDED";
}

/**
 * Map a return status to a progress step index (0-4).
 * Steps: Submitted(0) → Under Review(1) → Ship Return(2) → Returned(3) → Refunded(4)
 */
export function returnProgressIndex(ret: {
  status?: string | null;
  refund?: { status: string } | null;
  returnShipments?: Array<{ deliveredAt?: string | null }> | null;
  returnShipment?: { deliveredAt?: string | null } | null;
  returnLabelUrl?: string | null;
  returnCarrier?: string | null;
  returnTrackingNumber?: string | null;
}): { step: number; terminal: boolean } {
  const s = (ret.status || "").toUpperCase();

  if (s === "REFUNDED" || s === "CREDITED") return { step: 4, terminal: false };
  if (s === "DELIVERED" || s === "DELIVERED_TO_VENDOR" || s === "INSPECTING")
    return { step: 3, terminal: false };
  if (s === "AWAITING_SHIPMENT" || s === "IN_TRANSIT")
    return { step: 2, terminal: false };
  if (
    s === "VENDOR_REVIEWING" ||
    s === "VENDOR_DENIED_PENDING_AUTO_APPROVE" ||
    s === "SUPPORT_REVIEWING" ||
    s === "APPROVED" ||
    s === "AWAITING_LABEL"
  )
    return { step: 1, terminal: false };

  if (s === "CLOSED" || s === "CLOSED_EXPIRED") {
    if (ret.refund) return { step: 4, terminal: true };
    const delivered =
      ret.returnShipments?.some((sh) => sh.deliveredAt) ||
      ret.returnShipment?.deliveredAt;
    if (delivered) return { step: 3, terminal: true };
    if (ret.returnTrackingNumber) return { step: 2, terminal: true };
    if (ret.returnLabelUrl || ret.returnCarrier)
      return { step: 1, terminal: true };
    return { step: 1, terminal: true };
  }

  return { step: 0, terminal: false };
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("http://") || v.startsWith("https://");
}

export function pickReturnItemImage(
  orderItem: ReturnRequest["orderItem"],
): string | null {
  if (!orderItem) return null;

  const img = orderItem.image;
  if (img) {
    if (isHttpUrl(img)) return img;
    if (R2_BASE) return `${R2_BASE.replace(/\/$/, "")}/${img.replace(/^\//, "")}`;
  }

  return null;
}

export function pickReturnCaseItemImage(
  caseItem?: {
    orderItem?: {
      productVariant?: {
        product?: {
          images?: Array<{ key?: string }> | null;
        } | null;
      } | null;
    };
  } | null,
): string | null {
  if (!caseItem?.orderItem) return null;

  const key =
    caseItem.orderItem.productVariant?.product?.images?.[0]?.key ?? null;
  if (!key) return null;
  if (isHttpUrl(key)) return key;
  if (R2_BASE)
    return `${R2_BASE.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
  return key;
}
