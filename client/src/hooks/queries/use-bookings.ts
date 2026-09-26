import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelBooking as cancelBookingApi,
  fetchBookings,
  submitBookingReview as submitBookingReviewApi,
  type BookingRecord,
} from "@/lib/bookings-api";
import { queryKeys } from "@/lib/query-keys";

export function useBookingsQuery() {
  return useQuery({
    queryKey: queryKeys.bookings.list(),
    queryFn: fetchBookings,
  });
}

/**
 * Cancelling a ride changes that ride's status everywhere it is displayed, so
 * the list is refetched from the server rather than patched locally: the cancel
 * endpoint also settles the driver search and can change the driver's active
 * ride, which the driver cache also mirrors.
 */
export function useCancelBookingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      cancelBookingApi(bookingId, reason),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.driver.all }),
      ]);
    },
  });
}

/**
 * A review only changes the ride's feedback, but it is also visible in driver
 * rating aggregates, so both caches are invalidated.
 */
export function useSubmitBookingReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bookingId,
      rating,
      comment,
    }: {
      bookingId: string;
      rating: number;
      comment?: string;
    }) => submitBookingReviewApi(bookingId, rating, comment),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.driver.rating() }),
      ]);
    },
  });
}

export type { BookingRecord };
