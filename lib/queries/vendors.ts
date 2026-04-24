/**
 * Vendors domain — sealed query layer.
 *
 * Single owner of every cache entry under the "vendors" key tuple.
 * App code reaches the vendors cache exclusively through the typed
 * read hooks (or `invalidate.vendors.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule),
 * §3.1 (per-domain choreography), and
 * .cursor/handoff-sealed-query-layer.md §E.5 (vendors inventory).
 *
 * Schema note: all object schemas use `v.looseObject`, NOT `v.object`.
 * See lib/queries/orders.ts for the long-form rationale shared across
 * every domain module.
 *
 * Outlier check: no shape divergence detected. Each key has at most
 * two call sites that share the same fetch path and response shape.
 * The PDP "More from vendor" carousel (product/[id].tsx) uses a
 * vendor-products key with different params from the vendor index page,
 * so they occupy distinct cache entries. No outlier; any caller can
 * be first.
 *
 * Key structure:
 *   vendors.detail(publicId)     → ["vendors", "detail", publicId]
 *   vendors.products(pubId, p)   → ["vendors", pubId, "products", p]
 *   vendors.reviews(publicId)    → ["vendors", pubId, "reviews"]
 *   vendors.reviewsSummary(pubId)→ ["vendors", pubId, "reviews", "summary"]
 *
 * The `reviews` key extends to `reviewsSummary` — the legacy code
 * used `[...queryKeys.vendors.reviews(id!), "summary"]` which is
 * byte-identical to `["vendors", id, "reviews", "summary"]`.
 */

import * as v from "valibot";

import { publicFetch } from "@/lib/api";
import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

import { getQueryClient } from "./_client";
import {
  useQuery,
  keepPreviousData,
  type UseQueryResult,
} from "./_internal/react-query";
import { parseOrThrow, filterValidItems } from "./_validate";
import { PublicProductSchema, type PublicProduct } from "./products";

// ─── Schemas ──────────────────────────────────────────────────────────────

const NullishString = v.optional(v.nullable(v.string()));

const VendorProfileSchema = v.looseObject({
  publicId: v.string(),
  name: v.string(),
  slug: NullishString,
  shortBio: NullishString,
  logoUrl: NullishString,
  locationCity: NullishString,
  locationState: NullishString,
  locationCountry: NullishString,
  createdAt: v.optional(v.string()),
});

const VendorReviewSchema = v.looseObject({
  publicId: v.string(),
  rating: v.number(),
  title: NullishString,
  body: NullishString,
  customerName: NullishString,
  createdAt: v.string(),
  product: v.optional(
    v.nullable(
      v.looseObject({
        title: NullishString,
      }),
    ),
  ),
});

const VendorReviewSummarySchema = v.looseObject({
  ratingAvg: v.number(),
  reviewCount: v.number(),
  distribution: v.record(v.string(), v.number()),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type VendorProfile = v.InferOutput<typeof VendorProfileSchema>;
export type VendorReview = v.InferOutput<typeof VendorReviewSchema>;
export type VendorReviewSummary = v.InferOutput<typeof VendorReviewSummarySchema>;

export type VendorProductsResponse = {
  products: PublicProduct[];
  totalCount: number | null;
};

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.vendors.*` factory entries.
// `reviewsSummary` is the extended key `[...vendors.reviews(id), "summary"]`.

const keys = {
  all: () => ["vendors"] as const,
  detail: (publicId: string) =>
    ["vendors", "detail", publicId] as const,
  products: (publicId: string, params?: NormalizedListParams) =>
    ["vendors", publicId, "products", params] as const,
  reviews: (publicId: string) =>
    ["vendors", publicId, "reviews"] as const,
  reviewsSummary: (publicId: string) =>
    ["vendors", publicId, "reviews", "summary"] as const,
};

// ─── List-param normalization ─────────────────────────────────────────────

export type VendorProductsParams = Record<
  string,
  string | number | boolean | null | undefined
>;
type NormalizedListParams = Record<string, string | number | boolean>;

function normalizeListParams(
  params: VendorProductsParams | undefined,
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

const VENDOR_PRODUCTS_PAGE_SIZE = PAGE_SIZES.PRODUCTS;
const VENDOR_MORE_STALE_TIME_MS = 5 * 60_000;
const VENDOR_MORE_FETCH_LIMIT = 11;
const VENDOR_MORE_DISPLAY_LIMIT = 10;

// ─── Internal queryFns (the single write path) ──────────────────────────

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

function extractTotalCount(raw: unknown): number | null {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.total === "number") return obj.total;
    if (typeof obj.totalCount === "number") return obj.totalCount;
  }
  return null;
}

async function fetchVendorDetail(publicId: string): Promise<VendorProfile> {
  const raw = await publicFetch<unknown>(
    `/public/vendors/by-public-id/${encodeURIComponent(publicId)}`,
  );
  return parseOrThrow(VendorProfileSchema, raw, keys.detail(publicId));
}

/**
 * Fetch vendor products. Returns an envelope with the normalised products
 * array and totalCount (from whichever envelope field the backend uses).
 * Uses `publicFetch` matching the legacy call site.
 *
 * The legacy cache key uses `{ sort }` but the URL param is `sortBy` —
 * this mapping is centralised here. `take` and `skip` are baked into the
 * URL (not the cache key), matching the legacy pattern where the initial
 * page is always `skip=0, take=PAGE_SIZE`.
 */
async function fetchVendorProducts(
  publicId: string,
  params: NormalizedListParams | undefined,
): Promise<VendorProductsResponse> {
  const sortBy = String(params?.sort ?? params?.sortBy ?? "newest");
  const raw = await publicFetch<unknown>(
    `/products/public?vendorPublicId=${encodeURIComponent(publicId)}&take=${VENDOR_PRODUCTS_PAGE_SIZE}&skip=0&sortBy=${encodeURIComponent(sortBy)}`,
  );
  const list = extractProducts(raw);
  const products = filterValidItems(PublicProductSchema, list, keys.products(publicId, params));
  return { products, totalCount: extractTotalCount(raw) };
}

/**
 * Fetch vendor products for the PDP "More from this vendor" carousel.
 * Fetches `VENDOR_MORE_FETCH_LIMIT` items, filters out the current
 * product, and caps at `VENDOR_MORE_DISPLAY_LIMIT`. The post-process
 * lives here (the single writer) per §F.14 / §F.16.
 */
async function fetchVendorMoreProducts(
  publicId: string,
  excludeProductId: string,
): Promise<PublicProduct[]> {
  const raw = await publicFetch<unknown>(
    `/products/public?vendorPublicId=${encodeURIComponent(publicId)}&take=${VENDOR_MORE_FETCH_LIMIT}&sortBy=newest`,
  );
  const list = extractProducts(raw);
  const products = filterValidItems(
    PublicProductSchema,
    list,
    keys.products(publicId, normalizeListParams({ take: VENDOR_MORE_FETCH_LIMIT, sortBy: "newest" })),
  );
  return products
    .filter((p) => p.productId !== excludeProductId)
    .slice(0, VENDOR_MORE_DISPLAY_LIMIT);
}

async function fetchVendorReviews(
  publicId: string,
  limit: number,
): Promise<{ reviews: VendorReview[]; nextCursor: string | null }> {
  const raw = await publicFetch<unknown>(
    `/public/vendors/by-public-id/${encodeURIComponent(publicId)}/reviews?limit=${limit}`,
  );
  const rawObj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = Array.isArray(rawObj.data)
    ? rawObj.data
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const reviews = parseOrThrow(
    v.array(VendorReviewSchema),
    list,
    keys.reviews(publicId),
  );
  const nextCursor =
    typeof rawObj.nextCursor === "string" ? rawObj.nextCursor : null;
  return { reviews, nextCursor };
}

async function fetchVendorReviewsSummary(
  publicId: string,
): Promise<VendorReviewSummary | null> {
  try {
    const raw = await publicFetch<unknown>(
      `/public/vendors/by-public-id/${encodeURIComponent(publicId)}/reviews/summary`,
    );
    return parseOrThrow(
      VendorReviewSummarySchema,
      raw,
      keys.reviewsSummary(publicId),
    );
  } catch {
    return null;
  }
}

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Public read hooks (the only legal read path for vendors) ───────────

const REVIEWS_PAGE_LIMIT = 20;

/**
 * Read a vendor profile by public ID. Returns the canonical,
 * schema-validated `VendorProfile`.
 *
 * Cache key: `['vendors', 'detail', publicId]` — byte-identical
 * to the legacy `queryKeys.vendors.detail(publicId)`.
 */
export function useVendorDetail(
  publicId: string | undefined,
): UseQueryResult<VendorProfile, Error> {
  return useQuery({
    queryKey: keys.detail(publicId ?? "__none__"),
    queryFn: () => fetchVendorDetail(publicId!),
    enabled: !!publicId,
  });
}

/**
 * Read vendor products for the grid page. Returns an envelope with the
 * normalised products array and totalCount.
 *
 * `placeholderData: keepPreviousData` is baked in — the vendor index
 * page uses sort transitions where the old data stays visible while
 * the new sort loads (legacy `keepPreviousData` behaviour).
 *
 * Cache key: `['vendors', publicId, 'products', normalizedParams]` —
 * byte-identical to legacy `queryKeys.vendors.products(publicId, params)`.
 */
export function useVendorProducts(
  publicId: string | undefined,
  params?: VendorProductsParams,
  options?: QueryOpts,
): UseQueryResult<VendorProductsResponse, Error> {
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: keys.products(publicId ?? "__none__", normalized),
    queryFn: () => fetchVendorProducts(publicId!, normalized),
    enabled: (options?.enabled ?? true) && !!publicId,
    placeholderData: keepPreviousData,
  });
}

/**
 * Read vendor products for the PDP "More from this vendor" carousel.
 * Fetches slightly more items than needed, filters out the current
 * product, and caps at `VENDOR_MORE_DISPLAY_LIMIT`. The filter + slice
 * live inside the fetcher (single writer, §F.14/§F.16) so the cache
 * stores exactly the canonical shape callers will read.
 *
 * `staleTime` baked in at `VENDOR_MORE_STALE_TIME_MS` per §F.12.
 *
 * Cache key: `['vendors', publicId, 'products', { sortBy: "newest", take: 11 }]`.
 */
export function useVendorMoreProducts(
  publicId: string | undefined,
  excludeProductId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<PublicProduct[], Error> {
  return useQuery({
    queryKey: keys.products(
      publicId ?? "__none__",
      normalizeListParams({ take: VENDOR_MORE_FETCH_LIMIT, sortBy: "newest" }),
    ),
    queryFn: () => fetchVendorMoreProducts(publicId!, excludeProductId!),
    staleTime: VENDOR_MORE_STALE_TIME_MS,
    enabled: (options?.enabled ?? true) && !!publicId && !!excludeProductId,
  });
}

/**
 * Read vendor reviews. Returns the canonical envelope
 * `{ reviews, nextCursor }` — paginated per §F.9.
 *
 * Cache key: `['vendors', publicId, 'reviews']` — byte-identical
 * to the legacy `queryKeys.vendors.reviews(publicId)`.
 */
export function useVendorReviews(
  publicId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<{ reviews: VendorReview[]; nextCursor: string | null }, Error> {
  return useQuery({
    queryKey: keys.reviews(publicId ?? "__none__"),
    queryFn: () => fetchVendorReviews(publicId!, REVIEWS_PAGE_LIMIT),
    enabled: (options?.enabled ?? true) && !!publicId,
  });
}

/**
 * Read vendor review summary (avg rating + distribution). Returns
 * `VendorReviewSummary | null` — null on any fetch/parse failure
 * (matching the legacy `.catch(() => null)` pattern).
 *
 * Cache key: `['vendors', publicId, 'reviews', 'summary']` —
 * byte-identical to the legacy `[...queryKeys.vendors.reviews(id!), "summary"]`.
 */
export function useVendorReviewsSummary(
  publicId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<VendorReviewSummary | null, Error> {
  return useQuery({
    queryKey: keys.reviewsSummary(publicId ?? "__none__"),
    queryFn: () => fetchVendorReviewsSummary(publicId!),
    enabled: (options?.enabled ?? true) && !!publicId,
  });
}

// ─── Invalidation ────────────────────────────────────────────────────────

export const invalidateVendors = {
  detail: (publicId: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.detail(publicId) }),

  products: (publicId: string) =>
    getQueryClient().invalidateQueries({
      queryKey: ["vendors", publicId, "products"],
    }),

  reviews: (publicId: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.reviews(publicId) }),

  reviewsSummary: (publicId: string) =>
    getQueryClient().invalidateQueries({
      queryKey: keys.reviewsSummary(publicId),
    }),

  all: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
