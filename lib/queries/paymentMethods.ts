/**
 * Payment Methods domain — sealed query layer.
 *
 * Single owner of the `["payment-methods"]` cache key. App code reaches
 * the payment-methods cache exclusively through the typed read hook (or
 * `invalidate.paymentMethods.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §3.1
 * (per-domain choreography), §4 (long-tail domains) and
 * `.cursor/handoff-sealed-query-layer.md` §E.4.
 *
 * Outlier handling:
 *   The legacy `app/account/payment-methods.tsx` queryFn handled two
 *   envelope shapes (bare array, `{methods: []}`). This module is the
 *   only writer for `["payment-methods"]`; the envelope unwrap and the
 *   schema validation are centralised inside `fetchPaymentMethods` per
 *   §F.14 (centralise outliers inside the fetcher, never at the call
 *   site). Mutations (PATCH/DELETE/POST setup-intent) live at the call
 *   site and remain plain `customerFetch` calls — they trigger refetch
 *   via `refetch()` from the read hook today; once a `useMutation`
 *   pattern is adopted across the codebase we'll add typed mutation
 *   helpers here.
 */

import * as v from "valibot";

import { customerFetch } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
// See `lib/queries/orders.ts` for the long-form rationale shared across
// every domain module.

const NullishString = v.optional(v.nullable(v.string()));
const NullishNumber = v.optional(v.nullable(v.number()));
const NullishBoolean = v.optional(v.nullable(v.boolean()));

// Mirror of `lib/types.ts:PaymentMethod`. The Stripe envelope ships
// `stripePaymentMethodId` as the canonical id — every other field is
// nullable per Stripe's optional-field policy (a us_bank_account has no
// brand/expMonth/expYear; a `link` payment method has no last4).
const PaymentMethodSchema = v.looseObject({
  stripePaymentMethodId: v.string(),
  type: NullishString,
  brand: NullishString,
  last4: NullishString,
  expMonth: NullishNumber,
  expYear: NullishNumber,
  isDefault: NullishBoolean,
  createdAt: v.optional(v.string()),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type PaymentMethod = v.InferOutput<typeof PaymentMethodSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.paymentMethods()` factory entry.
// Kept as a single flat tuple for now — there are no sub-domains today
// (no detail-by-id, no params); when we add a `default()` helper or
// per-method invalidation we'll expand to `["payment-methods", ...]`.

const keys = {
  all: () => ["payment-methods"] as const,
};

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Internal queryFns (the single write path) ──────────────────────────

/**
 * Best-effort PaymentMethod[] extraction. Mirrors the legacy
 * envelope-flattening logic — accepts bare arrays and `{methods: []}`
 * envelopes. Anything else returns []. Centralising here means callers
 * never have to know which shape Stripe shipped on this deploy.
 */
function extractPaymentMethods(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.methods)) return obj.methods;
  }
  return [];
}

async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const raw = await customerFetch<unknown>("/payments/methods");
  const list = extractPaymentMethods(raw);
  return parseOrThrow(v.array(PaymentMethodSchema), list, keys.all());
}

// ─── Public read hooks ────────────────────────────────────────────────────

/**
 * Read the customer's saved payment methods. Returns the canonical,
 * schema-validated `PaymentMethod[]` shape (bare-array canonicalisation
 * per §F.11 — the endpoint is non-paginated).
 *
 * Cache key: `["payment-methods"]` — byte-identical to the legacy
 * `queryKeys.paymentMethods()`.
 */
export function usePaymentMethods(
  options?: QueryOpts,
): UseQueryResult<PaymentMethod[], Error> {
  return useQuery({
    queryKey: keys.all(),
    queryFn: fetchPaymentMethods,
    enabled: options?.enabled ?? true,
  });
}

// ─── Invalidation ─────────────────────────────────────────────────────────
//
// Invalidation is triggered today only by the on-screen mutations in
// `app/account/payment-methods.tsx` (set-default, delete, add-card).
// Those call sites already call `refetch()` directly off the hook
// result; this helper is provided so future cross-domain mutations
// (e.g. checkout completion, 3DS redirect handler) don't need to reach
// back into raw key tuples.

export const invalidatePaymentMethods = {
  /** Invalidate the entire payment-methods cache entry. */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
