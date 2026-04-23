/**
 * Orders domain — sealed query layer.
 *
 * This module is the single owner of the 'orders' query keys. Every read,
 * write, and invalidation for orders MUST flow through one of the typed hooks
 * (or the `invalidate.orders.*` namespace) exported here. The rest of the app
 * does not know the orders keys exist.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §2
 * (architecture), and §3.2 (orders migration choreography).
 *
 * Migration status (Step A): typed read hooks + schemas added. Zero callers
 * migrated. Existing `useQuery({ queryKey: queryKeys.orders.* })` call sites
 * continue to function; they share the cache entry with this module via Rule A
 * (same byte-identical keys). The outlier (`support/message-seller/[orderId].tsx`)
 * is migrated next per Rule B.
 */

import * as v from "valibot";

import { customerFetch } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// Mirror the existing TypeScript shapes in lib/types.ts (Order, OrderItem) as
// faithfully as the runtime allows.
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
//
// In Valibot v1, `v.object` STRIPS unknown keys from the parsed output. That
// would silently delete any backend field we haven't enumerated here, which
// would change behavior for every caller that reads a non-canonical field
// (e.g. `item.id`, `item.unitPriceCents`, `shipment.carrierService`,
// `productVariant.publicProductId`, etc.). The whole point of this migration
// is to fix structural correctness without changing behavior, so we use
// `v.looseObject` to preserve every key the backend sends.
//
// What the schema enforces, then, is the LOWER BOUND of the canonical
// contract: "if it's in the cache, at minimum these fields exist with these
// shapes." Backend additions pass through harmlessly. Callers that read
// fields outside this lower bound are still on their own for typing those
// fields, exactly as they were before this layer existed.
//
// Nullable + optional everywhere because the legacy `lib/types.ts` types are
// equally permissive (every field is `?` and most are `| null`) — see
// plan §3.2 "schema-as-contract" rule.

const NullishString = v.optional(v.nullable(v.string()));
const NullishNumber = v.optional(v.nullable(v.number()));
const NullishStringOrNumber = v.optional(
  v.nullable(v.union([v.string(), v.number()])),
);

const ShipmentSchema = v.looseObject({
  publicId: NullishString,
  direction: NullishString,
  status: NullishString,
  carrier: NullishString,
  trackingNumber: NullishString,
  trackingUrl: NullishString,
  shippedAt: NullishString,
  estimatedDelivery: NullishString,
  deliveredAt: NullishString,
  signedBy: NullishString,
});

const OrderItemSchema = v.looseObject({
  publicId: NullishString,
  quantity: NullishNumber,

  unitPrice: NullishStringOrNumber,
  currency: NullishString,

  title: NullishString,
  name: NullishString,
  image: NullishString,
  imageUrl: NullishString,

  status: NullishString,
  cancelledAt: NullishString,

  productVariant: v.optional(
    v.nullable(
      v.looseObject({
        publicId: NullishString,
        title: NullishString,
        sku: NullishString,
        imageUrl: NullishString,
        images: v.optional(
          v.nullable(
            v.array(
              v.looseObject({
                key: NullishString,
                url: NullishString,
              }),
            ),
          ),
        ),
        product: v.optional(
          v.nullable(
            v.looseObject({
              title: NullishString,
              name: NullishString,
              productId: NullishString,
              slug: NullishString,
              imageUrl: NullishString,
              image: NullishString,
              images: v.optional(
                v.nullable(
                  v.array(
                    v.looseObject({
                      key: NullishString,
                      url: NullishString,
                    }),
                  ),
                ),
              ),
            }),
          ),
        ),
      }),
    ),
  ),

  vendor: v.optional(
    v.nullable(
      v.looseObject({
        name: NullishString,
        publicId: NullishString,
        slug: NullishString,
      }),
    ),
  ),
  vendorName: NullishString,

  caseItems: v.optional(
    v.nullable(
      v.array(
        v.looseObject({
          caseNumber: v.string(),
          case: v.optional(
            v.nullable(
              v.looseObject({
                resolutionFinal: NullishString,
              }),
            ),
          ),
        }),
      ),
    ),
  ),
  shipmentItems: v.optional(
    v.nullable(
      v.array(
        v.looseObject({
          shipment: v.optional(v.nullable(ShipmentSchema)),
        }),
      ),
    ),
  ),

  quantityReturned: v.optional(v.number()),
  quantityCancelled: v.optional(v.number()),
});

const OrderCaseSchema = v.looseObject({
  caseNumber: v.string(),
  status: v.string(),
  resolutionIntent: NullishString,
  createdAt: v.string(),
  items: v.optional(
    v.nullable(
      v.array(
        v.looseObject({
          reasonCode: v.optional(v.string()),
        }),
      ),
    ),
  ),
});

const OrderSchema = v.looseObject({
  publicId: NullishString,
  orderNumber: NullishString,
  status: v.string(),
  totalAmount: NullishStringOrNumber,
  currency: NullishString,
  createdAt: v.string(),
  paidAt: NullishString,
  items: v.optional(v.nullable(v.array(OrderItemSchema))),

  subtotalAmount: NullishStringOrNumber,
  shippingAmount: NullishStringOrNumber,
  taxAmount: NullishStringOrNumber,
  discountAmount: NullishStringOrNumber,

  paymentStatus: NullishString,
  paymentMethodType: NullishString,
  cardBrand: NullishString,
  cardLast4: NullishString,

  paymentMethod: v.optional(
    v.nullable(
      v.looseObject({
        type: NullishString,
        brand: NullishString,
        last4: NullishString,
      }),
    ),
  ),

  shippingAddress: v.optional(
    v.nullable(
      v.looseObject({
        fullName: NullishString,
        firstName: NullishString,
        lastName: NullishString,
        line1: NullishString,
        line2: NullishString,
        city: NullishString,
        state: NullishString,
        postalCode: NullishString,
        country: NullishString,
      }),
    ),
  ),

  cases: v.optional(v.nullable(v.array(OrderCaseSchema))),
  customerOrderCases: v.optional(v.nullable(v.array(OrderCaseSchema))),
});

// ─── Paginated list envelope ─────────────────────────────────────────────
//
// The /orders endpoint returns a cursor-paginated envelope, NOT a bare array.
// Earlier iterations of this module canonicalised it down to `Order[]`, which
// silently erased `nextCursor` and `hasMore` — fields the orders screen needs
// to drive its load-more pagination. The corrected canonical shape preserves
// the envelope so that the contract this layer enforces matches the contract
// the backend actually serves.
//
// Rule of thumb for future paginated domains (products, recommendations,
// videos, search, etc.):
//   - Paginated endpoints → envelope schema (data + cursor + flag).
//   - Non-paginated endpoints → bare-shape schema (object or array directly).
// Flat-array canonicalisation is appropriate ONLY for endpoints that have no
// cursor/page metadata to begin with. When in doubt, model the envelope —
// `v.looseObject` lets future fields pass through harmlessly anyway.
//
// `hasMore` is required (not optional) by deliberate choice: every observed
// response from `/orders` includes it, and we want parseOrThrow to surface
// any future regression instead of papering over it. `nextCursor` is
// nullable+optional because the final page legitimately omits it / sets it
// null.
const OrdersListResponseSchema = v.looseObject({
  data: v.array(OrderSchema),
  nextCursor: NullishString,
  hasMore: v.boolean(),
});

// ─── Inferred canonical types ────────────────────────────────────────────
//
// These are the types app code receives from the typed hooks. They are
// structurally compatible with the legacy `Order` / `OrderItem` types in
// lib/types.ts — once the migration retires the legacy types, callers will
// import these from '@/lib/queries' instead. Until then, both type aliases
// describe the same runtime shape.

export type Order = v.InferOutput<typeof OrderSchema>;
export type OrderItem = v.InferOutput<typeof OrderItemSchema>;
export type OrdersListResponse = v.InferOutput<typeof OrdersListResponseSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.orders.*` factory entries. Keeping
// the same keys means the legacy `useQuery` callers and the new typed hooks
// share the cache entry during the migration window — see plan §3.1 Rule A.

const keys = {
  all: () => ["orders"] as const,
  list: (params?: NormalizedListParams) =>
    ["orders", "list", params] as const,
  detail: (id: string) => ["orders", "detail", String(id)] as const,
};

// ─── List-param normalization ─────────────────────────────────────────────
//
// Caller-side parameter divergence ({ limit: 50 } vs {} vs undefined vs
// { limit: 50, offset: undefined }) would silently produce different cache
// keys and defeat the whole point of the sealed layer. We normalize at the
// hook boundary so it is structurally impossible for two callers to write
// to "the orders list" and end up with separate cache entries.
//
// Rules:
//   - undefined or null entries are dropped
//   - empty object after cleanup → undefined (matches the no-params caller)
//   - keys are sorted alphabetically (object identity does not affect key)

export type OrdersListParams = Record<string, string | number | boolean | null | undefined>;
type NormalizedListParams = Record<string, string | number | boolean>;

function normalizeListParams(
  params: OrdersListParams | undefined,
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

// ─── Internal queryFns (the single write path) ──────────────────────────
//
// Every cache-write for orders flows through these functions. They:
//   1. fetch the raw response,
//   2. normalize either-or envelope shapes (bare order vs `{ order }` envelope;
//      bare array vs `{ data, pagination }` envelope) once at write time,
//   3. validate against the canonical schema (parseOrThrow self-heals on
//      mismatch by evicting the cache entry and re-throwing),
//   4. return the canonical shape.

async function fetchOrderDetail(id: string): Promise<Order> {
  // Defensive URL encoding: a no-op for normal public IDs (ULIDs/UUIDs), but
  // correct for any id containing reserved URL characters. Matches the
  // pre-migration behavior of `app/order-complete.tsx` (the only legacy
  // caller that bothered to encode) and harmlessly upgrades the other six.
  const raw = await customerFetch<unknown>(
    `/orders/by-public-id/${encodeURIComponent(id)}`,
  );

  // Normalize once: backend may return either the bare order or `{ order }`.
  // The outlier (`support/message-seller/[orderId].tsx`) was the only caller
  // that did this unwrapping today; centralising it here means every consumer
  // gets the same canonical shape regardless of envelope policy drift.
  const candidate =
    raw && typeof raw === "object" && "order" in raw
      ? (raw as { order: unknown }).order
      : raw;

  return parseOrThrow(OrderSchema, candidate, keys.detail(id));
}

async function fetchOrdersList(
  params: NormalizedListParams | undefined,
): Promise<OrdersListResponse> {
  // Mirror the existing list-call URL exactly so the cache shares with legacy
  // callers during the migration window. `app/orders/index.tsx` uses
  // `/orders?limit=50` — the limit is appended automatically by customerFetch
  // when `limit=` is missing from the URL, so a bare `/orders` is equivalent.
  // Params arrive already normalized (sorted keys, no nullish entries) so the
  // querystring is deterministic for any given key.
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join("&")
    : "";
  const raw = await customerFetch<unknown>(`/orders${qs}`);

  // Validate the envelope as-is. We deliberately do NOT collapse a bare-array
  // response into the envelope shape: the `/orders` endpoint contractually
  // returns `{ data, nextCursor, hasMore }`, and any drift from that contract
  // (a deploy that ships a bare array, a backend rewrite that drops cursor
  // metadata, etc.) is a real bug we want surfaced loudly via parseOrThrow's
  // self-heal — not papered over with synthetic pagination defaults that
  // would silently disable the load-more UI.
  return parseOrThrow(OrdersListResponseSchema, raw, keys.list(params));
}

// ─── Public read hooks (the only legal read path for orders) ────────────

/**
 * Read a single order by public id. Returns the canonical, schema-validated
 * `Order` shape. The hook is enabled only when `id` is truthy — passing
 * `undefined` returns `{ data: undefined, isLoading: false }` without firing
 * a request.
 *
 * Cache key: `['orders', 'detail', String(id)]` — byte-identical to the
 * legacy `queryKeys.orders.detail(id)`. During migration the cache entry is
 * shared with not-yet-migrated callers (plan §3.1 Rule A).
 */
export function useOrderDetail(
  id: string | undefined,
): UseQueryResult<Order, Error> {
  return useQuery({
    queryKey: keys.detail(id ?? "__none__"),
    queryFn: () => fetchOrderDetail(id!),
    enabled: !!id,
  });
}

/**
 * Read the customer's order list. Returns the canonical, schema-validated
 * paginated envelope `{ data, nextCursor, hasMore }`.
 *
 * The envelope (not a bare array) is the canonical shape because the backend
 * endpoint is cursor-paginated. Callers that need only the items can read
 * `.data`; callers driving load-more UI read `.nextCursor` and `.hasMore`
 * directly off the typed result.
 *
 * `params` is normalized inside the hook before key construction so any two
 * call sites that semantically request "the same list" share the same cache
 * entry (regardless of object identity, key order, or undefined slots).
 *
 * `options.enabled` gates execution timing only — it does NOT vary the
 * fetcher, the endpoint, or the cache shape. The invariant
 *   `one key → one fetcher → one schema`
 * is preserved across every caller (plan §0).
 *
 * Cache key: `['orders', 'list', normalizedParams]` — byte-identical to the
 * legacy `queryKeys.orders.list()` when no params are supplied.
 */
export function useOrdersList(
  params?: OrdersListParams,
  options?: { enabled?: boolean },
): UseQueryResult<OrdersListResponse, Error> {
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: keys.list(normalized),
    queryFn: () => fetchOrdersList(normalized),
    enabled: options?.enabled ?? true,
  });
}

// ─── Invalidation (the only legal write surface for orders) ──────────────
//
// Mutations elsewhere in the app must mark orders cache entries stale via
// these helpers — never via direct `queryClient.invalidateQueries({ queryKey:
// queryKeys.orders.* })` calls. Centralising here keeps every cache write
// surface (refetch trigger, optimistic update, manual setQueryData) inside
// the single-writer module that owns the schema.
//
// Note: `invalidateQueries` is a SAFE write surface (it just marks entries
// stale and triggers a refetch through `queryFn` — which is itself defended
// by `parseOrThrow`). The dangerous write surfaces (`setQueryData`,
// `client.fetchQuery` with raw queryFn) are intentionally NOT exposed here;
// if a caller ever needs them, they must be added as named, schema-validated
// helpers in this file — never executed inline.
export const invalidateOrders = {
  /** Invalidate a single order's detail cache entry. */
  detail: (id: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.detail(id) }),

  /**
   * Invalidate every cached orders list (regardless of params). Uses prefix
   * matching: any key starting with ['orders', 'list'] is marked stale.
   */
  list: () =>
    getQueryClient().invalidateQueries({ queryKey: ["orders", "list"] }),

  /**
   * Nuclear option — invalidates every entry under ['orders', ...] (both
   * details and lists). Used by mutations whose effect spans multiple cache
   * entries (e.g. order item cancellation, where the source order detail and
   * the orders list both need to refetch).
   */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
