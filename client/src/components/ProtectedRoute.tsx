import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-drio-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-drio-surface border-t-drio-accent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}