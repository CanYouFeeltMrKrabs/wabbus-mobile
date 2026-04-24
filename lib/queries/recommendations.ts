/**
 * Recommendations domain — sealed query layer.
 *
 * Single owner of every cache entry under the literal "recommendations" key
 * tuple. App code reaches the recommendations cache exclusively through the
 * typed read hooks (or `invalidate.recommendations.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §3.1
 * (per-domain choreography), §4b (recommendations migration spec) and
 * `.cursor/handoff-sealed-query-layer.md` §E.3 for the per-call-site
 * inventory and the second known latent bug this migration closes.
 *
 * The latent bug being closed:
 *
 *   Two callers wrote to the same `recommendations.home()` cache key with
 *   different shapes AND different limits:
 *     - `app/(tabs)/(home)/index.tsx` cached the normalized
 *       `{ products, personalized }` shape with `take=PRODUCTS_HOME` (36).
 *     - `app/recommended.tsx` cached the RAW API envelope with `take=200`.
 *   Whichever screen mounted first decided both the shape AND the count for
 *   the other — surfacing as a crash on `data.products.map(...)` if the home
 *   screen read the raw envelope, or as a 36-item "Browse more" page if the
 *   recommended screen mounted second.
 *
 * The fix here applies BOTH halves of the closure:
 *
 *   1. Single canonical shape `{ products: PublicProduct[], personalized: boolean }`
 *      enforced via `parseOrThrow` at write time — the only legal cache shape
 *      for any home recommendations entry, regardless of which screen wrote it.
 *   2. `take` is part of the cache key (`["recommendations", "home", take]`),
 *      so the home slider (take=36) and the "browse more" page (take=200)
 *      occupy DISTINCT cache entries with the SAME schema.
 *
 *   Splitting by `take` deviates from the messages/orders Rule A "byte-
 *   identical legacy keys" pattern — but byte-identical sharing IS the bug
 *   for this domain. Closing it requires divergence from that rule, which
 *   plan §3.1 Rule B (outlier-first) explicitly authorises for the
 *   recommendations migration. The legacy `recommendations.home()` factory
 *   key (no take) is retired during Step I together with the rest of the
 *   recommendations block in `lib/queryKeys.ts`.
 *
 * Sub-namespaces (mirrors the legacy `queryKeys.recommendations.*` topology):
 *   - home              → `["recommendations", "home", take]`              `{products, personalized}`
 *   - strategy          → `["recommendations", "strategy", strategy]`     `PublicProduct[]`
 *   - trendingCategories→ `["recommendations", "strategy", "trending-categories"]` `Array<{name, slug}>`
 *                         (BYTE-IDENTICAL to the legacy strategy key — the
 *                         strategy() factory served two different shapes;
 *                         here we expose two distinct hooks against the same
 *                         tuple to clarify intent without breaking sharing.)
 *   - context           → `["recommendations", "context", contextType, contextId|null]`
 *                                                                          `PublicProduct[]`
 *   - product           → `["recommendations", "product", productId, type]` `PublicProduct[]`
 *   - postPurchase      → `["recommendations", "post_purchase", orderId]`  `PublicProduct[]`
 */

import * as v from "valibot";

import {
  customerFetch,
  publicFetch,
  FetchError,
  NetworkError,
} from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { PAGE_SIZE } from "@/lib/constants";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow, filterValidItems } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
// See lib/queries/orders.ts for the long-form rationale shared across
// every domain module.
//
// PublicProductSchema was originally co-located here (recommendations was
// the first domain that needed it). Now hoisted to lib/queries/products.ts
// as the canonical owner. Imported back here for use in recommendations
// fetchers and schema validation.

import {
  PublicProductSchema,
  PublicProductBadgeSchema,
  PreviewVideoMetaSchema,
} from "./products";

// `home` canonical shape. Both the home-screen carousel and the "browse
// more" page write this shape; their entries are distinguished only by the
// `take` axis baked into the cache key. See the file header for the full
// rationale.
const HomeRecommendationsSchema = v.looseObject({
  products: v.array(PublicProductSchema),
  personalized: v.boolean(),
});

// Trending categories — shape distinct from every other recommendations
// surface (no products, just `{name, slug}` rows). Today this lives under
// the same `recommendations.strategy(slug)` factory that everything else
// uses, but the discriminator value (`"trending-categories"`) keeps the
// cache tuple distinct, so there's no collision in practice — only an
// architectural awkwardness inherited from the legacy factory layout.
// We keep the byte-identical legacy key during the migration window
// (Rule A) and expose it via its own typed hook (`useTrendingCategories`)
// to clarify intent. See plan §F.11 (canonicalisation per endpoint).
const TrendingCategoryRowSchema = v.looseObject({
  name: v.string(),
  slug: v.string(),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type PublicProductReco = v.InferOutput<typeof PublicProductSchema>;
export type HomeRecommendations = v.InferOutput<
  typeof HomeRecommendationsSchema
>;
export type TrendingCategoryRow = v.InferOutput<
  typeof TrendingCategoryRowSchema
>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Most keys are byte-identical to the legacy `queryKeys.recommendations.*`
// factory — Rule A holds for every sub-namespace EXCEPT `home`, which is
// extended with a `take` axis to close the latent shape collision (see
// file header). Once the recommendations block is removed from
// `lib/queryKeys.ts` (Step I) the legacy `home()` tuple is fully retired.

const keys = {
  all: () => ["recommendations"] as const,
  /**
   * Home recommendations — `take` is part of the cache key so different
   * surfaces (home slider vs "browse more" page) occupy distinct entries
   * but share the canonical schema. Deliberately deviates from the legacy
   * `["recommendations", "home"]` shape for the bug-fix reason described
   * in the file header.
   */
  home: (take: number) => ["recommendations", "home", take] as const,
  /**
   * Strategy keys — byte-identical to legacy `recommendations.strategy(s)`.
   * Two distinct shapes share this factory tuple at the discriminator
   * level (PublicProduct[] for trending/new_arrivals/deals;
   * `{name, slug}[]` for "trending-categories"). Each shape has its own
   * typed hook; the cache tuples never collide because their discriminator
   * values differ.
   */
  strategy: (strategy: string) =>
    ["recommendations", "strategy", strategy] as const,
  context: (contextType: string, contextId?: string | number | null) =>
    [
      "recommendations",
      "context",
      contextType,
      contextId == null ? null : String(contextId),
    ] as const,
  product: (productId: string, type: string) =>
    ["recommendations", "product", productId, type] as const,
  postPurchase: (orderId: string) =>
    ["recommendations", "post_purchase", String(orderId)] as const,
  cart: (sortedIds: string) =>
    ["recommendations", "cart", sortedIds] as const,
};

// ─── Per-hook options ─────────────────────────────────────────────────────
//
// `enabled` is the only observer option exposed. Cache-policy options
// (`staleTime`, `gcTime`) are deliberately baked into individual hooks —
// freshness is a property of the data + key, not of the caller. See plan
// §F.12 and the `useCasesListFlat` worked example in messages.ts.

type QueryOpts = {
  enabled?: boolean;
};

/**
 * Cache-freshness policy for every recommendation surface served by the
 * sliders. Mirrors the legacy `staleTime: 5 * 60_000` baked into the
 * pre-refactor `ProductRecommendationSlider` queryFn — recommendations
 * change slowly enough that a 5-minute window is plenty fresh for UI
 * purposes and saves a network round-trip on every screen reopen.
 *
 * Hard-coded inside each slider-fed hook (NOT exposed via QueryOpts) per
 * §F.12. The home() and trendingCategories() reads are NOT gated by this
 * constant — they had no `staleTime` in legacy, so they keep the
 * QueryClient default to preserve behavior.
 */
const RECS_SLIDER_STALE_TIME_MS = 5 * 60_000;

// ─── Internal queryFns (the single write path) ──────────────────────────
//
// Every cache-write for recommendations flows through these functions.
// They:
//   1. fetch the raw response,
//   2. normalize either-or envelope shapes once at write time,
//   3. validate against the canonical schema (`parseOrThrow` self-heals
//      on mismatch by evicting the entry and re-throwing),
//   4. return the canonical shape.

/**
 * Best-effort PublicProduct[] extraction. The recos endpoints are inconsistent
 * between bare arrays and `{ products: [] }` envelopes; some surfaces (vendor
 * products, category-scoped lists) wrap in `{ data }` or `{ items }`. The
 * legacy `ProductRecommendationSlider`'s `defaultExtract` handled the first
 * two; the legacy `recommended.tsx`'s `normalizeProducts` also handled
 * `{ data }` and `{ items }`. We union both behaviors here so every
 * recommendations queryFn sees the same envelope-flattening rules.
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
 * Fetch-and-fallback strategy used by the home recommendations endpoint:
 * try the personalized recos endpoint first; if it fails (auth, transient,
 * etc.) fall back to a public products list of the same `take`. Mirrors
 * the union of the two legacy queryFns — both home/index.tsx and
 * recommended.tsx had the same fallback shape, just with different URLs.
 *
 * Returns the `{products, personalized}` canonical shape regardless of
 * which path served the data; the fallback always yields
 * `personalized: false`.
 */
async function fetchHomeRecommendations(
  take: number,
): Promise<HomeRecommendations> {
  let raw: unknown = null;
  try {
    raw = await customerFetch<unknown>(
      `/recommendations?context=home&take=${take}`,
    );
  } catch {
    // Fallback — public products endpoint (anonymous-safe). Uses raw
    // `fetch` because `publicFetch` would throw on non-2xx and we want
    // null on backend trouble (matches legacy recommended.tsx behavior).
    try {
      const res = await fetch(
        `${API_BASE}/products/public?take=${take}&skip=0`,
      );
      raw = res.ok ? await res.json() : null;
    } catch {
      raw = null;
    }
  }

  // Detect personalization flag BEFORE flattening (extractProducts
  // throws away the envelope); fall back to false on any non-object input.
  const personalized =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? !!(raw as { personalized?: unknown }).personalized
      : false;

  const rawProducts = extractProducts(raw);
  const products = filterValidItems(
    PublicProductSchema,
    rawProducts,
    keys.home(take),
  );

  return parseOrThrow(
    HomeRecommendationsSchema,
    { products, personalized },
    keys.home(take),
  );
}

/**
 * Fetch a strategy-tagged carousel (trending, new_arrivals, deals, ...).
 * Endpoint shape is consistent across strategies: `/recommendations?
 * context=home&strategy=${strategy}&take=10`. Returns PublicProduct[].
 *
 * NOTE: `trending-categories` is NOT served by this fetcher — that
 * strategy uses a different endpoint AND a different shape; see
 * `fetchTrendingCategories` below.
 */
async function fetchRecommendationsStrategy(
  strategy: string,
): Promise<PublicProductReco[]> {
  const raw = await publicFetch<unknown>(
    `/recommendations?context=home&strategy=${encodeURIComponent(
      strategy,
    )}&take=${PAGE_SIZE.CAROUSEL}`,
  );
  const list = extractProducts(raw);
  return filterValidItems(PublicProductSchema, list, keys.strategy(strategy));
}

/**
 * Fetch the trending-categories list. Distinct endpoint and distinct
 * shape from every other strategy key; see file header. Mirrors the
 * legacy queryFn in `app/(tabs)/(home)/index.tsx` exactly:
 *   - URL `/recommendations/trending-categories?limit=8&days=14`
 *   - response `{ categories: [...] }` OR bare array — flatten both
 *   - on transport failure return [] (legacy fetchJSON returns null,
 *     callers default to []; centralising the default here keeps the
 *     contract honest).
 */
async function fetchTrendingCategories(): Promise<TrendingCategoryRow[]> {
  let raw: unknown = null;
  try {
    const res = await fetch(
      `${API_BASE}/recommendations/trending-categories?limit=8&days=14`,
    );
    if (res.ok) raw = await res.json();
  } catch {
    raw = null;
  }
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as { categories?: unknown };
    if (Array.isArray(obj.categories)) list = obj.categories;
  }
  return parseOrThrow(
    v.array(TrendingCategoryRowSchema),
    list,
    keys.strategy("trending-categories"),
  );
}

/**
 * Fetch context-scoped personalized recos (e.g. category context). The
 * URL only carries `contextType` and `take` — `contextId` is part of the
 * cache key but not the query string, so the same backend payload is
 * fetched once per contextType and shared across every contextId of that
 * type. This is preserved verbatim from the legacy slider behavior per
 * §B.2 (the duplication-by-contextId is a UX-deliberate cache-isolation
 * pattern, not a bug — see queryKeys.ts comment on the legacy factory).
 */
async function fetchRecommendationsContext(
  contextType: string,
  contextId: string | number | null | undefined,
): Promise<PublicProductReco[]> {
  const raw = await publicFetch<unknown>(
    `/recommendations?context=${encodeURIComponent(
      contextType,
    )}&take=${PAGE_SIZE.CAROUSEL}`,
  );
  const list = extractProducts(raw);
  return filterValidItems(
    PublicProductSchema,
    list,
    keys.context(contextType, contextId),
  );
}

/**
 * Fetch product-context recos (frequently-bought-together, also-viewed,
 * similar). URL pattern centralised here so every consumer hits the same
 * endpoint shape regardless of the calling screen.
 */
async function fetchRecommendationsProduct(
  productId: string,
  type: string,
): Promise<PublicProductReco[]> {
  const raw = await publicFetch<unknown>(
    `/recommendations?context=product&productId=${encodeURIComponent(
      productId,
    )}&type=${encodeURIComponent(type)}&take=${PAGE_SIZE.CAROUSEL}`,
  );
  const list = extractProducts(raw);
  return filterValidItems(
    PublicProductSchema,
    list,
    keys.product(productId, type),
  );
}

/**
 * Fetch post-purchase recos for a completed order. URL embeds the order
 * id; cache key embeds it too so concurrent post-purchase pages for
 * different orders don't trample each other.
 */
async function fetchRecommendationsPostPurchase(
  orderId: string,
): Promise<PublicProductReco[]> {
  const raw = await customerFetch<unknown>(
    `/recommendations?context=post_purchase&orderId=${encodeURIComponent(
      orderId,
    )}&take=${PAGE_SIZE.CAROUSEL}`,
  );
  const list = extractProducts(raw);
  return filterValidItems(
    PublicProductSchema,
    list,
    keys.postPurchase(orderId),
  );
}

/**
 * Fetch cart-context recommendations. POST endpoint that accepts the
 * product IDs currently in the cart and returns related products.
 * The sorted+joined ID string is the cache key discriminator so adding/
 * removing a cart item busts the cache automatically.
 */
async function fetchRecommendationsCart(
  productIds: string[],
): Promise<PublicProductReco[]> {
  const sortedKey = [...productIds].sort().join(",");
  try {
    const res = await fetch(`${API_BASE}/recommendations/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productIds }),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    const list = extractProducts(raw);
    return filterValidItems(PublicProductSchema, list, keys.cart(sortedKey));
  } catch {
    return [];
  }
}

// ─── Public read hooks (the only legal read path for recommendations) ───

/**
 * Read the home recommendations envelope. Returns the canonical
 * `{products, personalized}` shape — both fields are always present (the
 * fetcher normalizes empty/error responses to `{products: [], personalized: false}`).
 *
 * `take` is part of the cache key so the home-screen slider (default
 * `PAGE_SIZE.PRODUCTS_HOME`) and the "browse more" page (`take=200`)
 * occupy distinct cache entries with the same schema. See the file
 * header for the full rationale (closes the latent shape collision).
 *
 * Cache key: `["recommendations", "home", take]`. NOTE: this deviates
 * from the legacy byte-identical `["recommendations", "home"]` tuple by
 * design (Rule B authorises divergence for outlier closure).
 */
export function useRecommendationsHome(
  take: number = PAGE_SIZE.PRODUCTS_HOME,
  options?: QueryOpts,
): UseQueryResult<HomeRecommendations, Error> {
  return useQuery({
    queryKey: keys.home(take),
    queryFn: () => fetchHomeRecommendations(take),
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read a strategy-tagged carousel (trending, new_arrivals, deals).
 * Returns `PublicProductReco[]` — bare array, no envelope.
 *
 * Cache key: `["recommendations", "strategy", strategy]` — byte-identical
 * to the legacy `queryKeys.recommendations.strategy(s)` tuple.
 *
 * NOT for `"trending-categories"` — that strategy uses a different
 * endpoint and shape; use `useTrendingCategories()` instead.
 */
export function useRecommendationsStrategy(
  strategy: string,
  options?: QueryOpts,
): UseQueryResult<PublicProductReco[], Error> {
  return useQuery({
    queryKey: keys.strategy(strategy),
    queryFn: () => fetchRecommendationsStrategy(strategy),
    staleTime: RECS_SLIDER_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read the trending-categories list. Distinct endpoint AND shape from
 * every other strategy hook; lives under the same legacy tuple
 * (`["recommendations", "strategy", "trending-categories"]`) for
 * byte-identical migration but is exposed via its own hook to make the
 * shape contract explicit.
 *
 * No `staleTime` baked in — preserves the legacy behavior (the home
 * screen's `useQuery` for trending-categories had no `staleTime`).
 */
export function useTrendingCategories(
  options?: QueryOpts,
): UseQueryResult<TrendingCategoryRow[], Error> {
  return useQuery({
    queryKey: keys.strategy("trending-categories"),
    queryFn: fetchTrendingCategories,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read context-scoped recos (e.g. category-context personalized
 * carousel). The URL only carries the `contextType` axis but the cache
 * key adds `contextId` so the same payload is cached per scope, matching
 * the legacy slider behavior verbatim per §B.2.
 *
 * Cache key: `["recommendations", "context", contextType, String(contextId)|null]`
 * — byte-identical to legacy.
 */
export function useRecommendationsContext(
  contextType: string,
  contextId?: string | number | null,
  options?: QueryOpts,
): UseQueryResult<PublicProductReco[], Error> {
  return useQuery({
    queryKey: keys.context(contextType, contextId),
    queryFn: () => fetchRecommendationsContext(contextType, contextId),
    staleTime: RECS_SLIDER_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Read product-context recos for a single PDP. Three observed `type`
 * values today: `"bought_together"`, `"viewed_together"`, `"similar"`.
 *
 * Cache key: `["recommendations", "product", productId, type]` —
 * byte-identical to legacy.
 */
export function useRecommendationsProduct(
  productId: string | undefined,
  type: string,
  options?: QueryOpts,
): UseQueryResult<PublicProductReco[], Error> {
  return useQuery({
    queryKey: keys.product(productId ?? "__none__", type),
    queryFn: () => fetchRecommendationsProduct(productId!, type),
    staleTime: RECS_SLIDER_STALE_TIME_MS,
    enabled: (options?.enabled ?? true) && !!productId,
  });
}

/**
 * Read post-purchase recos for a completed order. Auth-gated; each
 * orderId gets its own cache entry.
 *
 * Cache key: `["recommendations", "post_purchase", String(orderId)]` —
 * byte-identical to legacy.
 */
export function useRecommendationsPostPurchase(
  orderId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<PublicProductReco[], Error> {
  return useQuery({
    queryKey: keys.postPurchase(orderId ?? "__none__"),
    queryFn: () => fetchRecommendationsPostPurchase(orderId!),
    staleTime: RECS_SLIDER_STALE_TIME_MS,
    enabled: (options?.enabled ?? true) && !!orderId,
  });
}

/**
 * Read cart-context recommendations. The cache key includes a sorted,
 * comma-joined string of all product IDs in the cart so it auto-busts
 * when the cart changes. Disabled when the cart is empty.
 */
export function useRecommendationsCart(
  productIds: string[],
  options?: QueryOpts,
): UseQueryResult<PublicProductReco[], Error> {
  const sortedKey = [...productIds].sort().join(",");
  return useQuery({
    queryKey: keys.cart(sortedKey),
    queryFn: () => fetchRecommendationsCart(productIds),
    staleTime: RECS_SLIDER_STALE_TIME_MS,
    enabled: (options?.enabled ?? true) && productIds.length > 0,
  });
}

// ─── Invalidation (the only legal write surface for recommendations) ────
//
// Mutations elsewhere in the app must mark recommendations entries stale
// via these helpers — never via direct `queryClient.invalidateQueries({
// queryKey: queryKeys.recommendations.* })` calls. Centralising here
// keeps every cache write surface inside the single-writer module that
// owns the schema.
//
// Today no app code invalidates recommendations entries (recos are read-
// only, refreshed only by the 5-minute staleTime). The namespace is
// exported for future mutations (post-purchase tracking, vendor blocks,
// reco feedback, etc.) so they have a typed entry point from day one.

export const invalidateRecommendations = {
  /** Nuclear option — invalidates every entry under `["recommendations", ...]`. */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),

  /** Invalidate every home-recommendations entry (across all `take` values). */
  home: () =>
    getQueryClient().invalidateQueries({ queryKey: ["recommendations", "home"] }),

  /** Invalidate a single strategy carousel by its strategy slug. */
  strategy: (strategy: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.strategy(strategy) }),

  /** Invalidate the trending-categories list. */
  trendingCategories: () =>
    getQueryClient().invalidateQueries({
      queryKey: keys.strategy("trending-categories"),
    }),

  /** Invalidate every context-scoped entry (across all contextType/contextId). */
  context: () =>
    getQueryClient().invalidateQueries({
      queryKey: ["recommendations", "context"],
    }),

  /** Invalidate every product-context entry (across all productId/type). */
  product: () =>
    getQueryClient().invalidateQueries({
      queryKey: ["recommendations", "product"],
    }),

  /** Invalidate every post-purchase entry (across all orderId). */
  postPurchase: () =>
    getQueryClient().invalidateQueries({
      queryKey: ["recommendations", "post_purchase"],
    }),
} as const;

// Suppress unused-import warning until a fetcher needs the typed error
// classes (currently only used implicitly via try/catch). Keeping the
// imports here because the next iteration that adds Sentry tagging or
// fallback choreography will want them.
void FetchError;
void NetworkError;
