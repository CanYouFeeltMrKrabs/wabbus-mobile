export const API_BASE = process.env.EXPO_PUBLIC_API_URL?.trim() || "";
export const R2_BASE = process.env.EXPO_PUBLIC_R2_PUBLIC_BASE_URL?.trim() || "";
export const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";

export const TYPESENSE_HOST = process.env.EXPO_PUBLIC_TYPESENSE_HOST?.trim() || "";
export const TYPESENSE_PORT = process.env.EXPO_PUBLIC_TYPESENSE_PORT?.trim() || "443";
export const TYPESENSE_PROTOCOL = process.env.EXPO_PUBLIC_TYPESENSE_PROTOCOL?.trim() || "https";
export const TYPESENSE_SEARCH_KEY = process.env.EXPO_PUBLIC_TYPESENSE_SEARCH_KEY?.trim() || "";

export const FALLBACK_IMAGE = "https://placehold.co/400x300/f3f4f6/9ca3af?text=No+Image";
