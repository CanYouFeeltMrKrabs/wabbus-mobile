/**
 * Cases domain — sealed query layer.
 *
 * Owns the `["cases", ...]` cache namespace.  This is DISTINCT from the
 * messages domain's `["messages", "cases", ...]` namespace — the two
 * namespaces share neither keys nor endpoints (despite the word "cases"
 * appearing in both).
 *
 * Two call sites:
 * - `["cases", "mine", orderId]`   — missing-item screen, hits `/cases/mine`
 * - `["cases", "detail", issueId]` — case detail screen, hits `/cases/by-id/:id`
 *
 * See .cursor/handoff-sealed-query-layer.md §E.5 (unmanaged keys).
 */

import * as v from "valibot";
import { useQuery } from "./_internal/react-query";
import { getQueryClient } from "./_client";
import { parseOrThrow } from "./_validate";
import { customerFetch } from "../api";

// ─── Schemas ───────────────────────────────────────────────────────────
// looseObject preserves unknown keys — these APIs return complex nested
// data and the call sites access many fields beyond what we validate.

const CaseSummarySchema = v.looseObject({
  status: v.optional(v.nullable(v.string())),
  order: v.optional(
    v.nullable(
      v.looseObject({
        publicId: v.optional(v.nullable(v.string())),
      }),
    ),
  ),
  items: v.optional(
    v.nullable(
      v.array(
        v.looseObject({
          orderItem: v.optional(
            v.nullable(
              v.looseObject({
                publicId: v.optional(v.nullable(v.string())),
              }),
            ),
          ),
          orderItemPublicId: v.optional(v.nullable(v.string())),
        }),
      ),
    ),
  ),
});

const CaseDetailSchema = v.looseObject({
  status: v.optional(v.nullable(v.string())),
});

export type CaseSummary = v.InferOutput<typeof CaseSummarySchema>;
export type CaseDetail = v.InferOutput<typeof CaseDetailSchema>;

// ─── Keys ──────────────────────────────────────────────────────────────

const keys = {
  mine: (orderId: string) => ["cases", "mine", orderId] as const,
  detail: (issueId: string) => ["cases", "detail", issueId] as const,
};

// ─── Fetchers ──────────────────────────────────────────────────────────

async function fetchMyCases(orderId: string): Promise<CaseSummary[]> {
  const raw = await customerFetch<unknown>("/cases/mine");
  const d = raw as Record<string, unknown> | unknown[] | null;
  const arr = Array.isArray(d)
    ? d
    : Array.isArray((d as Record<string, unknown>)?.data)
      ? ((d as Record<string, unknown>).data as unknown[])
      : [];
  return parseOrThrow(v.array(CaseSummarySchema), arr, keys.mine(orderId));
}

async function fetchCaseDetail(issueId: string): Promise<CaseDetail> {
  const raw = await customerFetch<unknown>(`/cases/by-id/${issueId}`);
  return parseOrThrow(CaseDetailSchema, raw, keys.detail(issueId));
}

// ─── Per-hook options ──────────────────────────────────────────────────

type QueryOpts = { enabled?: boolean };

// ─── Hooks ─────────────────────────────────────────────────────────────

export function useMyCases(orderId: string | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: keys.mine(orderId!),
    queryFn: () => fetchMyCases(orderId!),
    enabled: !!orderId && (opts?.enabled !== false),
  });
}

export function useCaseDetail(
  issueId: string | undefined,
  opts?: QueryOpts,
) {
  return useQuery({
    queryKey: keys.detail(issueId!),
    queryFn: () => fetchCaseDetail(issueId!),
    enabled: !!issueId && (opts?.enabled !== false),
  });
}

// ─── Invalidation ──────────────────────────────────────────────────────

export const invalidateCases = {
  mine: (orderId: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.mine(orderId) }),
  detail: (issueId: string) =>
    getQueryClient().invalidateQueries({ queryKey: keys.detail(issueId) }),
  all: () =>
    getQueryClient().invalidateQueries({ queryKey: ["cases"] }),
} as const;
