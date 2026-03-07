import {
  TYPESENSE_HOST,
  TYPESENSE_PORT,
  TYPESENSE_PROTOCOL,
  TYPESENSE_SEARCH_KEY,
} from "./config";
import type { TypesenseHit } from "./types";

const COLLECTION = "products";

export type SearchResult = {
  total: number;
  results: TypesenseHit[];
  searchTimeMs: number;
  page: number;
};

export async function searchTypesense(params: {
  q: string;
  categorySlug?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  signal?: AbortSignal;
}): Promise<SearchResult> {
  const { q, categorySlug, page = 1, perPage = 20, sortBy, signal } = params;

  const searchParams = new URLSearchParams({
    q: q || "*",
    query_by: "title,description,brandName,keyFeatures",
    query_by_weights: "4,1,2,1",
    page: String(page),
    per_page: String(perPage),
    highlight_full_fields: "title",
    typo_tokens_threshold: "3",
    num_typos: "2",
  });

  if (categorySlug?.trim() && /^[a-zA-Z0-9_-]+$/.test(categorySlug)) {
    searchParams.set("filter_by", `categorySlug:=${categorySlug}`);
  }

  const defaultSort = "_text_match:desc,soldCount:desc,ratingAvg:desc";
  const sortMap: Record<string, string> = {
    priceAsc: "price:asc",
    priceDesc: "price:desc",
    newest: "createdAt:desc",
    rating: "ratingAvg:desc",
    reviews: "reviewCount:desc",
    bestselling: "soldCount:desc",
  };
  searchParams.set("sort_by", (sortBy && sortMap[sortBy]) || defaultSort);

  if (!TYPESENSE_SEARCH_KEY) {
    throw new Error("Typesense search key is not configured");
  }

  const url = `${TYPESENSE_PROTOCOL}://${TYPESENSE_HOST}:${TYPESENSE_PORT}/collections/${COLLECTION}/documents/search?${searchParams}`;

  const res = await fetch(url, {
    headers: { "X-TYPESENSE-API-KEY": TYPESENSE_SEARCH_KEY },
    signal,
  });

  if (!res.ok) throw new Error(`Search failed: ${res.status}`);

  const data = await res.json();
  return {
    total: data.found ?? 0,
    results: data.hits ?? [],
    searchTimeMs: data.search_time_ms ?? 0,
    page: data.page ?? page,
  };
}
