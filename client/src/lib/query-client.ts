import { QueryClient } from "@tanstack/react-query";

/**
 * Defaults are tuned for this app's data:
 *  - Bookings, driver applications, earnings and ratings are ordinary CRUD
 *    reads that change when the current user acts, so they are cached and only
 *    refetched on window focus.
 *  - Retry is disabled for 4xx (the API answers with a helpful message and
 *    retrying cannot fix it) and kept for 5xx / network blips.
 */
const isClientError = (error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status !== "number") return false;
  return status >= 400 && status < 500;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => (isClientError(error) ? false : failureCount < 2),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});
