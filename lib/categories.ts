import { API_BASE } from "./config";
import { getLocale } from "./locale";

export type CategoryLink = { id: number; name: string; slug: string };

/**
 * Icon mapping: category slug -> MaterialIcons icon name.
 * These map the web's Material Symbols to @expo/vector-icons MaterialIcons equivalents.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  "everyday-household": "home",
  kitchenware: "restaurant",
  "textiles-and-fabric": "texture",
  "small-appliances": "kitchen",
  "clothing-and-underwear": "checkroom",
  "muslim-fashion": "style",
  "shoes-boots-suitcases-and-bags": "shopping-bag",
  "beauty-and-personal-care": "spa",
  digital: "devices",
  computers: "computer",
  "pet-supplies": "pets",
  "baby-maternity": "child-care",
  sports: "sports-soccer",
  recreation: "sports-esports",
  "commercial-home-furniture": "chair",
  "decorating-tools": "build",
  "decorating-materials": "palette",
  "car-supplies": "directions-car",
  "watches-and-accessories": "watch",
  "food-and-raw-foods": "restaurant-menu",
  health: "health-and-safety",
  books: "menu-book",
  "kids-fashion": "face",
  "menswear-and-underwear": "man",
  "luggage-and-bags": "luggage",
  "virtual-products": "cloud",
  "pre-owned": "recycling",
  "hobbies-and-collections": "interests",
  "jewellery-accessories-and-derivatives": "diamond",
  "collectibles-and-fine-art": "museum",
  electronics: "memory",
  "garden-and-outdoor": "yard",
  handmade: "handyman",
  "health-household-and-baby-care": "stroller",
  "home-and-business-services": "home-repair-service",
  "home-and-kitchen": "kitchen",
  "industrial-and-scientific": "precision-manufacturing",
  "luggage-and-travel-gear": "flight",
  "luxury-stores": "storefront",
  "musical-instruments": "piano",
  "office-products": "print",
  "premium-beauty": "auto-awesome",
};

const DEFAULT_ICON = "category";

export function getCategoryIcon(slug: string): string {
  return CATEGORY_ICONS[slug] ?? DEFAULT_ICON;
}

/**
 * Short display names for categories — used in the scrollable categories bar.
 * NOTE: Once the backend returns localized names, the API name should take
 * precedence. This map remains as a compact English fallback for pill labels.
 */
export const CATEGORY_SHORT_NAMES: Record<string, string> = {
  "clothing-and-underwear": "Clothing",
  "shoes-boots-suitcases-and-bags": "Shoes & Bags",
  "beauty-and-personal-care": "Beauty",
  "baby-maternity": "Baby",
  "commercial-home-furniture": "Furniture",
  "decorating-tools": "Decor Tools",
  "decorating-materials": "Decor Materials",
  "watches-and-accessories": "Watches",
  "food-and-raw-foods": "Food",
  "textiles-and-fabric": "Textiles",
  "menswear-and-underwear": "Menswear",
  "hobbies-and-collections": "Hobbies",
  "jewellery-accessories-and-derivatives": "Jewellery",
  "collectibles-and-fine-art": "Collectibles",
  "health-household-and-baby-care": "Baby Care",
  "home-and-business-services": "Services",
  "home-and-kitchen": "Home & Kitchen",
  "industrial-and-scientific": "Industrial",
  "luggage-and-travel-gear": "Travel Gear",
  "luxury-stores": "Luxury",
  "musical-instruments": "Musical",
  "office-products": "Office",
  "premium-beauty": "Premium Beauty",
  "garden-and-outdoor": "Garden",
};

export type CategoryNode = {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentId: number | null;
  icon?: string | null;
  children?: CategoryNode[];
};

export async function fetchCategoriesClient(): Promise<CategoryLink[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) return [];
    const data: CategoryLink[] = await res.json();
    return data
      .filter((c) => c.id && c.name?.trim() && c.slug?.trim())
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function fetchRootCategories(): Promise<CategoryLink[]> {
  try {
    const res = await fetch(`${API_BASE}/categories/roots`, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) return fetchCategoriesClient();
    const data: CategoryLink[] = await res.json();
    return data
      .filter((c) => c.id && c.name?.trim() && c.slug?.trim())
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function fetchCategoryChildren(parentId: number): Promise<CategoryLink[]> {
  try {
    const res = await fetch(`${API_BASE}/categories/by-id/${parentId}/children`, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchCategoryById(id: number): Promise<CategoryNode | null> {
  try {
    const res = await fetch(`${API_BASE}/categories/by-id/${id}`, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: { "Accept-Language": getLocale() },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
