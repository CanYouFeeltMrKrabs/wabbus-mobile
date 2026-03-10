import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { customerFetch } from "./api";
import { useAuth } from "./auth";
import type { CartItem, ServerCartItem } from "./types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showToast } from "./toast";

const ADDED_SUFFIX = " added to cart";

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
  productVariantId: number;
  price: number;
  title: string;
  image: string;
  quantity?: number;
  productId?: string;
  slug?: string;
};

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
  return {
    publicId: s.publicId,
    productVariantId: s.productVariant.id,
    quantity: s.quantity,
    unitPriceCents: s.unitPriceCents,
    title: s.productVariant.product.title,
    image: s.productVariant.product.image || "",
    productId: s.productVariant.product.productId,
    slug: s.productVariant.product.slug,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
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
      await customerFetch("/cart/add", {
        method: "POST",
        body: JSON.stringify({ productVariantId: input.productVariantId, quantity: qty }),
      });
      await loadServerCart();
    } else {
      const cart = [...items];
      const existing = cart.find((c) => c.productVariantId === input.productVariantId);
      if (existing) {
        existing.quantity += qty;
      } else {
        cart.push({
          publicId: `guest_${Date.now()}`,
          productVariantId: input.productVariantId,
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
    
    showToast(`${truncateTitle(input.title)}${ADDED_SUFFIX}`, "success");
  }, [isLoggedIn, items, loadServerCart, saveGuestCart]);

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
    if (isLoggedIn) {
      await customerFetch(`/cart/${publicId}`, { method: "DELETE" });
      await loadServerCart();
    } else {
      await saveGuestCart(items.filter((i) => i.publicId !== publicId));
    }
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
