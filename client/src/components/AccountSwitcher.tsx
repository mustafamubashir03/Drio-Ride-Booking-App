import { useEffect, useState, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { fetchMyDriverApplication } from "@/lib/driver-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "motion/react";
import { useMotionSystem } from "@/motion/use-motion";
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
  placement = "top",
  compact = false,
}: {
  children?: ReactNode;
  placement?: "top" | "bottom";
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [driverCapability, setDriverCapability] = useState<
    { hasAccess: boolean; destination: string; label: string; status: "approved" | "pending" | "rejected" | "none" } | null
  >(null);
  const [checking, setChecking] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { popover, reduced } = useMotionSystem();

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

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const sessionUser = (session as unknown as {
    user?: { role?: string };
  } | null)?.user;
  const isAdmin = sessionUser?.role === "admin";

  if (isPending || checking) {
    return compact ? (
      <Button variant="ghost" size="sm" className="h-11 w-11 p-0" disabled aria-label="Switch account">
        <UserIcon className="h-4 w-4" />
        <span className="sr-only">Switch account</span>
      </Button>
    ) : (
      <>{children}</>
    )
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
        className={compact ? "h-11 w-11 p-0" : "gap-1 h-8"}
        aria-label={compact ? "Switch account" : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen(!isOpen)}
      >
        <UserIcon className="h-4 w-4" />
        {compact ? null : <span className="text-[13px] font-medium">Switch account</span>}
        {compact ? null : <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduced ? false : "hidden"}
            animate={reduced ? undefined : "visible"}
            exit={reduced ? undefined : "exit"}
            variants={popover}
            role="menu"
            className={`absolute z-50 min-w-[14rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${placement === "bottom" ? "right-0 top-full mt-1 max-w-[calc(100vw-2rem)]" : "left-0 bottom-full mb-1"}`}
          >
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Switch context
          </div>
          <hr className="my-1 border-border" />
          {availableContexts.map((ctx) => (
            <Button
              key={ctx.id}
              variant="ghost"
              className="w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-sm"
              onClick={() => {
                navigate(ctx.destination);
                setIsOpen(false);
              }}
            >
              <ctx.icon className="h-4 w-4" />
              <span className="flex-1 text-left">
                {ctx.label}
                {ctx.id === "driver" && (
                  <>
                    {driverCapability?.status === "pending" && (
                      <Badge variant="secondary" className="ml-2 text-[9px]">
                        Pending
                      </Badge>
                    )}
                    {driverCapability?.status === "rejected" && (
                      <Badge variant="destructive" className="ml-2 text-[9px]">
                        Rejected
                      </Badge>
                    )}
                    {driverCapability?.status === "approved" && (
                      <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-drio-success" />
                    )}
                  </>
                )}
              </span>
            </Button>
          ))}
          <hr className="my-1 border-border" />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive"
            onClick={async () => {
              setIsOpen(false);
              await authClient.signOut({
                disableRedirect: false,
                callbackURL: "/login",
              });
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}