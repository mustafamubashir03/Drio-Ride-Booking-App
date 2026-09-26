import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { ensureMyDriverApplication } from "@/hooks/queries/use-driver";

export default function RequireDriverRole({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState<
    "checking" | "allowed" | "denied"
  >("checking");

  useEffect(() => {
    let cancelled = false;

    if (isPending) return;

    const user = (session as unknown as { user?: { role?: string } } | null)?.user;

    // user.role is a single mutually-exclusive enum (passenger/driver/admin).
    // It is NEVER set to "driver" on approval server-side (approval only flips
    // DriverApplication.status). So capability = role driver/admin OR an
    // approved driver application - same durable truth the rest of the app
    // already reads. Admin who is also an approved driver keeps BOTH (admin
    // stays admin; never mutated here).
    if (user && (user.role === "driver" || user.role === "admin")) {
      queueMicrotask(() => setCapability("allowed"));
      return;
    }

    if (!user) {
      queueMicrotask(() => setCapability("denied"));
      return;
    }

    // One-shot gate check: reads the shared cache rather than subscribing.
    void ensureMyDriverApplication(queryClient)
      .then((application) => {
        if (cancelled) return;
        setCapability(application?.status === "approved" ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setCapability("denied");
      });

    return () => {
      cancelled = true;
    };
  }, [session, isPending, queryClient]);

  if (isPending || capability === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (capability === "denied") {
    return <Navigate to="/driver/status" replace />;
  }

  return <>{children}</>;
}
