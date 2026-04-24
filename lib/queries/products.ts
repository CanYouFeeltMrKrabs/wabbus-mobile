/**
 * Products domain — sealed query layer.
 *
 * Single owner of every cache entry under the "products" key tuple.
 * App code reaches the products cache exclusively through the typed
 * read hooks (or `invalidate.products.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule),
 * §3.1 (per-domain choreography), and
 * .cursor/handoff-sealed-query-layer.md §E.5 (products inventory).
 *
 * Schema note: all object schemas use `v.looseObject`, NOT `v.object`.
 * See lib/queries/orders.ts for the long-form rationale shared across
 * every domain module.
 *
 * PublicProductSchema was originally co-located in
 * lib/queries/recommendations.ts (recommendations was the first domain
 * that needed it). It is now hoisted here as the canonical owner, and
 * recommendations.ts imports it back. See handoff §E.3 for the hoisting
 * marker.
 *
 * Outlier check: no shape divergence detected across callers. Every
 * products.list caller uses the same `/products/public?...` endpoint
 * with the same envelope shapes. Every products.detail caller uses
 * `/products/public/${id}/view` via `publicFetch`. No outlier; any
 * caller can be first.
 */

import * as v from "valibot";

import { publicFetch, NetworkError } from "@/lib/api";
import { API_BASE } from "@/lib/config";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow, filterValidItems } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
// Valibot's `v.object` STRIPS unknown keys from the parsed output, which
// would silently delete backend fields callers read off the canonical
// shape. See lib/queries/orders.ts for the long-form rationale.
//
// Schemas describe the LOWER BOUND of the canonical contract: "if it's in
// the cache, at minimum these fields exist with these shapes." Anything
// extra the backend sends passes through harmlessly.

const NullishString = v.optional(v.nullable(v.string()));
const NullishNumber = v.optional(v.nullable(v.number()));
const NullishStringOrNumber = v.optional(
  v.nullable(v.union([v.string(), v.number()])),
);

// ── PublicProduct (list endpoint /products/public) ────────────────────

export const PreviewVideoMetaSchema = v.looseObject({
  mp4Url: v.string(),
  posterUrl: v.nullable(v.string()),
  width: v.nullable(v.number()),
  height: v.nullable(v.number()),
  durationSec: v.nullable(v.number()),
});

export const PublicProductBadgeSchema = v.looseObject({
  type: v.string(),
  label: v.string(),
  value: v.optional(v.number()),
});

export const PublicProductSchema = v.looseObject({
  productId: v.string(),
  slug: v.string(),
  title: v.string(),
  description: v.nullable(v.string()),
  image: v.nullable(v.string()),
  price: v.number(),
  compareAtPrice: NullishNumber,
  defaultVariantPublicId: NullishString,
  ratingAvg: v.number(),
  reviewCount: v.number(),
  soldCount: v.optional(v.number()),
  vendorName: v.nullable(v.string()),
  categoryId: NullishNumber,
  badges: v.optional(v.array(PublicProductBadgeSchema)),
  previewVideo: v.optional(v.nullable(PreviewVideoMetaSchema)),
});

// ── ProductDetail (PDP endpoint /products/public/:id/view) ───────────

const ProductVariantSchema = v.looseObject({
  publicId: v.string(),
  sku: NullishString,
  title: NullishString,
  price: NullishStringOrNumber,
  compareAtPrice: NullishStringOrNumber,
  inventory: v.optional(
    v.nullable(
      v.looseObject({
        quantity: v.number(),
        reserved: v.number(),
      }),
    ),
  ),
  shippingPriceCents: NullishNumber,
  optionValues: v.optional(
    v.array(
      v.looseObject({
        optionValue: v.looseObject({
          id: v.number(),
          label: v.string(),
          option: v.looseObject({
            id: v.number(),
            name: v.string(),
            sortOrder: v.number(),
          }),
        }),
      }),
    ),
  ),
});

const ProductVideoSchema = v.looseObject({
  playback: v.optional(
    v.nullable(
      v.looseObject({
        mp4: NullishString,
      }),
    ),
  ),
  thumbnailUrl: NullishString,
  duration: NullishNumber,
  width: NullishNumber,
  height: NullishNumber,
});

const ProductDetailSchema = v.looseObject({
  productId: v.string(),
  slug: v.string(),
  title: v.string(),
  description: v.nullable(v.string()),
  image: v.optional(v.nullable(v.string())),
  images: v.optional(
    v.nullable(
      v.array(
        v.union([
          v.string(),
          v.looseObject({
            key: NullishString,
            optionGroupName: NullishString,
          }),
        ]),
      ),
    ),
  ),
  price: v.optional(v.nullable(v.number())),
  compareAtPrice: NullishNumber,
  defaultVariantPublicId: NullishString,
  ratingAvg: v.optional(v.number()),
  reviewCount: v.optional(v.number()),
  soldCount: v.optional(v.number()),
  vendorName: v.optional(v.nullable(v.string())),
  vendorPublicId: NullishString,
  categoryId: NullishNumber,
  badges: v.optional(v.array(PublicProductBadgeSchema)),
  keyFeatures: v.optional(v.nullable(v.array(v.string()))),
  shippingPriceCents: NullishNumber,
  variants: v.optional(v.array(ProductVariantSchema)),
  videos: v.optional(v.array(ProductVideoSchema)),
  brandName: NullishString,
  category: v.optional(
    v.nullable(
      v.looseObject({
        name: NullishString,
      }),
    ),
  ),
  condition: NullishString,
  upcGtin: NullishString,
  material: NullishString,
  careInstructions: NullishString,
  mpn: NullishString,
  countryOfOrigin: NullishString,
  weightOz: NullishNumber,
  lengthIn: NullishNumber,
  widthIn: NullishNumber,
  heightIn: NullishNumber,
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type PublicProduct = v.InferOutput<typeof PublicProductSchema>;
export type ProductDetail = v.InferOutput<typeof ProductDetailSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.products.*` factory entries.

const keys = {
  all: () => ["products"] as const,
  list: (params?: NormalizedListParams) =>
    ["products", "list", params] as const,
  detail: (id: string) => ["products", "detail", id] as const,
};

// ─── List-param normalization ─────────────────────────────────────────────
//
// Identical pattern to orders.ts. Caller-side parameter divergence
// ({ take: 10, sortBy: "newest" } vs { sortBy: "newest", take: 10 })
// would silently produce different cache keys via object identity.
// We normalize at the hook boundary so any two callers requesting the
// same list share the same cache entry.

export type ProductsListParams = Record<
  string,
  string | number | boolean | null | undefined
>;
type NormalizedListParams = Record<string, string | number | boolean>;

function normalizeListParams(
  params: ProductsListParams | undefined,
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

/**
 * Cache-freshness for products list queries. The majority of callers
 * (5/7 at migration time) were carousel-fed surfaces that carried
 * `staleTime: 5 * 60_000` from the legacy `ProductRecommendationSlider`.
 * The remaining 2 callers (home page grids) had no explicit staleTime;
 * 5 minutes is net-conservative (less refetching) and product lists
 * don't visibly change within that window.
 *
 * Baked in per §F.12 — freshness is a property of the data + key.
 */
const PRODUCTS_LIST_STALE_TIME_MS = 5 * 60_000;

// ─── Internal queryFns (the single write path) ──────────────────────────

/**
 * Defensive envelope flattening. The `/products/public` endpoint has been
 * observed returning bare arrays AND `{ products: [...] }` envelopes.
 * Legacy callers (`normalizeProducts`, `extractProducts` in recs) all
 * handled both shapes; centralising here per §F.14.
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

function buildQueryString(params: NormalizedListParams | undefined): string {
  if (!params) return "";
  return (
    "?" +
    Object.entries(params)
      .map(
        ([k, val]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`,
      )
      .join("&")
  );
}

/**
 * Fetch a public products list. Uses raw `fetch` + `NetworkError`
 * semantics matching the majority of legacy callers (home screen's
 * `fetchJSON`, search screen's raw fetch). Non-2xx responses yield an
 * empty array (the endpoint reached the server — retry won't help;
 * callers render their empty state).
 *
 * Bare-array canonical shape per §F.11 — no caller consumes pagination
 * metadata from `/products/public`, so the envelope is flattened.
 */
async function fetchProductsList(
  params: NormalizedListParams | undefined,
): Promise<PublicProduct[]> {
  const qs = buildQueryString(params);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/products/public${qs}`);
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) return [];
  const raw = await res.json();
  const list = extractProducts(raw);
  return filterValidItems(PublicProductSchema, list, keys.list(params));
}

/**
 * Fetch a single product detail by public id. Uses `publicFetch` (the
 * endpoint is public but benefits from the header/retry pipeline that
 * `publicFetch` provides). Defensive URL encoding per §F.3.
 */
async function fetchProductDetail(id: string): Promise<ProductDetail> {
  const raw = await publicFetch<unknown>(
    `/products/public/${encodeURIComponent(id)}/view`,
  );
  return parseOrThrow(ProductDetailSchema, raw, keys.detail(id));
}

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Public read hooks (the only legal read path for products) ──────────

/**
 * Read a public products list. Returns the canonical, schema-validated
 * bare array `PublicProduct[]`.
 *
 * `params` is normalized before key construction so any two callers
 * requesting the same list share the same cache entry regardless of
 * object identity or key order.
 *
 * `staleTime` is baked in at `PRODUCTS_LIST_STALE_TIME_MS` per §F.12.
 *
 * Cache key: `['products', 'list', normalizedParams]` — byte-identical
 * to the legacy `queryKeys.products.list(params)`.
 */
export function useProductsList(
  params?: ProductsListParams,
  options?: QueryOpts,
): UseQueryResult<PublicProduct[], Error> {
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: keys.list(normalized),
    queryFn: () => fetchProductsList(normalized),
    staleTime: PRODUCTS_LIST_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read a single product detail by id. Returns the canonical,
 * schema-validated `ProductDetail` shape. Enabled only when `id` is
 * truthy — passing `undefined` disables the query.
 *
 * Cache key: `['products', 'detail', id]` — byte-identical to the
 * legacy `queryKeys.products.detail(id)`.
 */
export function useProductDetail(
  id: string | undefined,
): UseQueryResult<ProductDetail, Error> {
  return useQuery({
    queryKey: keys.detail(id ?? "__none__"),
    queryFn: () => fetchProductDetail(id!),
    enabled: !!id,
  });
}

// ─── Invalidation ────────────────────────────────────────────────────────

export const invalidateProducts = {
  detail: (id: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.detail(id) }),

  list: () =>
    getQueryClient().invalidateQueries({ queryKey: ["products", "list"] }),

  all: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;

void NetworkError;
