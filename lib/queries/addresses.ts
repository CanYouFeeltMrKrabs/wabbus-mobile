/**
 * Addresses domain — sealed query layer.
 *
 * Single owner of every cache entry under the literal "addresses" key
 * tuple. App code reaches the addresses cache exclusively through the
 * typed read hook (or `invalidate.addresses.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §3.1
 * (per-domain choreography), §4 (long-tail domains) and
 * `.cursor/handoff-sealed-query-layer.md` §E.4 for the per-call-site
 * inventory.
 *
 * Sub-namespaces (mirrors the legacy `queryKeys.addresses.*` topology):
 *   - all  → `["addresses"]`            (invalidation prefix only)
 *   - list → `["addresses", "list"]`    `Address[]` (bare array)
 *
 * Outlier handling:
 *   The legacy `app/account/addresses.tsx` queryFn ran a 3-endpoint
 *   fallback chain (`/customer-addresses` → `/addresses` →
 *   `/customer-auth/me.addresses`) wrapped in defensive AuthError + 404
 *   handling, then funneled the response through a `normalizeAddressList`
 *   helper that accepted bare arrays, `{addresses: []}`, and `{data: []}`
 *   envelopes. There is exactly one queryFn writer for this key in the
 *   whole codebase (cross-checked against `lib/useCheckout.ts`, which
 *   reads `/customer-addresses` directly via `customerFetch` but does NOT
 *   write to the cache); so the outlier IS the canonical writer. The
 *   entire fallback choreography is preserved verbatim inside
 *   `fetchAddressesList` per §F.14 (centralise outliers inside the
 *   fetcher, never at the call site).
 */

import * as v from "valibot";

import { customerFetch, FetchError, AuthError } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
// Valibot's `v.object` STRIPS unknown keys from the parsed output, which
// would silently delete backend fields callers read off the canonical
// shape. The whole point of this migration is to fix structural
// correctness without changing observable shape. See `lib/queries/orders.ts`
// for the long-form rationale shared across every domain module.
//
// Schemas describe the LOWER BOUND of the canonical contract: "if it's in
// the cache, at minimum these fields exist with these shapes." Anything
// extra the backend sends passes through harmlessly.

const NullishString = v.optional(v.nullable(v.string()));
const OptionalString = v.optional(v.string());

// Mirror of `lib/types.ts:Address`. Kept loose because the
// `/customer-addresses` endpoint is generous with the shape — `zip` and
// `postalCode` are interchangeable backwards-compat fields, `phone` and
// `label` are optional, and the backend sometimes ships `id` as a number
// alongside `publicId`. When the long-tail domains finish migrating we'll
// converge `lib/types.ts:Address` onto this inferred shape.
const AddressSchema = v.looseObject({
  id: v.optional(v.number()),
  publicId: v.string(),
  label: NullishString,
  fullName: v.string(),
  line1: v.string(),
  line2: OptionalString,
  city: v.string(),
  state: v.string(),
  zip: v.optional(v.string()),
  postalCode: OptionalString,
  country: v.string(),
  phone: OptionalString,
  isDefault: v.boolean(),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type Address = v.InferOutput<typeof AddressSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.addresses.*` factory entries.
// Keeping the same keys means the legacy `useQuery` callers and the new
// typed hook share the cache entry during the migration window — see
// plan §3.1 Rule A. Once the addresses block is removed from
// `lib/queryKeys.ts` (Step I) this module is the sole owner.

const keys = {
  all: () => ["addresses"] as const,
  list: () => ["addresses", "list"] as const,
};

// ─── Per-hook options ─────────────────────────────────────────────────────
//
// `enabled` is the only observer option exposed today — addresses has no
// polling consumers. Cache-policy options (`staleTime`, `gcTime`) are
// deliberately baked into individual hooks per §F.12 — freshness is a
// property of the data + key, not of the caller.

type QueryOpts = {
  enabled?: boolean;
};

// ─── Internal queryFns (the single write path) ──────────────────────────
//
// Every cache-write for addresses flows through this function. It:
//   1. tries the primary endpoint, with defensive Auth + 404 handling,
//   2. falls back to the legacy `/addresses` endpoint on miss,
//   3. last-resorts to extracting `addresses` off `/customer-auth/me`,
//   4. flattens whichever envelope the backend returned (bare array,
//      `{addresses: []}`, or `{data: []}`),
//   5. validates against the canonical schema (parseOrThrow self-heals
//      on mismatch by evicting the entry and re-throwing).
//
// The fallback chain is preserved verbatim from the legacy queryFn in
// `app/account/addresses.tsx` per §B.2. The legacy stopped descending
// the fallback as soon as ONE endpoint returned a non-empty list; we
// mirror that — an empty list from `/customer-addresses` advances to
// `/addresses` so the user sees their addresses even if the primary
// endpoint silently returns `[]` against an account that has them.

/**
 * Best-effort Address[] extraction. Mirrors the legacy
 * `normalizeAddressList` helper — accepts bare arrays,
 * `{addresses: []}`, and `{data: []}` envelopes. Anything else returns [].
 */
function extractAddresses(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.addresses)) return obj.addresses;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
}

async function fetchAddressesList(): Promise<Address[]> {
  // Primary endpoint. AuthError must propagate so the auto-refresh
  // pipeline + RequireAuth boundary react. FetchError 404 is treated as
  // "endpoint not available on this backend" and we try the next one.
  try {
    const data0 = await customerFetch<unknown>("/customer-addresses");
    const list = extractAddresses(data0);
    if (list.length > 0) {
      return parseOrThrow(v.array(AddressSchema), list, keys.list());
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (e instanceof FetchError && e.status !== 404) throw e;
  }

  // Fallback endpoint — same behavior class. Some legacy backends served
  // `/addresses` instead of `/customer-addresses`.
  try {
    const dataA = await customerFetch<unknown>("/addresses");
    const list = extractAddresses(dataA);
    if (list.length > 0) {
      return parseOrThrow(v.array(AddressSchema), list, keys.list());
    }
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (e instanceof FetchError && e.status !== 404) throw e;
  }

  // Last resort: pull from /customer-auth/me's embedded addresses field.
  // Any error here propagates (no defensive swallow) — a /me failure
  // means we genuinely cannot serve addresses and the surrounding
  // useQuery should enter error state, matching the legacy behavior.
  const me = await customerFetch<{ addresses?: unknown }>(
    "/customer-auth/me",
  );
  const list = extractAddresses(me?.addresses ?? []);
  return parseOrThrow(v.array(AddressSchema), list, keys.list());
}

// ─── Public read hooks (the only legal read path for addresses) ─────────

/**
 * Read the customer's address book. Returns the canonical, schema-
 * validated `Address[]` shape. Bare-array canonicalisation per §F.11 —
 * the endpoint is non-paginated and no caller consumes pagination
 * metadata.
 *
 * The 3-endpoint fallback chain is encapsulated inside the fetcher so
 * every consumer of this key sees the same canonical shape regardless
 * of which backend served the data.
 *
 * Cache key: `["addresses", "list"]` — byte-identical to the legacy
 * `queryKeys.addresses.list()` tuple.
 */
export function useAddressesList(
  options?: QueryOpts,
): UseQueryResult<Address[], Error> {
  return useQuery({
    queryKey: keys.list(),
    queryFn: fetchAddressesList,
    enabled: options?.enabled ?? true,
  });
}

// ─── Invalidation (the only legal write surface for addresses) ──────────
//
// Mutations elsewhere in the app must mark addresses cache entries stale
// via these helpers — never via direct `queryClient.invalidateQueries({
// queryKey: queryKeys.addresses.* })` calls. Centralising here keeps
// every cache write surface inside the single-writer module that owns
// the schema.
//
// Today three mutation sites invalidate addresses:
//   - `app/account/addresses.tsx` — after create/edit + after delete.
//   - `lib/useCheckout.ts:cleanupAfterOrder` — after a successful
//     checkout (orders fan-out across cart/orders/addresses/storeCredit).

export const invalidateAddresses = {
  /**
   * Invalidate the addresses list cache entry. Uses the broadest prefix
   * (`["addresses"]`) so any future sub-keys (e.g. detail-by-id) also
   * mark stale, matching the legacy `queryKeys.addresses.all()` behavior.
   */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),

  /**
   * Invalidate ONLY the list entry. Reserved for future mutations that
   * surgically refresh the list without touching detail caches. Today
   * `all()` is the only caller; this exists so future code doesn't reach
   * back into raw key tuples.
   */
  list: () => getQueryClient().invalidateQueries({ queryKey: keys.list() }),
} as const;
