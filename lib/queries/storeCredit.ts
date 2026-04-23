/**
 * Store Credit domain — sealed query layer.
 *
 * Single owner of the `["store-credit"]` cache key. App code reaches
 * the store-credit cache exclusively through the typed read hook (or
 * `invalidate.storeCredit.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §3.1
 * (per-domain choreography), §4 (long-tail domains) and
 * `.cursor/handoff-sealed-query-layer.md` §E.4.
 *
 * Canonical shape decision:
 *   The legacy queryFn at `app/account/payment-methods.tsx` extracted
 *   `balanceCents` off the response and stored a bare `number` in the
 *   cache (`data?.balanceCents ?? 0`). Every consumer reads the cached
 *   value as a number. We preserve that exactly — the canonical cached
 *   shape is `number`, not the wire envelope. This is the ONLY
 *   acceptable case of envelope-collapse in this layer, justified
 *   because:
 *     1. There is exactly one writer (this module), so collapsing here
 *        cannot create the multi-writer divergence problem we're
 *        solving elsewhere.
 *     2. The endpoint has no other useful fields — `{balanceCents}` is
 *        the entire schema, not a slice of a richer object.
 *     3. Every observed consumer uses the value as a money integer
 *        directly; preserving the envelope would force a `.balanceCents`
 *        accessor on every caller for no observable benefit.
 *
 *   If the backend ever adds adjacent fields (e.g. expiry, currency,
 *   pending-vs-available split) we'll widen the canonical shape to the
 *   full envelope at that point.
 *
 * Outlier handling:
 *   The legacy queryFn swallowed any thrown error from the endpoint
 *   (`.catch(() => null)`) and defaulted to 0. We preserve that
 *   exactly — store credit is a soft secondary signal in the
 *   payment-methods UI, and a transient backend hiccup should not
 *   surface as a blocking error. The defensive swallow lives inside
 *   `fetchStoreCreditBalance` per §F.14.
 */

import * as v from "valibot";

import { customerFetch } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// `v.looseObject` per the cross-module convention — see
// `lib/queries/orders.ts` for rationale. The schema is the LOWER BOUND
// of the wire envelope before we collapse to a number.

const StoreCreditEnvelopeSchema = v.looseObject({
  balanceCents: v.optional(v.number()),
});

// ─── Inferred canonical types ────────────────────────────────────────────
//
// Canonical CACHED shape is `number`, not the envelope. See file-level
// docblock for the justification of envelope-collapse in this domain.

export type StoreCreditBalance = number;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.storeCredit()` factory entry.

const keys = {
  all: () => ["store-credit"] as const,
};

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Internal queryFns (the single write path) ──────────────────────────

async function fetchStoreCreditBalance(): Promise<StoreCreditBalance> {
  // Defensive swallow preserved from legacy queryFn — store credit is a
  // soft secondary signal and a transient endpoint failure should not
  // bubble up as an error in the payment-methods UI. The fallback is
  // `0` (no credit), matching the legacy behavior bit-for-bit.
  const raw = await customerFetch<unknown>(
    "/payments/credit-balance",
  ).catch(() => null);
  if (raw === null) return 0;

  // Validate the wire envelope before extraction — `parseOrThrow` will
  // self-heal a corrupted cache entry by evicting and re-throwing,
  // which downgrades to the legacy "treat as 0" path on the next read
  // since the catch above will now succeed (cache miss).
  const envelope = parseOrThrow(StoreCreditEnvelopeSchema, raw, keys.all());
  return envelope.balanceCents ?? 0;
}

// ─── Public read hooks ────────────────────────────────────────────────────

/**
 * Read the customer's store-credit balance in minor units (cents).
 * Returns `0` if the customer has no credit OR if the endpoint is
 * unavailable — see the file-level docblock for why the defensive
 * swallow is preserved.
 *
 * Cache key: `["store-credit"]` — byte-identical to the legacy
 * `queryKeys.storeCredit()` tuple.
 */
export function useStoreCreditBalance(
  options?: QueryOpts,
): UseQueryResult<StoreCreditBalance, Error> {
  return useQuery({
    queryKey: keys.all(),
    queryFn: fetchStoreCreditBalance,
    enabled: options?.enabled ?? true,
  });
}

// ─── Invalidation ─────────────────────────────────────────────────────────
//
// Today, store credit is invalidated by `lib/useCheckout.ts` after a
// successful order (the order may have consumed credit). When refunds,
// credit-issuance, or admin-grant flows land we'll add their
// invalidation through this same surface.

export const invalidateStoreCredit = {
  /** Invalidate the store-credit cache entry. */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
