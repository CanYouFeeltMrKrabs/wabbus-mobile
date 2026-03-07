/** Shared types used across the mobile app */

export type PublicProduct = {
  id: number;
  productId: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  price: number;
  compareAtPrice?: number | null;
  defaultVariantId: number | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount?: number;
  vendorName: string | null;
  categoryId?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }>;
};

export type CartItem = {
  publicId: string;
  productVariantId: number;
  quantity: number;
  unitPriceCents: number;
  title: string;
  image: string;
  productId?: string;
  slug?: string;
};

export type ServerCartItem = {
  publicId: string;
  quantity: number;
  unitPriceCents: number;
  productVariant: {
    id: number;
    product: {
      productId: string;
      title: string;
      slug: string;
      image: string | null;
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
  status: string;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  items: OrderItem[];
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
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
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
    price: number;
    compareAtPrice: number;
    image: string;
    ratingAvg: number;
    reviewCount: number;
    soldCount: number;
    vendorName: string;
    defaultVariantId: number;
    keyFeatures: string[];
    createdAt: number;
  };
};
