/**
 * parseOrThrow — write-time schema gate for every cached value.
 *
 * Every queryFn in lib/queries/<domain>.ts MUST pass the API response through
 * this helper before returning. On schema mismatch:
 *   1. The poisoned cache entry is evicted (removeQueries).
 *   2. A Sentry breadcrumb captures the failing key + first 5 issue messages.
 *   3. The error is thrown so TanStack Query enters error state and the
 *      configured retry policy (lib/queryClient.ts) applies.
 *
 * Result: bad data nukes itself. The cache is self-healing — corrupted shape
 * cannot survive across mounts because the next read forces a fresh fetch
 * against the live API.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule 2 — validation
 * is the writer's contract) and §2 (`_validate.ts` — the self-healing contract).
 */

import * as v from "valibot";
import * as Sentry from "@sentry/react-native";

import { getQueryClient } from "./_client";

export function parseOrThrow<TSchema extends v.GenericSchema>(
  schema: TSchema,
  data: unknown,
  queryKey: readonly unknown[],
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, data);
  if (result.success) {
    return result.output as v.InferOutput<TSchema>;
  }

  // Self-heal: evict the bad cache entry so the next mount or refetch hits the
  // live API instead of re-reading the poisoned shape.
  try {
    getQueryClient().removeQueries({ queryKey });
  } catch {
    // Client not yet initialised (extremely early boot). Eviction is best-effort;
    // the throw below is the load-bearing part.
  }

  // Observability — breadcrumb so Sentry sessions surface the schema drift.
  // Wrapped in try/catch because Sentry may not be initialised in dev builds.
  try {
    Sentry.addBreadcrumb({
      category: "cache.shape",
      level: "error",
      message: "Query response failed schema validation; cache entry evicted.",
      data: {
        queryKey: JSON.stringify(queryKey),
        issueCount: result.issues.length,
        firstIssues: result.issues.slice(0, 5).map((i) => i.message),
      },
    });
  } catch {
    // Sentry unavailable — eviction + throw still happen.
  }

  throw new Error(
    `Schema validation failed for query key ${JSON.stringify(queryKey)}.`,
  );
}

/**
 * Per-item validation for list endpoints. Instead of failing the entire
 * array when one item has bad data (e.g. a test product with `price: null`),
 * this validates each element individually: valid items pass through,
 * invalid items are silently dropped with a Sentry breadcrumb.
 *
 * Use this for feeds where partial data is strictly better than no data
 * (product lists, recommendation carousels). The all-or-nothing
 * `parseOrThrow(v.array(schema), ...)` remains the right choice for
 * single-object responses (order detail, product detail) where a partial
 * result doesn't make sense.
 */
export function filterValidItems<TSchema extends v.GenericSchema>(
  itemSchema: TSchema,
  items: unknown[],
  queryKey: readonly unknown[],
): v.InferOutput<TSchema>[] {
  const valid: v.InferOutput<TSchema>[] = [];
  let droppedCount = 0;

  for (const item of items) {
    const result = v.safeParse(itemSchema, item);
    if (result.success) {
      valid.push(result.output as v.InferOutput<TSchema>);
    } else {
      droppedCount++;
    }
  }

  if (droppedCount > 0) {
    try {
      Sentry.addBreadcrumb({
        category: "cache.shape",
        level: "warning",
        message: `Dropped ${droppedCount}/${items.length} items failing schema validation.`,
        data: {
          queryKey: JSON.stringify(queryKey),
          droppedCount,
          totalCount: items.length,
        },
      });
    } catch {
      // Sentry unavailable — filtering still happens.
    }
  }

  return valid;
}
