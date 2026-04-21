import { QueryClient } from "@tanstack/react-query";

import { AuthError, FetchError } from "./api";

/**
 * Maximum retry attempts for transport-level / 5xx failures. Three
 * gives us a 1 s + 2 s + 4 s = 7 s retry budget per query, which
 * comfortably covers the 3–5 s cellular cold-start gap we observe
 * on real iOS devices when the app is launched from a cold radio.
 *
 * Authentication and other 4xx errors are intentionally NOT retried
 * (see `shouldRetry` below) — repeating an auth-rejected request
 * just wastes the budget and confuses logout flow.
 */
const MAX_QUERY_RETRIES = 3;

/**
 * Exponential backoff in milliseconds: 1s, 2s, 4s, capped at 8s.
 * Mirrors TanStack's documented default formula but with a tighter
 * cap so the user-visible wait stays bounded.
 */
function exponentialBackoff(attemptIndex: number): number {
  return Math.min(1_000 * 2 ** attemptIndex, 8_000);
}

/**
 * Decide whether a failed query should be retried. Retry transport
 * failures (no response object) and 5xx server errors. Do NOT retry
 * authentication failures, 4xx client errors, or anything that
 * indicates a permanent rejection — those will not improve with a
 * second attempt and should surface to the user immediately.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;

  if (error instanceof AuthError) return false;

  if (error instanceof FetchError) {
    // Retry only 5xx (server-side / transient). Everything 4xx is
    // a permanent client error from this caller's perspective.
    return error.status >= 500 && error.status < 600;
  }

  // Unknown / NetworkError / TypeError — treat as transport failure
  // and retry (e.g. brief connectivity glitch, DNS timeout).
  return true;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 20 * 60 * 1000,
        staleTime: 60_000,
        retry: shouldRetry,
        retryDelay: exponentialBackoff,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        // Mutations are user-initiated (taps, form submits) so a
        // single retry on transport failure is the most we want —
        // anything more risks duplicate writes if the request
        // actually reached the server but the response was lost.
        retry: (failureCount, error) => {
          if (failureCount >= 1) return false;
          if (error instanceof AuthError) return false;
          if (error instanceof FetchError) return false;
          return true;
        },
        retryDelay: exponentialBackoff,
      },
    },
  });
}

let _client: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!_client) _client = makeQueryClient();
  return _client;
}
