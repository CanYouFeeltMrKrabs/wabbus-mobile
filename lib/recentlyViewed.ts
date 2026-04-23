/**
 * Recently Viewed — AsyncStorage based (equivalent of web's localStorage).
 * Tracks products the user has viewed for the home screen carousel.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PreviewVideoMeta } from "@/lib/types";

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
  /**
   * Carried through from `PublicProduct.previewVideo` so the recently-
   * viewed slider can autoplay the same silent preview that the source
   * grid did. Older AsyncStorage payloads predating this field will
   * simply be `undefined` here, falling back to the static image.
   */
  previewVideo?: PreviewVideoMeta | null;
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

/**
 * Validate a stored entry. Earlier app builds wrote `image: ""` and
 * `price: NaN` for every product viewed (the PDP API returns no flat
 * `image` / `price` fields, but the writer naively read them as
 * `product.image` / `product.price`). Those corrupt entries persist in
 * users' AsyncStorage forever unless we filter them out at load time —
 * the slider would otherwise keep rendering blank cards / `$0.00`
 * prices until each affected product is re-viewed under the new code.
 *
 * Required: stable identifier, a non-empty image reference, and a
 * positive integer cents price. NaN, 0, and negative prices all
 * indicate the writer failed to read variant data correctly.
 */
function isValidEntry(entry: any): entry is RecentlyViewedItem {
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.productId !== "string" || entry.productId.length === 0) return false;
  if (typeof entry.image !== "string" || entry.image.length === 0) return false;
  if (typeof entry.price !== "number" || !Number.isFinite(entry.price) || entry.price <= 0) return false;
  return true;
}

export async function loadRecentlyViewed(): Promise<RecentlyViewedItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? parsed : [];
    const valid = items.filter(isValidEntry);
    // Persist the cleanup so subsequent loads see the trimmed list and
    // we don't re-do the validation work on every cache miss. The write
    // is best-effort: if it fails (storage full, permissions, etc.) we
    // still serve `valid` from memory.
    if (valid.length !== items.length) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } catch {
        // Swallow — the in-memory cache below is the source of truth
        // for this session, and the next successful save (e.g. via
        // `addToRecentlyViewed`) will re-persist the trimmed list.
      }
    }
    cache = valid;
    return cache;
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
