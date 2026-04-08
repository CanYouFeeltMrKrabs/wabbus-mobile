/** Shared types used across the mobile app */

export type PublicProduct = {
  productId: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  price: number;
  compareAtPrice?: number | null;
  defaultVariantPublicId?: string | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount?: number;
  vendorName: string | null;
  categoryId?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }>;
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
  unitPriceCents: number;
  productVariant: {
    publicId: string;
    title?: string | null;
    price?: number | string | null;
    product: {
      productId: string;
      title: string;
      slug: string;
      image: string | null;
      vendor?: {
        name?: string;
        storeDisplayName?: string;
      } | null;
    };
  };
};

export type Address = {
  id: number;
  publicId: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  isDefault: boolean;
};

export type Order = {
  id: number;
  publicId: string;
  orderNumber?: string | null;
  status: string;
  totalCents: number;
  totalAmount?: string | number | null;
  itemCount: number;
  createdAt: string;
  items: OrderItem[];
};

export type ReturnRequest = {
  id: number;
  publicId?: string;
  status: string;
  createdAt: string;
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
    unitPriceCents?: number | null;
    order?: { publicId?: string; orderNumber?: string | null };
  } | null;
};

export type OrderItem = {
  id: number;
  publicId: string;
  title: string;
  image: string | null;
  quantity: number;
  unitPriceCents: number;
  status: string;
};

export type Customer = {
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
};

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
