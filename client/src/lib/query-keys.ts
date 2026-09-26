import type { DriverApplicationStatus } from "./driver-api";

/**
 * Single source of truth for cache keys. Anything read through a hook must be
 * reachable from here, so a mutation can invalidate exactly the slices it
 * affects instead of the whole cache.
 */
export const queryKeys = {
  session: ["session"] as const,

  bookings: {
    all: ["bookings"] as const,
    list: () => [...queryKeys.bookings.all, "list"] as const,
  },

  driverApplication: {
    all: ["driver-application"] as const,
    mine: () => [...queryKeys.driverApplication.all, "mine"] as const,
  },

  driverApplicationsAdmin: {
    all: ["driver-applications-admin"] as const,
    list: (params: { page?: number; limit?: number; status?: DriverApplicationStatus }) =>
      [...queryKeys.driverApplicationsAdmin.all, "list", params] as const,
    overview: () => [...queryKeys.driverApplicationsAdmin.all, "overview"] as const,
    detail: (applicationId: string) =>
      [...queryKeys.driverApplicationsAdmin.all, "detail", applicationId] as const,
  },

  driver: {
    all: ["driver"] as const,
    availability: () => [...queryKeys.driver.all, "availability"] as const,
    activeRide: () => [...queryKeys.driver.all, "active-ride"] as const,
    rides: () => [...queryKeys.driver.all, "rides"] as const,
    ride: (bookingId: string) => [...queryKeys.driver.all, "ride", bookingId] as const,
    rating: () => [...queryKeys.driver.all, "rating"] as const,
    earnings: () => [...queryKeys.driver.all, "earnings"] as const,
  },
} as const;
