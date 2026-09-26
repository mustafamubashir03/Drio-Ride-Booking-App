import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDriverApplicationAdminApi,
  getDriverApplicationsOverview,
  listDriverApplicationsAdminApi,
  reviewDriverApplicationAdminApi,
  type AdminDriverApplication,
  type DriverApplicationStatus,
} from "@/lib/driver-api";
import { queryKeys } from "@/lib/query-keys";

export type DriverApplicationListParams = {
  page?: number;
  limit?: number;
  status?: DriverApplicationStatus;
};

export function useDriverApplicationsListQuery(params: DriverApplicationListParams) {
  return useQuery({
    queryKey: queryKeys.driverApplicationsAdmin.list(params),
    queryFn: () => listDriverApplicationsAdminApi(params),
  });
}

export function useDriverApplicationsOverviewQuery() {
  return useQuery({
    queryKey: queryKeys.driverApplicationsAdmin.overview(),
    queryFn: getDriverApplicationsOverview,
  });
}

export function useDriverApplicationDetailQuery(applicationId: string | null) {
  return useQuery({
    queryKey: queryKeys.driverApplicationsAdmin.detail(applicationId ?? ""),
    queryFn: () => getDriverApplicationAdminApi(applicationId as string),
    enabled: Boolean(applicationId),
  });
}

/**
 * A review changes one application's status, which also moves the pending /
 * approved / rejected counters and every cached list page (including filtered
 * ones), so the whole admin slice is invalidated. The reviewed application is
 * written into its detail cache immediately.
 */
export function useReviewDriverApplicationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      applicationId,
      decision,
      adminNote,
      rejectionReason,
    }: {
      applicationId: string;
      decision: "approved" | "rejected";
      adminNote?: string | null;
      rejectionReason?: string | null;
    }) => reviewDriverApplicationAdminApi({ applicationId, decision, adminNote, rejectionReason }),
    onSuccess: async (application: AdminDriverApplication) => {
      queryClient.setQueryData(queryKeys.driverApplicationsAdmin.detail(application._id), application);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.driverApplicationsAdmin.all }),
        // A newly approved driver may start onboarding in their own portal.
        queryClient.invalidateQueries({ queryKey: queryKeys.driverApplication.all }),
      ]);
    },
  });
}
