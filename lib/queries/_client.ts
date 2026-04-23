/**
 * Internal accessor for the singleton QueryClient.
 *
 * Used by lib/queries/invalidate.ts so typed invalidation helpers can dispatch
 * without the rest of the app needing to import useQueryClient() directly.
 *
 * App code does NOT import this file. Mutations and components access the cache
 * exclusively through the typed read/mutation hooks and the `invalidate` module
 * exported from '@/lib/queries'.
 *
 * This is a thin re-export of lib/queryClient.ts so future changes to client
 * acquisition (test-time injection, multi-client setups, etc.) have one place
 * to live without touching every domain module.
 */

import { getQueryClient as _getQueryClient } from "@/lib/queryClient";

export function getQueryClient() {
  return _getQueryClient();
}
