/**
 * Categories domain — sealed query layer.
 *
 * Single owner of every cache entry under the "categories" key tuple.
 * App code reaches the categories cache exclusively through the typed
 * read hooks (or `invalidate.categories.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule),
 * §3.1 (per-domain choreography), and
 * .cursor/handoff-sealed-query-layer.md §E.5 (categories inventory).
 *
 * Schema note: all object schemas use `v.looseObject`, NOT `v.object`.
 * See lib/queries/orders.ts for the long-form rationale shared across
 * every domain module.
 *
 * Outlier check: no shape divergence detected across callers. Each key
 * has exactly one call site (products + newArrivals both hit
 * `/products/public` but under separate keys with separate params).
 * `all()` uses `fetchCategoriesClient` which returns `CategoryLink[]`.
 * No outlier; any caller can be first.
 *
 * `categories.detail` exists in the legacy factory but has zero readers
 * and zero invalidators — no hook or key entry is created per §F.13.
 */

import * as v from "valibot";

import { NetworkError } from "@/lib/api";
import { fetchCategoriesClient } from "@/lib/categories";
import { API_BASE } from "@/lib/config";
import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow, filterValidItems } from "./_validate";
import { PublicProductSchema, type PublicProduct } from "./products";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
// Valibot's `v.object` STRIPS unknown keys from the parsed output, which
// would silently delete backend fields callers read off the canonical
// shape. See lib/queries/orders.ts for the long-form rationale.

const CategoryLinkSchema = v.looseObject({
  id: v.number(),
  name: v.string(),
  slug: v.string(),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type CategoryLink = v.InferOutput<typeof CategoryLinkSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.categories.*` factory entries.
// `detail(slug)` is intentionally omitted — zero call sites, see header.

const keys = {
  all: () => ["categories"] as const,
  products: (slug: string, params?: NormalizedListParams) =>
    ["categories", slug, "products", params] as const,
  newArrivals: (idOrSlug: string) =>
    ["categories", "newArrivals", idOrSlug] as const,
};

// ─── List-param normalization ─────────────────────────────────────────────
//
// Identical pattern to orders.ts / products.ts. Caller-side parameter
// divergence ({ sortBy: "newest", take: 10 } vs { take: 10, sortBy: "newest" })
// would silently produce different cache keys via object identity.

export type CategoriesProductsParams = Record<
  string,
  string | number | boolean | null | undefined
>;
type NormalizedListParams = Record<string, string | number | boolean>;

function normalizeListParams(
  params: CategoriesProductsParams | undefined,
): NormalizedListParams | undefined {
  if (!params) return undefined;
  const cleaned: NormalizedListParams = {};
  for (const k of Object.keys(params).sort()) {
    const value = params[k];
    if (value === undefined || value === null) continue;
    cleaned[k] = value;
  }
  return Object.keys(cleaned).length === 0 ? undefined : cleaned;
}

// ─── Constants ────────────────────────────────────────────────────────────

const CATEGORY_PRODUCTS_PAGE_SIZE = PAGE_SIZES.PRODUCTS;
const CAROUSEL_LIMIT = PAGE_SIZES.CAROUSEL;

/**
 * Cache-freshness for category new-arrivals queries. The legacy call site
 * in `category/[slug].tsx` carried `staleTime: 5 * 60_000`. Baked in
 * per §F.12 — freshness is a property of the data + key.
 */
const NEW_ARRIVALS_STALE_TIME_MS = 5 * 60_000;

// ─── Internal queryFns (the single write path) ──────────────────────────

/**
 * Defensive envelope flattening — same helper pattern as products.ts.
 * `/products/public` returns bare arrays and `{ products: [...] }` envelopes.
 */
function extractProducts(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

/**
 * Fetch the flat list of all categories. Delegates to the existing
 * `fetchCategoriesClient` from `lib/categories.ts` which handles locale
 * headers, error recovery (returns `[]`), and client-side filtering/sorting.
 * Schema validation is layered on top as the write-gate.
 *
 * Bare-array canonical shape per §F.11.
 */
async function fetchCategoriesAll(): Promise<CategoryLink[]> {
  const raw = await fetchCategoriesClient();
  return parseOrThrow(v.array(CategoryLinkSchema), raw, keys.all());
}

/**
 * Fetch a page of products filtered by category slug. Uses raw `fetch` +
 * `NetworkError` semantics matching the legacy call site in
 * `category/[slug].tsx`. Non-2xx → empty array (same as products.ts).
 *
 * The `take` and `skip=0` are baked into the URL (not the cache key) —
 * the "load more" pagination lives outside TanStack Query in imperative
 * state, matching the legacy pattern. The cache key is
 * `["categories", slug, "products", { sortBy }]`.
 */
async function fetchCategoryProducts(
  slug: string,
  params: NormalizedListParams | undefined,
): Promise<PublicProduct[]> {
  const queryParts: string[] = [
    `take=${CATEGORY_PRODUCTS_PAGE_SIZE}`,
    `skip=0`,
    `categorySlug=${encodeURIComponent(slug)}`,
  ];
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      queryParts.push(
        `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`,
      );
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/products/public?${queryParts.join("&")}`);
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) return [];
  const raw = await res.json();
  const list = extractProducts(raw);
  return filterValidItems(PublicProductSchema, list, keys.products(slug, params));
}

/**
 * Fetch new arrivals for a category. Uses raw `fetch` + `NetworkError`
 * semantics matching the legacy call site. Defensive URL encoding on
 * slug per §F.3.
 */
async function fetchCategoryNewArrivals(
  slugOrId: string,
): Promise<PublicProduct[]> {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/products/public?categorySlug=${encodeURIComponent(slugOrId)}&sortBy=newest&take=${CAROUSEL_LIMIT}`,
    );
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) return [];
  const raw = await res.json();
  const list = extractProducts(raw);
  return filterValidItems(PublicProductSchema, list, keys.newArrivals(slugOrId));
}

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Public read hooks (the only legal read path for categories) ────────

/**
 * Read the flat list of all categories. Returns the canonical,
 * schema-validated bare array `CategoryLink[]`.
 *
 * Cache key: `['categories']` — byte-identical to the legacy
 * `queryKeys.categories.all()`.
 */
export function useCategoriesAll(
  options?: QueryOpts,
): UseQueryResult<CategoryLink[], Error> {
  return useQuery({
    queryKey: keys.all(),
    queryFn: fetchCategoriesAll,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read a page of products filtered by category slug. Returns the
 * canonical, schema-validated bare array `PublicProduct[]`.
 *
 * `params` is normalized before key construction so any two callers
 * requesting the same list share the same cache entry.
 *
 * Cache key: `['categories', slug, 'products', normalizedParams]` —
 * byte-identical to the legacy `queryKeys.categories.products(slug, params)`.
 */
export function useCategoryProducts(
  slug: string | undefined,
  params?: CategoriesProductsParams,
  options?: QueryOpts,
): UseQueryResult<PublicProduct[], Error> {
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: keys.products(slug ?? "__none__", normalized),
    queryFn: () => fetchCategoryProducts(slug!, normalized),
    enabled: (options?.enabled ?? true) && !!slug,
  });
}

/**
 * Read new arrivals for a category. Returns the canonical,
 * schema-validated bare array `PublicProduct[]`.
 *
 * `staleTime` is baked in at `NEW_ARRIVALS_STALE_TIME_MS` per §F.12.
 *
 * Cache key: `['categories', 'newArrivals', slugOrId]` — byte-identical
 * to the legacy `queryKeys.categories.newArrivals(slugOrId)`.
 */
export function useCategoryNewArrivals(
  slugOrId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<PublicProduct[], Error> {
  return useQuery({
    queryKey: keys.newArrivals(slugOrId ?? "__none__"),
    queryFn: () => fetchCategoryNewArrivals(slugOrId!),
    staleTime: NEW_ARRIVALS_STALE_TIME_MS,
    enabled: (options?.enabled ?? true) && !!slugOrId,
  });
}

// ─── Invalidation ────────────────────────────────────────────────────────

export const invalidateCategories = {
  products: (slug: string) =>
    getQueryClient().invalidateQueries({
      queryKey: ["categories", slug, "products"],
    }),

  newArrivals: (slugOrId: string) =>
    getQueryClient().invalidateQueries({
      queryKey: keys.newArrivals(slugOrId),
    }),

  all: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;

void NetworkError;
