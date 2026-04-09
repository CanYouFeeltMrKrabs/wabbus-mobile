import { QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 20 * 60 * 1000,
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

let _client: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!_client) _client = makeQueryClient();
  return _client;
}
