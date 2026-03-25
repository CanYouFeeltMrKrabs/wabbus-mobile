/**
 * Wishlist — AsyncStorage based (equivalent of web's localStorage wishlist).
 * Uses a listener pattern instead of window events for React Native.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WishlistItem = {
  productId: string;
  variantPublicId: string;
  title: string;
  price: number;
  image: string;
  slug: string;
  addedAt: number;
  categoryId?: number | null;
};

const WISHLIST_KEY = "wabbus_wishlist";
const MAX_ITEMS = 500;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function onWishlistUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cache: WishlistItem[] | null = null;

export async function loadWishlist(): Promise<WishlistItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(WISHLIST_KEY);
    cache = raw ? JSON.parse(raw) : [];
    return cache!;
  } catch {
    cache = [];
    return [];
  }
}

async function saveWishlist(items: WishlistItem[]) {
  const capped = items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items;
  cache = capped;
  await AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(capped));
  notify();
}

export async function addToWishlist(
  item: Omit<WishlistItem, "addedAt">,
): Promise<WishlistItem[]> {
  const items = await loadWishlist();
  if (items.some((i) => i.productId === item.productId)) return items;
  items.push({ ...item, addedAt: Date.now() });
  await saveWishlist(items);
  return items;
}

export async function removeFromWishlist(productId: string): Promise<WishlistItem[]> {
  const items = (await loadWishlist()).filter((i) => i.productId !== productId);
  await saveWishlist(items);
  return items;
}

export async function isInWishlist(productId: string): Promise<boolean> {
  const items = await loadWishlist();
  return items.some((i) => i.productId === productId);
}

export async function clearWishlist(): Promise<void> {
  cache = [];
  await AsyncStorage.removeItem(WISHLIST_KEY);
  notify();
}
