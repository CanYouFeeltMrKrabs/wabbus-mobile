import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useT";
import { customerFetch } from "./api";
import { useAuth } from "./auth";
import type { CartItem, ServerCartItem } from "./types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./config";
import { showToast } from "./toast";
import { trackEvent } from "./tracker";

function truncateTitle(title: string): string {
  return title.length > 30 ? title.substring(0, 30) + "…" : title;
}

type CartState = {
  items: CartItem[];
  loading: boolean;
  itemCount: number;
  subtotalCents: number;
  addToCart: (item: AddToCartInput) => Promise<void>;
  updateQuantity: (publicId: string, quantity: number) => Promise<void>;
  removeItem: (publicId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
};

type AddToCartInput = {
  variantPublicId: string;
  price: number;
  title: string;
  image: string;
  quantity?: number;
  productId?: string;
  slug?: string;
  categoryId?: number;
};

/**
 * Check whether a product is still publicly listed (not archived/delisted).
 * Returns true on network errors so transient failures don't block the user.
 */
async function isProductAvailable(productId: string): Promise<boolean> {
  if (!API_BASE) return true;
  try {
    const res = await fetch(`${API_BASE}/products/public/${productId}/_`, {
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return true;
  }
}

const CartContext = createContext<CartState>({
  items: [],
  loading: true,
  itemCount: 0,
  subtotalCents: 0,
  addToCart: async () => {},
  updateQuantity: async () => {},
  removeItem: async () => {},
  clearCart: async () => {},
  refreshCart: async () => {},
});

export function useCart() {
  return useContext(CartContext);
}

const GUEST_CART_KEY = "guest_cart";

function serverToCartItem(s: ServerCartItem): CartItem {
  const variantTitle = s.productVariant?.title;
  const variantLabel =
    variantTitle && variantTitle !== "Default" ? variantTitle : undefined;

  const vendor = s.productVariant?.product?.vendor;
  const vendorName =
    vendor?.storeDisplayName?.trim() || vendor?.name?.trim() || undefined;

  return {
    publicId: s.publicId,
    variantPublicId: s.productVariant.publicId,
    quantity: s.quantity,
    unitPriceCents: s.unitPriceCents,
    title: s.productVariant.product.title,
    variantLabel,
    vendorName,
    image: s.productVariant.product.image || "",
    productId: s.productVariant.product.productId,
    slug: s.productVariant.product.slug,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGuestCart = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(GUEST_CART_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  const saveGuestCart = useCallback(async (cart: CartItem[]) => {
    await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    setItems(cart);
  }, []);

  const loadServerCart = useCallback(async () => {
    try {
      const data = await customerFetch<{ items: ServerCartItem[] }>("/cart");
      setItems((data.items || []).map(serverToCartItem));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  const refreshCart = useCallback(async () => {
    if (isLoggedIn) {
      await loadServerCart();
    } else {
      await loadGuestCart();
    }
  }, [isLoggedIn, loadServerCart, loadGuestCart]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = useCallback(async (input: AddToCartInput) => {
    const qty = input.quantity ?? 1;

    if (isLoggedIn) {
      try {
        await customerFetch("/cart/add", {
          method: "POST",
          body: JSON.stringify({ variantPublicId: input.variantPublicId, quantity: qty }),
        });
        await loadServerCart();
      } catch (e: unknown) {
        const err = e as { status?: number };
        if (err?.status === 404 || err?.status === 410) {
          showToast(t("cart.noLongerAvailable", { title: truncateTitle(input.title) }), "error");
          return;
        }
        throw e;
      }
    } else {
      if (input.productId && !(await isProductAvailable(input.productId))) {
        showToast(t("cart.noLongerAvailable", { title: truncateTitle(input.title) }), "error");
        return;
      }

      const cart = [...items];
      const existing = cart.find((c) => c.variantPublicId === input.variantPublicId);
      if (existing) {
        existing.quantity += qty;
      } else {
        cart.push({
          publicId: `guest_${Date.now()}`,
          variantPublicId: input.variantPublicId,
          quantity: qty,
          unitPriceCents: Math.round(input.price * 100),
          title: input.title,
          image: input.image,
          productId: input.productId,
          slug: input.slug,
        });
      }
      await saveGuestCart(cart);
    }

    if (input.productId) {
      void trackEvent("add_to_cart", {
        productId: input.productId,
        categoryId: input.categoryId,
        metadata: {
          variantPublicId: input.variantPublicId,
          price: input.price,
          title: input.title,
          quantity: qty,
        },
      });
    }
    showToast(t("cart.addedToCart", { title: truncateTitle(input.title) }), "success");
  }, [isLoggedIn, items, loadServerCart, saveGuestCart, t]);

  const updateQuantity = useCallback(async (publicId: string, quantity: number) => {
    if (isLoggedIn) {
      await customerFetch(`/cart/${publicId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity }),
      });
      await loadServerCart();
    } else {
      const cart = items.map((i) =>
        i.publicId === publicId ? { ...i, quantity } : i
      );
      await saveGuestCart(cart);
    }
  }, [isLoggedIn, items, loadServerCart, saveGuestCart]);

  const removeItem = useCallback(async (publicId: string) => {
    const productId = items.find((i) => i.publicId === publicId)?.productId;
    if (isLoggedIn) {
      await customerFetch(`/cart/${publicId}`, { method: "DELETE" });
      await loadServerCart();
    } else {
      await saveGuestCart(items.filter((i) => i.publicId !== publicId));
    }
    if (productId) void trackEvent("remove_from_cart", { productId });
  }, [isLoggedIn, items, loadServerCart, saveGuestCart]);

  const clearCart = useCallback(async () => {
    if (isLoggedIn) {
      await customerFetch("/cart/clear", { method: "POST" });
    }
    await AsyncStorage.removeItem(GUEST_CART_KEY);
    setItems([]);
  }, [isLoggedIn]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, loading, itemCount, subtotalCents, addToCart, updateQuantity, removeItem, clearCart, refreshCart }}
    >
      {children}
    </CartContext.Provider>
  );
}
