/**
 * Recently Viewed — AsyncStorage based (equivalent of web's localStorage).
 * Tracks products the user has viewed for the home screen carousel.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RecentlyViewedItem = {
  productId: string;
  variantPublicId: string;
  title: string;
  price: number;
  image: string;
  slug: string;
  viewedAt: number;
  categoryId?: number | null;
  compareAtPrice?: number | null;
  vendorName?: string | null;
  ratingAvg?: number | null;
  reviewCount?: number | null;
  soldCount?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }> | null;
};

const STORAGE_KEY = "wabbus_recently_viewed";
const MAX_ITEMS = 20;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function onRecentlyViewedUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cache: RecentlyViewedItem[] | null = null;

export async function loadRecentlyViewed(): Promise<RecentlyViewedItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : [];
    return cache!;
  } catch {
    cache = [];
    return [];
  }
}

async function saveRecentlyViewed(items: RecentlyViewedItem[]) {
  cache = items;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  notify();
}

export async function addToRecentlyViewed(
  item: Omit<RecentlyViewedItem, "viewedAt">,
): Promise<RecentlyViewedItem[]> {
  let items = await loadRecentlyViewed();
  items = items.filter((i) => i.productId !== item.productId);
  items.unshift({ ...item, viewedAt: Date.now() });
  if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
  await saveRecentlyViewed(items);
  return items;
}

export async function clearRecentlyViewed(): Promise<void> {
  cache = [];
  await AsyncStorage.removeItem(STORAGE_KEY);
  notify();
}
