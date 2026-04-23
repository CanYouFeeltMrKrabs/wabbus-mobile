/**
 * Returns domain — sealed query layer.
 *
 * Single owner of every cache entry under the "returns" key tuple.
 * App code reaches the returns cache exclusively through the typed
 * read hooks (or `invalidate.returns.*`) exported here.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule),
 * §3.1 (per-domain choreography), and
 * .cursor/handoff-sealed-query-layer.md §E.5 (returns inventory).
 *
 * Schema note: all object schemas use `v.looseObject`, NOT `v.object`.
 * See lib/queries/orders.ts for the long-form rationale shared across
 * every domain module.
 *
 * Outlier check: both `returns.list()` callers (return.tsx and
 * orders/index.tsx) use the same endpoint + same envelope extraction.
 * No shape divergence. No outlier.
 *
 * Bare-array canonical shape per §F.11 — the `/returns` endpoint
 * returns either a bare array or `{ data: [...] }`, and zero callers
 * consume pagination metadata. The fetcher defensively unwraps both.
 */

import * as v from "valibot";

import { customerFetch } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────

const ReturnRequestSchema = v.looseObject({
  status: v.string(),
});

const ReplacementCheckSchema = v.looseObject({
  blocked: v.optional(v.boolean()),
  code: v.optional(v.string()),
});

// ─── Inferred canonical types ────────────────────────────────────────────

export type ReturnRequestCanonical = v.InferOutput<typeof ReturnRequestSchema>;
export type ReplacementCheck = v.InferOutput<typeof ReplacementCheckSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.returns.*` factory entries.

const keys = {
  all: () => ["returns"] as const,
  list: (params?: Record<string, unknown>) =>
    ["returns", "list", params] as const,
  replacementCheck: (orderItemId: string | number) =>
    ["returns", "replacement-check", orderItemId] as const,
};

// ─── Internal queryFns (the single write path) ──────────────────────────

/**
 * Fetch the returns list. Uses `customerFetch` (authenticated endpoint).
 * Defensively unwraps both `{ data: [...] }` envelopes and bare arrays.
 */
async function fetchReturnsList(): Promise<ReturnRequestCanonical[]> {
  const raw = await customerFetch<unknown>("/returns");
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).data)
      ? (raw as Record<string, unknown>).data as unknown[]
      : [];
  return parseOrThrow(
    v.array(ReturnRequestSchema),
    list,
    keys.list(undefined),
  );
}

async function fetchReplacementCheck(
  orderItemId: string,
): Promise<ReplacementCheck> {
  const raw = await customerFetch<unknown>(
    `/returns/replacement-check/${encodeURIComponent(orderItemId)}`,
  );
  return parseOrThrow(
    ReplacementCheckSchema,
    raw,
    keys.replacementCheck(orderItemId),
  );
}

// ─── Per-hook options ─────────────────────────────────────────────────────

type QueryOpts = {
  enabled?: boolean;
};

// ─── Public read hooks (the only legal read path for returns) ───────────

/**
 * Read the returns list. Returns the canonical, schema-validated bare
 * array. Callers that need the full `ReturnRequest` type from
 * `lib/types.ts` should cast via §D.4.
 *
 * Cache key: `['returns', 'list', undefined]` — byte-identical to the
 * legacy `queryKeys.returns.list()`.
 */
export function useReturnsList(
  options?: QueryOpts,
): UseQueryResult<ReturnRequestCanonical[], Error> {
  return useQuery({
    queryKey: keys.list(undefined),
    queryFn: fetchReturnsList,
    enabled: options?.enabled ?? true,
  });
}

/**
 * Check whether a replacement is available for the given order item.
 * Returns `{ blocked?, code? }` — callers read `blocked` to gate the
 * replacement resolution option.
 *
 * Cache key: `['returns', 'replacement-check', orderItemId]` —
 * byte-identical to the legacy `queryKeys.returns.replacementCheck(id)`.
 */
export function useReplacementCheck(
  orderItemId: string | undefined,
  options?: QueryOpts,
): UseQueryResult<ReplacementCheck, Error> {
  return useQuery({
    queryKey: keys.replacementCheck(orderItemId ?? "__none__"),
    queryFn: () => fetchReplacementCheck(orderItemId!),
    enabled: (options?.enabled ?? true) && !!orderItemId,
  });
}

// ─── Invalidation ────────────────────────────────────────────────────────

export const invalidateReturns = {
  list: () =>
    getQueryClient().invalidateQueries({ queryKey: ["returns", "list"] }),

  replacementCheck: (orderItemId: string) =>
    getQueryClient().invalidateQueries({
      queryKey: keys.replacementCheck(orderItemId),
    }),

  all: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
