import { useEffect, useState, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { fetchMyDriverApplication } from "@/lib/driver-api";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  LogOut,
  Car,
  Shield,
  User as UserIcon,
  CheckCircle2,
} from "lucide-react";

type DriverCapability = {
  hasAccess: boolean;
  destination: string;
  label: string;
  status: "approved" | "pending" | "rejected" | "none";
};

function getDriverCapability(app: { status: string } | null): DriverCapability {
  if (!app) {
    return {
      hasAccess: true,
      destination: "/driver/onboarding",
      label: "Driver application",
      status: "none",
    };
  }
  if (app.status === "approved") {
    return {
      hasAccess: true,
      destination: "/driver/dashboard",
      label: "Driver",
      status: "approved",
    };
  }
  if (app.status === "pending") {
    return {
      hasAccess: true,
      destination: "/driver/status",
      label: "Driver application · Pending",
      status: "pending",
    };
  }
  if (app.status === "rejected") {
    return {
      hasAccess: true,
      destination: "/driver/status",
      label: "Driver application · Rejected",
      status: "rejected",
    };
  }
  return {
    hasAccess: true,
    destination: "/driver/onboarding",
    label: "Driver application",
    status: "none",
  };
}

export function AccountSwitcher({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [driverCapability, setDriverCapability] = useState<
    { hasAccess: boolean; destination: string; label: string; status: "approved" | "pending" | "rejected" | "none" } | null
  >(null);
  const [checking, setChecking] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const checkCapabilities = async () => {
      if (isPending) return;

      const user = (session as unknown as {
        user?: { role?: string; name?: string; email?: string };
      } | null)?.user;

      if (!user) {
        setChecking(false);
        return;
      }

      // Check driver capability
      try {
        const app = await fetchMyDriverApplication();
        if (!cancelled) {
          setDriverCapability(getDriverCapability(app));
        }
      } catch {
        if (!cancelled) {
          setDriverCapability({
            hasAccess: true,
            destination: "/driver/onboarding",
            label: "Driver application",
            status: "none",
          });
        }
      }

      if (!cancelled) {
        setChecking(false);
      }
    };

    checkCapabilities();

    return () => {
      cancelled = true;
    };
  }, [session, isPending]);

  const sessionUser = (session as unknown as {
    user?: { role?: string };
  } | null)?.user;
  const isAdmin = sessionUser?.role === "admin";

  if (isPending || checking) {
    return <>{children}</>;
  }

  // Build available contexts
  const contexts = [
    {
      id: "passenger",
      label: "Passenger",
      icon: UserIcon,
      destination: "/dashboard",
      available: true,
    },
    {
      id: "driver",
      label: driverCapability?.label ?? "Driver",
      icon: Car,
      destination: driverCapability?.destination ?? "/driver/onboarding",
      available: driverCapability?.hasAccess ?? false,
      status: driverCapability?.status,
    },
    {
      id: "admin",
      label: "Admin",
      icon: Shield,
      destination: "/admin",
      available: isAdmin, // The /admin route is still guarded server-side by requireRole("admin")
    },
  ];

  // Only show contexts the user has access to
  const availableContexts = contexts.filter((ctx) => ctx.available);

  // If only passenger is available, don't show switcher
  if (availableContexts.length <= 1) {
    return <>{children}</>;
  }

  return (
    <div className="relative w-fit" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 h-8"
        onClick={() => setIsOpen(!isOpen)}
      >
        <UserIcon className="h-4 w-4" />
        <span className="text-[13px] font-medium">Switch account</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </Button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 z-50 min-w-[14rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Switch context
          </div>
          <hr className="my-1 border-border" />
          {availableContexts.map((ctx) => (
            <button
              key={ctx.id}
              onClick={() => {
                navigate(ctx.destination);
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ctx.icon className="h-4 w-4" />
              <span className="flex-1 text-left">
                {ctx.label}
                {ctx.id === "driver" && (
                  <>
                    {driverCapability?.status === "pending" && (
                      <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500">
                        Pending
                      </span>
                    )}
                    {driverCapability?.status === "rejected" && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                        Rejected
                      </span>
                    )}
                    {driverCapability?.status === "approved" && (
                      <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-drio-success" />
                    )}
                  </>
                )}
              </span>
            </button>
          ))}
          <hr className="my-1 border-border" />
          <button
            onClick={async () => {
              setIsOpen(false);
              await authClient.signOut({
                disableRedirect: false,
                callbackURL: "/login",
              });
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-accent hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}