/** Shared types used across the mobile app */

/**
 * Approved product preview-video metadata. Shape mirrors the backend
 * `PublicProductDto.previewVideo` exactly, matching the web type at
 * `Wabbus/src/lib/category-data.ts`. Used by `PublicProduct`,
 * `RecentlyViewedItem`, and any other surface that needs to carry
 * the silent-autoplay video reference.
 */
export type PreviewVideoMeta = {
  mp4Url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

export type PublicProduct = {
  productId: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  price: number | null;
  compareAtPrice?: number | null;
  defaultVariantPublicId?: string | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount?: number;
  vendorName: string | null;
  categoryId?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }>;

  /**
   * Primary APPROVED product video for in-card preview autoplay on
   * carousels and grids. Absent when the product has no approved video.
   * The card silently falls back to the static image when null/undefined.
   */
  previewVideo?: PreviewVideoMeta | null;
};

export type CartItem = {
  publicId: string;
  variantPublicId: string;
  quantity: number;
  unitPriceCents: number;
  title: string;
  variantLabel?: string;
  vendorName?: string;
  image: string;
  productId?: string;
  slug?: string;
};

export type ServerCartItem = {
  publicId: string;
  quantity: number;
  productVariant?: {
    publicId?: string | null;
    title?: string | null;
    price?: number | string | null;
    product?: {
      productId?: string;
      title?: string | null;
      slug?: string;
      image?: string | null;
      images?: { key: string }[];
      vendor?: {
        name?: string | null;
        storeDisplayName?: string | null;
      } | null;
    } | null;
  } | null;
};

export type Address = {
  id: number;
  publicId: string;
  label?: string | null;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  /** Backend may return either zip or postalCode */
  zip: string;
  postalCode?: string;
  country: string;
  phone?: string;
  isDefault: boolean;
};

// ─── Order types (match actual backend API response) ──────────────────────

export type Order = {
  publicId?: string | null;
  orderNumber?: string | null;
  status: string;
  totalAmount?: string | number | null;
  currency?: string | null;
  createdAt: string;
  paidAt?: string | null;
  items?: OrderItem[] | null;

  subtotalAmount?: string | number | null;
  shippingAmount?: string | number | null;
  taxAmount?: string | number | null;
  discountAmount?: string | number | null;

  paymentStatus?: string | null;
  paymentMethodType?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;

  paymentMethod?: {
    type?: string | null;
    brand?: string | null;
    last4?: string | null;
  } | null;

  shippingAddress?: {
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;

  cases?: Array<{
    caseNumber: string;
    status: string;
    resolutionIntent?: string | null;
    createdAt: string;
    items?: Array<{ reasonCode?: string }> | null;
  }> | null;

  customerOrderCases?: Array<{
    caseNumber: string;
    status: string;
    resolutionIntent?: string | null;
    createdAt: string;
    items?: Array<{ reasonCode?: string }> | null;
  }> | null;
};

/**
 * OrderItem — wide union matching the backend's nested include response.
 *
 * The backend sends `unitPrice` as a Decimal string (e.g. "14.99") and nests
 * title/image under productVariant.product. Consumers should use the helpers
 * in orderHelpers.ts (pickItemTitle, pickItemImage, pickUnitPriceCents) rather
 * than accessing fields directly.
 */
export type OrderItem = {
  publicId?: string | null;
  quantity?: number | null;

  unitPrice?: string | number | null;
  currency?: string | null;

  title?: string | null;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;

  status?: string | null;
  cancelledAt?: string | null;

  productVariant?: {
    publicId?: string | null;
    title?: string | null;
    sku?: string | null;
    imageUrl?: string | null;
    // Backend may send key/url as null (not just undefined); aligned with the
    // canonical schema in lib/queries/orders.ts (OrderItemSchema → productVariant
    // → images). All call sites already use optional chaining, so this is a
    // type-only correction — runtime behavior is unchanged.
    images?: Array<{ key?: string | null; url?: string | null }> | null;
    product?: {
      title?: string | null;
      name?: string | null;
      productId?: string | null;
      slug?: string | null;
      imageUrl?: string | null;
      image?: string | null;
      images?: Array<{ key?: string | null; url?: string | null }> | null;
    } | null;
  } | null;

  vendor?: {
    name?: string | null;
    publicId?: string | null;
    slug?: string | null;
  } | null;
  vendorName?: string | null;

  caseItems?: Array<{
    caseNumber: string;
    case?: { resolutionFinal?: string | null } | null;
  }> | null;
  shipmentItems?: Array<{
    shipment?: {
      publicId?: string | null;
      direction?: string | null;
      status?: string | null;
      carrier?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
      shippedAt?: string | null;
      estimatedDelivery?: string | null;
      deliveredAt?: string | null;
      signedBy?: string | null;
    } | null;
  }> | null;

  quantityReturned?: number;
  quantityCancelled?: number;
};

// ─── Return types (match CUSTOMER_RETURN_LIST_SELECT) ─────────────────────

export type ReturnRequest = {
  caseNumber?: string;
  status: string;
  itemCount?: number;
  totalValueCents?: number;
  requestedLabelCount?: number;
  shipByDeadlineAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;

  case?: {
    caseNumber?: string;
    status?: string;
    resolutionIntent?: string | null;
    resolutionFinal?: string | null;
    resolvedAt?: string | null;
    closedAt?: string | null;
    order?: { publicId?: string; orderNumber?: string | null };
    items?: Array<{
      qtyAffected?: number;
      reasonCode?: string;
      notes?: string | null;
      orderItem?: {
        publicId?: string;
        quantity?: number;
        unitPrice?: string | number | null;
        productVariant?: {
          title?: string | null;
          sku?: string | null;
          publicId?: string | null;
          product?: {
            title?: string | null;
            productId?: string | null;
            images?: Array<{ key?: string }> | null;
          } | null;
        } | null;
      };
    }>;
  } | null;

  refund?: {
    status: string;
    amountCents: number;
    createdAt: string;
  } | null;

  returnShipment?: {
    status?: string;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    labelUrl?: string | null;
    shippedAt?: string | null;
    estimatedDelivery?: string | null;
    deliveredAt?: string | null;
  } | null;

  returnShipments?: Array<{
    status?: string;
    carrier?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    labelUrl?: string | null;
    shippedAt?: string | null;
    estimatedDelivery?: string | null;
    deliveredAt?: string | null;
  }>;

  // Legacy flat fields for backwards compatibility
  reason?: string | null;
  resolution?: string | null;
  returnLabelUrl?: string | null;
  returnCarrier?: string | null;
  returnTrackingNumber?: string | null;
  shipBy?: string | null;
  orderItem?: {
    title?: string | null;
    image?: string | null;
    quantity?: number | null;
    unitPrice?: string | number | null;
    order?: { publicId?: string; orderNumber?: string | null };
  } | null;
};

// ─── Customer (matches GET /customer-auth/me) ─────────────────────────────

export type Customer = {
  email: string;
  name?: string | null;
  createdAt: string;
  impersonatedBy?: number | null;
  accountStatus?: "ACTIVE" | "BANNED" | "PENDING_DELETION";
  deletionScheduledAt?: string | null;
};

// ─── Checkout / Cart ──────────────────────────────────────────────────────

export type CheckoutAddress = {
  publicId: string;
  label?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  isDefault?: boolean;
};

export type ServerCartResponse = {
  items: ServerCartItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

export type CheckoutResponse = {
  orderId?: number;
  orderPublicId?: string;
  orderNumber?: string;
  clientSecret?: string;
  paymentClientSecret?: string;
  paymentIntentClientSecret?: string;
  stripeClientSecret?: string;
  stripeAmountCents?: number;
  creditAppliedCents?: number;
  payment?: {
    status?: string;
    clientSecret?: string;
  };
};

export type PaymentMethod = {
  stripePaymentMethodId: string;
  type?: string | null;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault?: boolean | null;
  createdAt?: string;
};

export type GuestCheckoutData = {
  email: string;
  shippingAddress: {
    firstName: string;
    lastName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
  billingAddress?: GuestCheckoutData["shippingAddress"];
  items: { variantPublicId: string; quantity: number }[];
};

// ─── Enums ────────────────────────────────────────────────────────────────

export type CancelReasonCode =
  | "CHANGED_MIND"
  | "FOUND_CHEAPER"
  | "ORDERED_WRONG"
  | "NO_LONGER_NEEDED"
  | "OTHER";

export type ReturnReasonCode =
  | "DAMAGED"
  | "DEFECTIVE"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "DOESNT_FIT"
  | "CHANGED_MIND"
  | "OTHER";

export type ReturnResolution = "REFUND" | "STORE_CREDIT" | "REPLACEMENT";

export type MissingIssueReason =
  | "NEVER_SHIPPED"
  | "TRACKING_STOPPED"
  | "LOST_IN_TRANSIT"
  | "DELIVERED_NOT_RECEIVED"
  | "OTHER";

export type ReviewImageUpload = {
  reviewImageId: string;
  uploadUrl: string;
};

// ─── Search ───────────────────────────────────────────────────────────────

export type TypesenseHit = {
  document: {
    id: string;
    title: string;
    description: string;
    brandName: string;
    slug: string;
    categoryId: number;
    categoryName: string;
    categorySlug: string;
    categoryName_es?: string;
    categoryName_id?: string;
    price: number;
    compareAtPrice: number;
    image: string;
    ratingAvg: number;
    reviewCount: number;
    soldCount: number;
    vendorName: string;
    defaultVariantPublicId: string;
    defaultVariantTitle?: string;
    keyFeatures: string[];
    createdAt: number;
  };
};

export function getLocalizedCategoryName(
  doc: TypesenseHit["document"],
  locale?: string,
): string {
  if (locale === "es" && doc.categoryName_es) return doc.categoryName_es;
  if (locale === "id" && doc.categoryName_id) return doc.categoryName_id;
  return doc.categoryName;
}
