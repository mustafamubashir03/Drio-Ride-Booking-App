import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  confirmBooking as confirmBookingApi,
  createDriverApplication as createDriverApplicationApi,
  fetchDriverActiveRide,
  fetchDriverAvailability,
  fetchDriverEarnings,
  fetchDriverRating,
  fetchDriverRide,
  fetchDriverRides,
  fetchMyDriverApplication,
  setDriverAvailability as setDriverAvailabilityApi,
  transitionDriverRide as transitionDriverRideApi,
  uploadDriverDocument as uploadDriverDocumentApi,
  type DriverApplication,
  type DriverApplicationDocument,
  type DriverAvailability,
  type DriverAvailabilityStatus,
  type DriverDocumentType,
  type DriverRide,
  type DriverRideAction,
} from "@/lib/driver-api";
import { queryKeys } from "@/lib/query-keys";

/* ── Driver application (onboarding) ─────────────────────────────────── */

// Single definition of this resource, shared by the reactive hook below and the
// imperative ensureMyDriverApplication() helper, so the cache key and fetcher
// can never drift apart between render-driven and redirect-driven consumers.
const myDriverApplicationQueryOptions = () => ({
  queryKey: queryKeys.driverApplication.mine(),
  queryFn: fetchMyDriverApplication,
});

export function useMyDriverApplicationQuery() {
  return useQuery(myDriverApplicationQueryOptions());
}

/**
 * Imperative read for redirect and access-guard flows (sign-in routing, the
 * driver role gate, the account switcher). These need the value once to make a
 * decision, not a live subscription, so they read through the shared cache with
 * ensureQueryData: the first caller populates it and later callers reuse it
 * instead of issuing their own request.
 */
export function ensureMyDriverApplication(queryClient: QueryClient) {
  return queryClient.ensureQueryData(myDriverApplicationQueryOptions());
}

export function useCreateDriverApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createDriverApplicationApi(),
    onSuccess: async (application: DriverApplication) => {
      queryClient.setQueryData(queryKeys.driverApplication.mine(), application);
      await queryClient.invalidateQueries({ queryKey: queryKeys.driverApplication.all });
    },
  });
}

export function useUploadDriverDocumentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentType, file }: { documentType: DriverDocumentType; file: File }) =>
      uploadDriverDocumentApi({ documentType, file }),
    onSuccess: async (result: { document: DriverApplicationDocument; documents: DriverApplicationDocument[] }) => {
      // The upload response returns the full document list, so the cached
      // application can be updated without a round trip.
      queryClient.setQueryData<DriverApplication | null>(queryKeys.driverApplication.mine(), (previous) =>
        previous
          ? { ...previous, documents: result.documents }
          : previous,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.driverApplication.all });
    },
  });
}

/* ── Availability ─────────────────────────────────────────────────────── */

export function useDriverAvailabilityQuery() {
  return useQuery({
    queryKey: queryKeys.driver.availability(),
    queryFn: fetchDriverAvailability,
  });
}

/**
 * Imperative read used by the dashboard shell to decide whether to reconnect the
 * socket on mount. It needs the persisted status once, not a subscription, so it
 * shares the cache instead of issuing a separate request.
 */
export function ensureDriverAvailability(queryClient: QueryClient) {
  return queryClient.ensureQueryData({
    queryKey: queryKeys.driver.availability(),
    queryFn: fetchDriverAvailability,
  });
}

export function useSetDriverAvailabilityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: DriverAvailabilityStatus) => setDriverAvailabilityApi(status),
    onSuccess: async (availability: DriverAvailability) => {
      // An availability change also retires the active ride, so that query is
      // refreshed with it rather than left describing a dispatch that ended.
      queryClient.setQueryData(queryKeys.driver.availability(), availability);
      await queryClient.invalidateQueries({ queryKey: queryKeys.driver.activeRide() });
    },
  });
}

/* ── Rides ────────────────────────────────────────────────────────────── */

export function useDriverActiveRideQuery() {
  return useQuery({
    queryKey: queryKeys.driver.activeRide(),
    queryFn: fetchDriverActiveRide,
  });
}

export function useDriverRidesQuery() {
  return useQuery({
    queryKey: queryKeys.driver.rides(),
    queryFn: fetchDriverRides,
  });
}

export function useDriverRideQuery(bookingId: string | null) {
  return useQuery({
    queryKey: queryKeys.driver.ride(bookingId ?? ""),
    queryFn: () => fetchDriverRide(bookingId as string),
    enabled: Boolean(bookingId),
  });
}

/**
 * Every ride transition (accept, arriving, arrived, start, complete, cancel)
 * and the passenger-side confirm both change which ride is "active" and the
 * driver's ride history, so the whole driver ride slice is invalidated and
 * refetched from the server. The returned ride is also written into the
 * per-ride cache so a detail view updates immediately.
 */
function useInvalidateDriverRides() {
  const queryClient = useQueryClient();

  return async (ride: DriverRide) => {
    queryClient.setQueryData(queryKeys.driver.ride(ride._id), ride);
    // A ride that has reached a terminal state is no longer the active one.
    // Reflect that in the cache straight away so the live-trip card clears
    // immediately, then let the refetch below confirm it against the server.
    if (ride.status === "completed" || ride.status === "cancelled") {
      queryClient.setQueryData(queryKeys.driver.activeRide(), null);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.activeRide() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.rides() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.driver.earnings() }),
    ]);
  };
}

export function useTransitionDriverRideMutation() {
  const invalidate = useInvalidateDriverRides();

  return useMutation({
    mutationFn: ({ bookingId, action }: { bookingId: string; action: DriverRideAction }) =>
      transitionDriverRideApi(bookingId, action),
    onSuccess: invalidate,
  });
}

export function useConfirmBookingMutation() {
  const invalidate = useInvalidateDriverRides();

  return useMutation({
    mutationFn: (bookingId: string) => confirmBookingApi(bookingId),
    onSuccess: invalidate,
  });
}

/* ── Rating & earnings ────────────────────────────────────────────────── */

export function useDriverRatingQuery() {
  return useQuery({
    queryKey: queryKeys.driver.rating(),
    queryFn: fetchDriverRating,
  });
}

export function useDriverEarningsQuery() {
  return useQuery({
    queryKey: queryKeys.driver.earnings(),
    queryFn: fetchDriverEarnings,
  });
}
