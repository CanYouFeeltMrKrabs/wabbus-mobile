/**
 * Cart domain — sealed query layer (invalidation-only).
 *
 * The `["cart"]` cache key currently has zero TanStack Query *read* call
 * sites in the mobile codebase — cart state is managed via
 * `lib/cart.tsx` (React context + localStorage, not TanStack Query).
 * The only reference to this key is the `queryClient.invalidateQueries`
 * call in `lib/useCheckout.ts:cleanupAfterOrder`.
 *
 * Per §F.13: "Don't expose a read hook for an invalidate-only key."
 * Only `invalidateCart` is exported here. If a future feature adds a
 * TanStack-backed cart read, create the schema + hook at THAT time.
 *
 * See .cursor/handoff-sealed-query-layer.md §E.5 (cart inventory).
 */

import { getQueryClient } from "./_client";

const keys = {
  all: () => ["cart"] as const,
};

export const invalidateCart = {
  all: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.all() }),
} as const;
