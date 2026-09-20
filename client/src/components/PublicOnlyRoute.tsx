import { useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "../lib/auth-client";

export default function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();
  const [hasResolved, setHasResolved] = useState(false);

  if (!isPending && !hasResolved) {
    setHasResolved(true);
  }

  if (isPending && !hasResolved) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  if (session) {
    const rawNext = new URLSearchParams(location.search).get("next");
    const redirectTo =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/dashboard";
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}