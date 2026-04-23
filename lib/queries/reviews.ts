/**
 * Reviews domain — sealed query layer.
 *
 * Owns the `["reviews", ...]` and `["reviewSummary", ...]` cache namespaces.
 *
 * Call sites:
 * - `["reviews", "mine", productIds]` — review screen, checks which products
 *   the user already reviewed.
 * - `["reviewSummary", productId]`    — PDP, shows aggregate rating/count.
 *
 * See .cursor/handoff-sealed-query-layer.md §E.5 (unmanaged keys).
 */

import * as v from "valibot";
import { useQuery } from "./_internal/react-query";
import { getQueryClient } from "./_client";
import { parseOrThrow } from "./_validate";
import { customerFetch, publicFetch } from "../api";

// ─── Schemas ───────────────────────────────────────────────────────────

const MyReviewSchema = v.looseObject({
  productId: v.optional(v.nullable(v.string())),
  publicProductId: v.optional(v.nullable(v.string())),
});

const ReviewSummarySchema = v.looseObject({
  ratingAvg: v.number(),
  reviewCount: v.number(),
});

export type MyReview = v.InferOutput<typeof MyReviewSchema>;
export type ReviewSummary = v.InferOutput<typeof ReviewSummarySchema>;

// ─── Keys ──────────────────────────────────────────────────────────────

const keys = {
  mine: (productIds: string) => ["reviews", "mine", productIds] as const,
  summary: (productId: string) => ["reviewSummary", productId] as const,
};

// ─── Fetchers ──────────────────────────────────────────────────────────

async function fetchMyReviews(productIds: string): Promise<MyReview[]> {
  const raw = await customerFetch<unknown>(
    `/reviews/mine?productIds=${productIds}`,
  );
  const arr = Array.isArray(raw) ? raw : [];
  return parseOrThrow(v.array(MyReviewSchema), arr, keys.mine(productIds));
}

async function fetchReviewSummary(
  productId: string,
): Promise<ReviewSummary> {
  const raw = await publicFetch<unknown>(
    `/reviews/by-product-id/${encodeURIComponent(productId)}/summary`,
  );
  return parseOrThrow(ReviewSummarySchema, raw, keys.summary(productId));
}

// ─── Per-hook options ──────────────────────────────────────────────────

type QueryOpts = { enabled?: boolean };

// ─── Hooks ─────────────────────────────────────────────────────────────

export function useMyProductReviews(
  productIds: string | undefined,
  opts?: QueryOpts,
) {
  return useQuery({
    queryKey: keys.mine(productIds!),
    queryFn: () => fetchMyReviews(productIds!),
    enabled: !!productIds && (opts?.enabled !== false),
  });
}

export function useReviewSummary(
  productId: string | undefined,
  opts?: QueryOpts,
) {
  return useQuery({
    queryKey: keys.summary(productId!),
    queryFn: () => fetchReviewSummary(productId!),
    enabled: !!productId && (opts?.enabled !== false),
  });
}

// ─── Invalidation ──────────────────────────────────────────────────────

export const invalidateReviews = {
  mine: (productIds: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.mine(productIds) }),
  summary: (productId: string) =>
    getQueryClient().invalidateQueries({
      queryKey: keys.summary(productId),
    }),
  all: () =>
    getQueryClient().invalidateQueries({ queryKey: ["reviews"] }),
} as const;
