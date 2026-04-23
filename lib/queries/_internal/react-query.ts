/**
 * The single bridge between the sealed query layer and TanStack Query.
 *
 * THIS IS THE ONLY FILE IN THE REPO THAT IS PERMITTED TO IMPORT FROM
 * '@tanstack/react-query'. The CI grep check (scripts/check-query-imports.sh)
 * and the ESLint `no-restricted-imports` rule both enforce this.
 *
 * Files inside lib/queries/** import from '@/lib/queries/_internal/react-query'.
 * Files outside lib/queries/** must not import this module at all — they consume
 * typed hooks and the `invalidate` helper through the public barrel '@/lib/queries'.
 *
 * Surface is grown intentionally — explicit named re-exports only, never `export *`.
 * Adding a new export here is an architectural decision; every primitive exposed
 * here is a primitive that domain modules may use directly.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §1.2 (Layer 1).
 */

export {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
} from "@tanstack/react-query";

export type {
  UseQueryOptions,
  UseQueryResult,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  QueryKey,
} from "@tanstack/react-query";
